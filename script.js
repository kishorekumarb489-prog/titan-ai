if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const GOOGLE_CLIENT_ID = "1027901085880-ltncq1or8f5lupuvnd7g1ea8uq4ierf9.apps.googleusercontent.com";

// Screens
const authScreen = document.getElementById('authScreen');
const mainScreen = document.getElementById('mainScreen');
const liveScreen = document.getElementById('liveScreen');

// User Profile Elements
const userInitialBadge = document.getElementById('userInitialBadge');
const userProfileImg = document.getElementById('userProfileImg');
const userGreetingName = document.getElementById('userGreetingName');
const profileToggleBtn = document.getElementById('profileToggleBtn');
const guestBtn = document.getElementById('guestBtn');

// Chat & Canvas Elements
const centerGreetingCanvas = document.getElementById('centerGreetingCanvas');
const chatViewport = document.getElementById('chatViewport');
const userInput = document.getElementById('userInput');
const newChatBtn = document.getElementById('newChatBtn');
const geminiLiveBtn = document.getElementById('geminiLiveBtn');
const micBtn = document.getElementById('micBtn');
const camSnapBtn = document.getElementById('camSnapBtn');

// Attachment Elements
const attachBtn = document.getElementById('attachBtn');
const filePicker = document.getElementById('filePicker');
const attachmentBar = document.getElementById('attachmentBar');
const fileIcon = document.getElementById('fileIcon');
const fileName = document.getElementById('fileName');
const fileStatus = document.getElementById('fileStatus');
const removeFileBtn = document.getElementById('removeFileBtn');

// Gemini Live Elements
const liveCamVideo = document.getElementById('liveCamVideo');
const liveCamCanvas = document.getElementById('liveCamCanvas');
const liveOrb = document.getElementById('liveOrb');
const liveTranscriptText = document.getElementById('liveTranscriptText');
const liveStatusText = document.getElementById('liveStatusText');
const liveBackBtn = document.getElementById('liveBackBtn');
const liveCamToggleBtn = document.getElementById('liveCamToggleBtn');
const liveMuteBtn = document.getElementById('liveMuteBtn');
const muteIcon = document.getElementById('muteIcon');
const livePauseBtn = document.getElementById('livePauseBtn');
const pauseIcon = document.getElementById('pauseIcon');
const liveInterruptBtn = document.getElementById('liveInterruptBtn');
const liveEndBtn = document.getElementById('liveEndBtn');

// State Variables
let attachedFile = null;
let liveStream = null;
let isCameraActive = false;
let isLiveSessionRunning = false;
let isMuted = false;
let isPaused = false;
let liveAbortController = null;
let currentChatId = Date.now().toString();
let chats = JSON.parse(localStorage.getItem('titan_ai_sessions') || '{}');

function showScreen(screen) {
  [authScreen, mainScreen, liveScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// 1. GOOGLE IDENTITY AUTHENTICATION
function parseJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
  } catch {
    return null;
  }
}

window.handleCredentialResponse = function(response) {
  const user = parseJwt(response.credential);
  if (user) {
    const profile = { name: user.name, picture: user.picture };
    localStorage.setItem('titan_user_profile', JSON.stringify(profile));
    applyUserProfile(profile);
    showScreen(mainScreen);
  }
};

function applyUserProfile(user) {
  const fullName = user.name || 'User';
  const firstName = fullName.split(' ')[0];
  userGreetingName.innerText = firstName;

  if (user.picture) {
    userProfileImg.src = user.picture;
    userProfileImg.style.display = 'block';
    userInitialBadge.style.display = 'none';
  } else {
    userInitialBadge.innerText = firstName.charAt(0).toUpperCase();
    userInitialBadge.style.display = 'block';
    userProfileImg.style.display = 'none';
  }
}

guestBtn.addEventListener('click', () => {
  applyUserProfile({ name: 'Guest' });
  showScreen(mainScreen);
});

profileToggleBtn.addEventListener('click', () => {
  if (confirm("Sign out of Titan AI?")) {
    localStorage.removeItem('titan_user_profile');
    showScreen(authScreen);
  }
});

window.onload = function() {
  const savedUser = localStorage.getItem('titan_user_profile');
  if (savedUser) {
    applyUserProfile(JSON.parse(savedUser));
    showScreen(mainScreen);
  } else {
    showScreen(authScreen);
  }

  if (window.google?.accounts?.id) {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });
    google.accounts.id.renderButton(
      document.getElementById('googleLandingBtn'),
      { theme: 'filled_blue', size: 'large', shape: 'pill' }
    );
  }
};

// 2. DOCUMENT & FILE PARSER (PDF, DOCX, TXT, IMAGES)
async function parsePDF(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let fullText = '';
  for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 30); pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    fullText += `\n[Page ${pageNum}]\n` + textContent.items.map(item => item.str).join(' ');
  }
  return fullText;
}

async function parseDOCX(arrayBuffer) {
  if (window.mammoth) {
    const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
    return result.value;
  }
  return "DOCX reader not loaded.";
}

attachBtn.addEventListener('click', () => filePicker.click());
camSnapBtn.addEventListener('click', () => filePicker.click());

filePicker.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  attachmentBar.style.display = 'block';
  fileName.innerText = file.name;
  fileStatus.innerText = "Extracting...";

  try {
    if (ext === 'pdf') {
      fileIcon.innerText = '📕';
      const arrayBuffer = await file.arrayBuffer();
      const extracted = await parsePDF(arrayBuffer);
      attachedFile = { type: 'doc', name: file.name, content: extracted.slice(0, 30000) };
    } else if (ext === 'docx' || ext === 'doc') {
      fileIcon.innerText = '📘';
      const arrayBuffer = await file.arrayBuffer();
      const extracted = await parseDOCX(arrayBuffer);
      attachedFile = { type: 'doc', name: file.name, content: extracted.slice(0, 30000) };
    } else if (file.type.startsWith('image/')) {
      fileIcon.innerText = '🖼️';
      const base64 = await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.readAsDataURL(file);
      });
      attachedFile = { type: 'image', name: file.name, content: base64 };
    } else {
      fileIcon.innerText = '📄';
      const text = await file.text();
      attachedFile = { type: 'doc', name: file.name, content: text.slice(0, 30000) };
    }

    fileStatus.innerText = "Ready";
    userInput.focus();
  } catch (err) {
    fileStatus.innerText = "Error";
    alert(`File parsing failed: ${err.message}`);
  }
});

removeFileBtn.addEventListener('click', () => {
  attachedFile = null;
  filePicker.value = '';
  attachmentBar.style.display = 'none';
});

// 3. CONTINUOUS SPEECH RECOGNITION (AUTO BARGE-IN)
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onspeechstart = () => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      liveStatusText.innerText = "Interrupted • Listening...";
    }
  };

  recognition.onresult = async (event) => {
    const speech = event.results[0][0].transcript;
    if (speech.trim() && !isPaused && !isMuted) {
      if (isLiveSessionRunning) {
        liveTranscriptText.innerText = `"${speech}"`;
        await handleLiveExchange(speech);
      } else {
        userInput.value = speech;
        handleSend();
      }
    }
  };

  recognition.onend = () => {
    if (isLiveSessionRunning && !isPaused && !isMuted && !window.speechSynthesis.speaking) {
      setTimeout(() => {
        if (isLiveSessionRunning && !isPaused && !isMuted) {
          try { recognition.start(); } catch (e) {}
        }
      }, 350);
    }
  };
}

// 4. GEMINI LIVE FULLSCREEN ENGINE
async function startGeminiLive(withCamera = false) {
  isLiveSessionRunning = true;
  isPaused = false;
  isMuted = false;
  muteIcon.innerText = "🎙️";
  pauseIcon.innerText = "⏸️";

  showScreen(liveScreen);
  liveTranscriptText.innerText = "Listening to you... Speak naturally";

  if (withCamera) await enableLiveCamera();
  else disableLiveCamera();

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  try { recognition && recognition.start(); } catch (e) {}
}

async function enableLiveCamera() {
  try {
    liveStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    liveCamVideo.srcObject = liveStream;
    liveCamVideo.style.display = 'block';
    liveOrb.style.display = 'none';
    isCameraActive = true;
  } catch {
    alert("Camera permission not granted.");
  }
}

function disableLiveCamera() {
  if (liveStream) {
    liveStream.getTracks().forEach(t => t.stop());
    liveStream = null;
  }
  liveCamVideo.style.display = 'none';
  liveOrb.style.display = 'block';
  isCameraActive = false;
}

liveCamToggleBtn.addEventListener('click', () => {
  if (isCameraActive) disableLiveCamera();
  else enableLiveCamera();
});

function captureCameraFrame() {
  if (!isCameraActive || !liveCamVideo.videoWidth) return null;
  liveCamCanvas.width = liveCamVideo.videoWidth;
  liveCamCanvas.height = liveCamVideo.videoHeight;
  const ctx = liveCamCanvas.getContext('2d');
  ctx.drawImage(liveCamVideo, 0, 0);
  return liveCamCanvas.toDataURL('image/jpeg', 0.7);
}

function endGeminiLive() {
  isLiveSessionRunning = false;
  disableLiveCamera();
  if (liveAbortController) liveAbortController.abort();
  if (recognition) recognition.stop();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  showScreen(mainScreen);
}

geminiLiveBtn.addEventListener('click', () => startGeminiLive(false));
liveBackBtn.addEventListener('click', endGeminiLive);
liveEndBtn.addEventListener('click', endGeminiLive);

liveInterruptBtn.addEventListener('click', () => {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (liveAbortController) liveAbortController.abort();
  liveTranscriptText.innerText = "Interrupted! Listening to you...";
  if (!isPaused && !isMuted) {
    try { recognition && recognition.start(); } catch (e) {}
  }
});

liveMuteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  if (isMuted) {
    if (recognition) recognition.stop();
    muteIcon.innerText = "🔇";
    liveStatusText.innerText = "Microphone Muted";
  } else {
    muteIcon.innerText = "🎙️";
    liveStatusText.innerText = "Live Listening";
    if (!isPaused && !window.speechSynthesis.speaking) {
      try { recognition && recognition.start(); } catch (e) {}
    }
  }
});

livePauseBtn.addEventListener('click', () => {
  isPaused = !isPaused;
  if (isPaused) {
    if (recognition) recognition.stop();
    if (window.speechSynthesis) window.speechSynthesis.pause();
    pauseIcon.innerText = "▶️";
    liveStatusText.innerText = "Session Paused";
  } else {
    pauseIcon.innerText = "⏸️";
    liveStatusText.innerText = "Live Listening";
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else if (!window.speechSynthesis.speaking && !isMuted) {
      try { recognition && recognition.start(); } catch (e) {}
    }
  }
});

// 5. LIVE MULTIMODAL EXCHANGE
async function handleLiveExchange(userSpeech) {
  if (liveAbortController) liveAbortController.abort();
  liveAbortController = new AbortController();

  const photoFrame = captureCameraFrame();
  let prompt = userSpeech;
  if (photoFrame) {
    prompt = `[Live Camera Viewfinder Active]\nUser says: ${userSpeech}`;
  }

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: userSpeech.slice(0, 20), messages: [] };
  }
  chats[currentChatId].messages.push({ role: 'user', content: prompt });

  liveStatusText.innerText = "Titan Thinking...";

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chats[currentChatId].messages }),
      signal: liveAbortController.signal
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            if (data.text) {
              accumulated += data.text;
              liveTranscriptText.innerHTML = marked.parse(accumulated);
            }
          } catch (e) {}
        }
      }
    }

    chats[currentChatId].messages.push({ role: 'assistant', content: accumulated });
    speakLiveResponse(accumulated);

  } catch (err) {
    if (err.name !== 'AbortError') {
      liveTranscriptText.innerText = "Listening again...";
      if (!isPaused && !isMuted) {
        try { recognition && recognition.start(); } catch (e) {}
      }
    }
  }
}

function speakLiveResponse(text) {
  if (!window.speechSynthesis || isPaused) return;
  window.speechSynthesis.cancel();

  const clean = text.replace(/[*#`_~]/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 1.05;

  utterance.onstart = () => { liveStatusText.innerText = "Titan Speaking..."; };
  utterance.onend = () => {
    if (isLiveSessionRunning && !isPaused && !isMuted) {
      liveStatusText.innerText = "Live Listening";
      liveTranscriptText.innerText = "Listening to you...";
      try { recognition && recognition.start(); } catch (e) {}
    }
  };

  window.speechSynthesis.speak(utterance);
}

// 6. MAIN CHAT HANDLER
async function handleSend() {
  const text = userInput.value.trim();
  if (!text && !attachedFile) return;

  centerGreetingCanvas.style.display = 'none';
  chatViewport.style.display = 'flex';

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: (attachedFile ? attachedFile.name : text).slice(0, 20), messages: [] };
  }

  let prompt = text;
  if (attachedFile) {
    if (attachedFile.type === 'doc') {
      prompt = `[Document: ${attachedFile.name}]\n\`\`\`text\n${attachedFile.content}\n\`\`\`\n\nPrompt:\n${text || 'Summarize this file.'}`;
    } else {
      prompt = `[Image Attached: ${attachedFile.name}]\n${text || 'Analyze this image.'}`;
    }
  }

  appendBubble(text || `Uploaded: ${attachedFile?.name}`, 'user');
  chats[currentChatId].messages.push({ role: 'user', content: prompt });

  userInput.value = '';
  if (removeFileBtn) removeFileBtn.click();

  const botBox = appendBubble('...', 'bot');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chats[currentChatId].messages })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            if (data.text) {
              accumulated += data.text;
              botBox.innerHTML = marked.parse(accumulated);
              chatViewport.scrollTop = chatViewport.scrollHeight;
            }
          } catch {}
        }
      }
    }
    chats[currentChatId].messages.push({ role: 'assistant', content: accumulated });
    localStorage.setItem('titan_ai_sessions', JSON.stringify(chats));
  } catch {
    botBox.innerHTML = '⚠️ Connection error with AI engine.';
  }
}

function appendBubble(text, role) {
  const row = document.createElement('div');
  row.className = `chat-row ${role}`;
  const box = document.createElement('div');
  box.className = role === 'user' ? 'user-msg-bubble' : 'bot-msg-bubble';
  box.innerHTML = text;
  row.appendChild(box);
  chatViewport.appendChild(row);
  chatViewport.scrollTop = chatViewport.scrollHeight;
  return box;
}

newChatBtn.addEventListener('click', () => {
  currentChatId = Date.now().toString();
  chats[currentChatId] = { title: 'New Chat', messages: [] };
  chatViewport.innerHTML = '';
  chatViewport.style.display = 'none';
  centerGreetingCanvas.style.display = 'flex';
});

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSend();
});

micBtn.addEventListener('click', () => {
  try { recognition && recognition.start(); } catch {}
});