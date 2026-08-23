// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

// PDF.js Worker Configuration
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const GOOGLE_CLIENT_ID = "1027901085880-ltncq1or8f5lupuvnd7g1ea8uq4ierf9.apps.googleusercontent.com";

// Screen Elements
const authScreen = document.getElementById('authScreen');
const homeScreen = document.getElementById('homeScreen');
const chatScreen = document.getElementById('chatScreen');
const liveScreen = document.getElementById('liveScreen');

// User Elements
const greetingSub = document.getElementById('greetingSub');
const homeUserName = document.getElementById('homeUserName');
const homeUserAvatar = document.getElementById('homeUserAvatar');
const guestBtn = document.getElementById('guestBtn');
const logoutBtn = document.getElementById('logoutBtn');

// Dashboard & Bento Triggers
const homeOrbTrigger = document.getElementById('homeOrbTrigger');
const cardLiveGemini = document.getElementById('cardLiveGemini');
const cardChatAI = document.getElementById('cardChatAI');
const cardLiveVision = document.getElementById('cardLiveVision');
const cardDeepReason = document.getElementById('cardDeepReason');
const homeSearchTrigger = document.getElementById('homeSearchTrigger');

// Smart Chat Elements
const chatViewport = document.getElementById('chatViewport');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const chatBackBtn = document.getElementById('chatBackBtn');
const newChatTopBtn = document.getElementById('newChatTopBtn');
const deckLiveBtn = document.getElementById('deckLiveBtn');
const deckUploadDocBtn = document.getElementById('deckUploadDocBtn');
const deckReasonBtn = document.getElementById('deckReasonBtn');

// File Upload Elements
const attachBtn = document.getElementById('attachBtn');
const filePicker = document.getElementById('filePicker');
const attachmentBar = document.getElementById('attachmentBar');
const fileIcon = document.getElementById('fileIcon');
const fileName = document.getElementById('fileName');
const fileStatusBadge = document.getElementById('fileStatusBadge');
const removeFileBtn = document.getElementById('removeFileBtn');

// Gemini Live Multimodal Elements
const liveCamVideo = document.getElementById('liveCamVideo');
const liveCamCanvas = document.getElementById('liveCamCanvas');
const liveOrbElement = document.getElementById('liveOrbElement');
const liveTranscriptText = document.getElementById('liveTranscriptText');
const liveStatusText = document.getElementById('liveStatusText');
const livePulseDot = document.getElementById('livePulseDot');

const liveBackBtn = document.getElementById('liveBackBtn');
const liveToggleCamBtn = document.getElementById('liveToggleCamBtn');
const liveMuteBtn = document.getElementById('liveMuteBtn');
const muteIcon = document.getElementById('muteIcon');
const livePauseBtn = document.getElementById('livePauseBtn');
const pauseIcon = document.getElementById('pauseIcon');
const liveInterruptBtn = document.getElementById('liveInterruptBtn');
const liveEndBtn = document.getElementById('liveEndBtn');

// State Variables
let liveStream = null;
let isCameraActive = false;
let isLiveSessionRunning = false;
let isMuted = false;
let isPaused = false;
let liveAbortController = null;
let attachedFile = null;
let currentChatId = Date.now().toString();
let chats = JSON.parse(localStorage.getItem('titan_ai_sessions') || '{}');

function showScreen(screen) {
  [authScreen, homeScreen, chatScreen, liveScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// 1. MANDATORY GOOGLE AUTH GATE
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
    showScreen(homeScreen);
  }
};

function applyUserProfile(user) {
  const firstName = user.name ? user.name.split(' ')[0] : 'User';
  greetingSub.innerText = `Hi ${firstName},`;
  homeUserName.innerText = user.name || 'Titan User';
  if (user.picture) homeUserAvatar.src = user.picture;
}

guestBtn.addEventListener('click', () => {
  applyUserProfile({ name: 'Guest User', picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Guest' });
  showScreen(homeScreen);
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('titan_user_profile');
  showScreen(authScreen);
});

window.onload = function() {
  const savedUser = localStorage.getItem('titan_user_profile');
  if (savedUser) {
    applyUserProfile(JSON.parse(savedUser));
    showScreen(homeScreen);
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

// 2. DOCUMENT PARSERS (PDF, DOCX, TXT, IMAGES)
async function parsePDF(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let fullText = '';
  for (let pageNum = 1; pageNum <= Math.min(pdf.numPages, 30); pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += `\n[Page ${pageNum}]\n` + pageText;
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
if (deckUploadDocBtn) deckUploadDocBtn.addEventListener('click', () => filePicker.click());

filePicker.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  attachmentBar.style.display = 'block';
  fileName.innerText = file.name;
  fileStatusBadge.innerText = "Extracting...";
  fileStatusBadge.className = "file-status parsing";
  sendBtn.disabled = true;

  try {
    if (ext === 'pdf') {
      fileIcon.innerText = '📕';
      const arrayBuffer = await file.arrayBuffer();
      const extractedText = await parsePDF(arrayBuffer);
      attachedFile = {
        type: 'pdf',
        name: file.name,
        content: extractedText.slice(0, 30000)
      };
    } else if (ext === 'docx' || ext === 'doc') {
      fileIcon.innerText = '📘';
      const arrayBuffer = await file.arrayBuffer();
      const extractedText = await parseDOCX(arrayBuffer);
      attachedFile = {
        type: 'docx',
        name: file.name,
        content: extractedText.slice(0, 30000)
      };
    } else if (file.type.startsWith('image/')) {
      fileIcon.innerText = '🖼️';
      const base64 = await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.readAsDataURL(file);
      });
      attachedFile = {
        type: 'image',
        name: file.name,
        content: base64
      };
    } else {
      // Code, TXT, CSV, JSON
      fileIcon.innerText = '📄';
      const text = await file.text();
      attachedFile = {
        type: 'text',
        name: file.name,
        content: text.slice(0, 30000)
      };
    }

    fileStatusBadge.innerText = "Ready";
    fileStatusBadge.className = "file-status ready";
    sendBtn.disabled = false;
    if (!userInput.value.trim()) {
      userInput.value = `Summarize and analyze the main insights from ${file.name}`;
      userInput.focus();
    }
  } catch (err) {
    fileStatusBadge.innerText = "Failed";
    fileStatusBadge.className = "file-status error";
    alert(`Could not parse document: ${err.message}`);
  }
});

removeFileBtn.addEventListener('click', () => {
  attachedFile = null;
  filePicker.value = '';
  attachmentBar.style.display = 'none';
  sendBtn.disabled = !userInput.value.trim();
});

// 3. CONTINUOUS SPEECH RECOGNITION (WITH AUTO-BARGE-IN)
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
      livePulseDot.style.background = "#38bdf8";
    }
  };

  recognition.onstart = () => {
    if (!isPaused && !isMuted) {
      liveStatusText.innerText = "Listening...";
      livePulseDot.style.background = "#22c55e";
    }
  };

  recognition.onresult = async (event) => {
    const speech = event.results[0][0].transcript;
    if (speech.trim() && !isPaused && !isMuted) {
      if (isLiveSessionRunning) {
        liveTranscriptText.innerText = `"${speech}"`;
        await handleLiveStreamingExchange(speech);
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

// 4. LIVE CAMERA STREAM CONTROLS
async function enableLiveCamera() {
  try {
    liveStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    liveCamVideo.srcObject = liveStream;
    liveCamVideo.style.display = 'block';
    liveOrbElement.style.display = 'none';
    isCameraActive = true;
    liveToggleCamBtn.classList.add('btn-active-state');
  } catch (err) {
    alert("Camera permission denied or unavailable.");
  }
}

function disableLiveCamera() {
  if (liveStream) {
    liveStream.getTracks().forEach(t => t.stop());
    liveStream = null;
  }
  liveCamVideo.style.display = 'none';
  liveOrbElement.style.display = 'block';
  isCameraActive = false;
  liveToggleCamBtn.classList.remove('btn-active-state');
}

liveToggleCamBtn.addEventListener('click', () => {
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

// 5. START & END GEMINI LIVE SESSION
async function startGeminiLive(withCamera = false) {
  isLiveSessionRunning = true;
  isPaused = false;
  isMuted = false;
  
  muteIcon.innerText = "🎙️";
  liveMuteBtn.classList.remove('btn-active-state');
  pauseIcon.innerText = "⏸️";
  livePauseBtn.classList.remove('btn-pause-state');

  showScreen(liveScreen);
  liveTranscriptText.innerText = "Titan is ready. Start speaking...";

  if (withCamera) await enableLiveCamera();
  else disableLiveCamera();

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  try { recognition && recognition.start(); } catch (e) {}
}

function endGeminiLive() {
  isLiveSessionRunning = false;
  disableLiveCamera();
  if (liveAbortController) liveAbortController.abort();
  if (recognition) recognition.stop();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  showScreen(homeScreen);
}

liveEndBtn.addEventListener('click', endGeminiLive);
liveBackBtn.addEventListener('click', endGeminiLive);

// 6. INTERRUPT, MUTE & PAUSE CONTROLS
liveInterruptBtn.addEventListener('click', () => {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  if (liveAbortController) liveAbortController.abort();
  
  liveTranscriptText.innerText = "Interrupted! Listening to you...";
  liveStatusText.innerText = "Ready • Speak now";
  livePulseDot.style.background = "#a855f7";

  if (!isPaused && !isMuted) {
    try { recognition && recognition.start(); } catch (e) {}
  }
});

liveMuteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  if (isMuted) {
    if (recognition) recognition.stop();
    muteIcon.innerText = "🔇";
    liveMuteBtn.classList.add('btn-active-state');
    liveStatusText.innerText = "Microphone Muted";
    livePulseDot.style.background = "#ef4444";
  } else {
    muteIcon.innerText = "🎙️";
    liveMuteBtn.classList.remove('btn-active-state');
    liveStatusText.innerText = "Listening...";
    livePulseDot.style.background = "#22c55e";
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
    livePauseBtn.classList.add('btn-pause-state');
    liveStatusText.innerText = "Session Paused";
    livePulseDot.style.background = "#eab308";
  } else {
    pauseIcon.innerText = "⏸️";
    livePauseBtn.classList.remove('btn-pause-state');
    liveStatusText.innerText = "Resumed";
    livePulseDot.style.background = "#22c55e";
    
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    } else if (!window.speechSynthesis.speaking && !isMuted) {
      try { recognition && recognition.start(); } catch (e) {}
    }
  }
});

// 7. MULTIMODAL EXCHANGE DISPATCH
async function handleLiveStreamingExchange(userSpeech) {
  if (liveAbortController) liveAbortController.abort();
  liveAbortController = new AbortController();

  const photoFrame = captureCameraFrame();
  let contentPayload = userSpeech;
  if (photoFrame) {
    contentPayload = `[Live Camera Attached]\nUser says: ${userSpeech}`;
  }

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: userSpeech.slice(0, 20), messages: [] };
  }
  chats[currentChatId].messages.push({ role: 'user', content: contentPayload });

  liveStatusText.innerText = "Titan Thinking...";
  livePulseDot.style.background = "#a855f7";

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
      liveTranscriptText.innerText = "Re-listening...";
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

  utterance.onstart = () => {
    liveStatusText.innerText = "Titan Speaking...";
    livePulseDot.style.background = "#ec4899";
  };

  utterance.onend = () => {
    if (isLiveSessionRunning && !isPaused && !isMuted) {
      liveStatusText.innerText = "Listening...";
      livePulseDot.style.background = "#22c55e";
      liveTranscriptText.innerText = "Listening to you...";
      try { recognition && recognition.start(); } catch (e) {}
    }
  };

  window.speechSynthesis.speak(utterance);
}

// 8. SMART CHAT & DOCUMENT QUERY DISPATCH
async function handleSend() {
  const text = userInput.value.trim();
  if (!text && !attachedFile) return;

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: (attachedFile ? attachedFile.name : text).slice(0, 20), messages: [] };
  }

  let prompt = text;
  if (attachedFile) {
    if (attachedFile.type === 'pdf' || attachedFile.type === 'docx' || attachedFile.type === 'text') {
      prompt = `[Document Attached: ${attachedFile.name}]\n\`\`\`text\n${attachedFile.content}\n\`\`\`\n\nUser Question/Instruction:\n${text || 'Provide a detailed overview and key takeaways from this document.'}`;
    } else if (attachedFile.type === 'image') {
      prompt = `[Image Attached: ${attachedFile.name}]\n${text || 'Describe and analyze this image.'}`;
    }
  }

  appendBubble(text || `Uploaded: ${attachedFile?.name}`, 'user');
  chats[currentChatId].messages.push({ role: 'user', content: prompt });

  userInput.value = '';
  userInput.style.height = 'auto';
  if (removeFileBtn) removeFileBtn.click();

  const botBox = appendBubble('Titan is thinking & analyzing...', 'bot');

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
    botBox.innerHTML = '⚠️ Error connecting to AI endpoint.';
  }
}

function appendBubble(text, role) {
  const row = document.createElement('div');
  row.className = `chat-bubble-row ${role}`;
  const box = document.createElement('div');
  box.className = role === 'user' ? 'user-bubble-box' : 'bot-bubble-box';
  box.innerHTML = text;
  row.appendChild(box);
  chatViewport.appendChild(row);
  chatViewport.scrollTop = chatViewport.scrollHeight;
  return box;
}

// Navigation Triggers
homeOrbTrigger.addEventListener('click', () => startGeminiLive(false));
cardLiveGemini.addEventListener('click', () => startGeminiLive(false));
cardLiveVision.addEventListener('click', () => startGeminiLive(true));
cardChatAI.addEventListener('click', () => { showScreen(chatScreen); userInput.focus(); });
cardDeepReason.addEventListener('click', () => {
  showScreen(chatScreen);
  userInput.value = "Think step-by-step with deep reasoning: ";
  userInput.focus();
});

homeSearchTrigger.addEventListener('click', () => { showScreen(chatScreen); userInput.focus(); });
deckLiveBtn.addEventListener('click', () => startGeminiLive(false));
deckReasonBtn.addEventListener('click', () => {
  userInput.value = "Think step-by-step with deep reasoning: ";
  userInput.focus();
});

chatBackBtn.addEventListener('click', () => showScreen(homeScreen));
newChatTopBtn.addEventListener('click', () => {
  currentChatId = Date.now().toString();
  chats[currentChatId] = { title: 'New Chat', messages: [] };
  chatViewport.innerHTML = '';
});

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) handleSend();
  }
});

userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 90) + 'px';
  sendBtn.disabled = !userInput.value.trim() && !attachedFile;
});

micBtn.addEventListener('click', () => {
  try { recognition && recognition.start(); } catch {}
});