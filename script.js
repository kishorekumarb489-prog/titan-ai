if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const GOOGLE_CLIENT_ID = "1027901085880-ltncq1or8f5lupuvnd7g1ea8uq4ierf9.apps.googleusercontent.com";

// Screens
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

// Dashboard & Triggers
const homeOrbTrigger = document.getElementById('homeOrbTrigger');
const cardLiveGemini = document.getElementById('cardLiveGemini');
const cardChatAI = document.getElementById('cardChatAI');
const cardLiveVision = document.getElementById('cardLiveVision');
const cardDeepReason = document.getElementById('cardDeepReason');
const homeSearchTrigger = document.getElementById('homeSearchTrigger');

// Chat Elements
const chatViewport = document.getElementById('chatViewport');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const chatBackBtn = document.getElementById('chatBackBtn');
const newChatTopBtn = document.getElementById('newChatTopBtn');
const deckLiveBtn = document.getElementById('deckLiveBtn');
const deckReasonBtn = document.getElementById('deckReasonBtn');
const attachBtn = document.getElementById('attachBtn');
const filePicker = document.getElementById('filePicker');
const attachmentBar = document.getElementById('attachmentBar');
const fileName = document.getElementById('fileName');
const removeFileBtn = document.getElementById('removeFileBtn');

// Gemini Live Elements
const liveCamVideo = document.getElementById('liveCamVideo');
const liveCamCanvas = document.getElementById('liveCamCanvas');
const liveOrbElement = document.getElementById('liveOrbElement');
const liveTranscriptText = document.getElementById('liveTranscriptText');
const liveBackBtn = document.getElementById('liveBackBtn');
const toggleCameraFeedBtn = document.getElementById('toggleCameraFeedBtn');
const endLiveSessionBtn = document.getElementById('endLiveSessionBtn');

let liveStream = null;
let isCameraActive = false;
let isLiveSessionRunning = false;
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

// 2. GEMINI LIVE CONTINUOUS VOICE + CAMERA ENGINE
async function startGeminiLive(withCamera = false) {
  isLiveSessionRunning = true;
  showScreen(liveScreen);
  liveTranscriptText.innerText = "Listening to you... Speak anytime.";

  if (withCamera) {
    await enableLiveCamera();
  }

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  startContinuousRecognition();
}

async function enableLiveCamera() {
  try {
    liveStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    liveCamVideo.srcObject = liveStream;
    liveCamVideo.style.display = 'block';
    liveOrbElement.style.display = 'none';
    isCameraActive = true;
  } catch {
    alert("Camera permission denied.");
  }
}

function stopLiveCamera() {
  if (liveStream) {
    liveStream.getTracks().forEach(t => t.stop());
    liveStream = null;
  }
  liveCamVideo.style.display = 'none';
  liveOrbElement.style.display = 'block';
  isCameraActive = false;
}

toggleCameraFeedBtn.addEventListener('click', () => {
  if (isCameraActive) stopLiveCamera();
  else enableLiveCamera();
});

function captureCameraFrame() {
  if (!isCameraActive || !liveCamVideo.videoWidth) return null;
  liveCamCanvas.width = liveCamVideo.videoWidth;
  liveCamCanvas.height = liveCamVideo.videoHeight;
  const ctx = liveCamCanvas.getContext('2d');
  ctx.drawImage(liveCamVideo, 0, 0);
  return liveCamCanvas.toDataURL('image/jpeg', 0.6);
}

function stopGeminiLive() {
  isLiveSessionRunning = false;
  stopLiveCamera();
  if (recognition) recognition.stop();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  showScreen(homeScreen);
}

endLiveSessionBtn.addEventListener('click', stopGeminiLive);
liveBackBtn.addEventListener('click', stopGeminiLive);

// 3. CONTINUOUS SPEECH RECOGNITION & DISPATCH
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = async (e) => {
    const speech = e.results[0][0].transcript;
    if (speech.trim()) {
      if (isLiveSessionRunning) {
        liveTranscriptText.innerText = `"${speech}"`;
        await handleLiveSend(speech);
      } else {
        userInput.value = speech;
        handleSend();
      }
    }
  };

  recognition.onend = () => {
    if (isLiveSessionRunning && !window.speechSynthesis.speaking) {
      setTimeout(() => {
        if (isLiveSessionRunning) startContinuousRecognition();
      }, 300);
    }
  };
}

function startContinuousRecognition() {
  try { recognition && recognition.start(); } catch {}
}

async function handleLiveSend(userSpeech) {
  const frame = captureCameraFrame();
  let prompt = userSpeech;
  if (frame) {
    prompt = `[Live Camera Viewfinder Active]\nUser says: ${userSpeech}`;
  }

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: userSpeech.slice(0, 20), messages: [] };
  }
  chats[currentChatId].messages.push({ role: 'user', content: prompt });

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
              liveTranscriptText.innerHTML = marked.parse(accumulated);
            }
          } catch {}
        }
      }
    }

    chats[currentChatId].messages.push({ role: 'assistant', content: accumulated });
    speakLiveTTS(accumulated);

  } catch {
    liveTranscriptText.innerText = "Connection error. Trying again...";
    startContinuousRecognition();
  }
}

function speakLiveTTS(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*#`_~]/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.onend = () => {
    if (isLiveSessionRunning) {
      liveTranscriptText.innerText = "Listening again...";
      startContinuousRecognition();
    }
  };
  window.speechSynthesis.speak(utterance);
}

// 4. SMART CHAT DISPATCH
async function handleSend() {
  const text = userInput.value.trim();
  if (!text && !attachedFile) return;

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: text.slice(0, 20) || 'AI Chat', messages: [] };
  }

  let prompt = text;
  if (attachedFile) prompt = `[File: ${attachedFile.name}]\n${text}`;

  appendBubble(text || `Attached: ${attachedFile?.name}`, 'user');
  chats[currentChatId].messages.push({ role: 'user', content: prompt });

  userInput.value = '';
  userInput.style.height = 'auto';
  if (removeFileBtn) removeFileBtn.click();

  const botBox = appendBubble('Titan is thinking...', 'bot');

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

// Event Listeners
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

// File Attach
attachBtn.addEventListener('click', () => filePicker.click());
filePicker.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    attachedFile = { name: file.name, content: reader.result };
    fileName.innerText = file.name;
    attachmentBar.style.display = 'block';
    sendBtn.disabled = false;
  };
  reader.readAsText(file);
});

removeFileBtn.addEventListener('click', () => {
  attachedFile = null;
  filePicker.value = '';
  attachmentBar.style.display = 'none';
  sendBtn.disabled = !userInput.value.trim();
});