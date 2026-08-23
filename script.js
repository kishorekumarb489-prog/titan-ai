if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const GOOGLE_CLIENT_ID = "1027901085880-ltncq1or8f5lupuvnd7g1ea8uq4ierf9.apps.googleusercontent.com";

// Elements
const homeScreen = document.getElementById('homeScreen');
const chatScreen = document.getElementById('chatScreen');
const voiceScreen = document.getElementById('voiceScreen');
const homeUserName = document.getElementById('homeUserName');
const homeUserAvatar = document.getElementById('homeUserAvatar');
const homeSearchTrigger = document.getElementById('homeSearchTrigger');
const cardNewChat = document.getElementById('cardNewChat');
const cardCameraVision = document.getElementById('cardCameraVision');
const cardVoiceLive = document.getElementById('cardVoiceLive');
const cardDeepResearch = document.getElementById('cardDeepResearch');
const homeRecentHistoryList = document.getElementById('homeRecentHistoryList');

const chatViewport = document.getElementById('chatViewport');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const chatBackBtn = document.getElementById('chatBackBtn');
const newChatTopBtn = document.getElementById('newChatTopBtn');
const deckVoiceModeBtn = document.getElementById('deckVoiceModeBtn');
const deckCameraBtn = document.getElementById('deckCameraBtn');
const deckReasoningBtn = document.getElementById('deckReasoningBtn');
const camActionBtn = document.getElementById('camActionBtn');

const attachBtn = document.getElementById('attachBtn');
const filePicker = document.getElementById('filePicker');
const attachmentBar = document.getElementById('attachmentBar');
const fileName = document.getElementById('fileName');
const removeFileBtn = document.getElementById('removeFileBtn');

const voiceBackBtn = document.getElementById('voiceBackBtn');
const voiceCloseScreenBtn = document.getElementById('voiceCloseScreenBtn');
const voiceMainMicBtn = document.getElementById('voiceMainMicBtn');
const voiceTranscriptText = document.getElementById('voiceTranscriptText');

// Camera Modal Elements
const cameraModal = document.getElementById('cameraModal');
const camVideo = document.getElementById('camVideo');
const camCanvas = document.getElementById('camCanvas');
const snapPhotoBtn = document.getElementById('snapPhotoBtn');
const closeCamModalBtn = document.getElementById('closeCamModalBtn');
let cameraStream = null;

let attachedFile = null;
let isLiveModeActive = false;
let currentChatId = Date.now().toString();
let chats = JSON.parse(localStorage.getItem('titan_ai_sessions') || '{}');

function showScreen(screen) {
  [homeScreen, chatScreen, voiceScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// 1. LIVE CAMERA CAPTURE
async function openLiveCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    camVideo.srcObject = cameraStream;
    cameraModal.style.display = 'flex';
  } catch (err) {
    alert("Camera permission denied or camera not supported on this device.");
  }
}

function closeLiveCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  cameraModal.style.display = 'none';
}

snapPhotoBtn.addEventListener('click', () => {
  if (!camVideo.videoWidth) return;
  camCanvas.width = camVideo.videoWidth;
  camCanvas.height = camVideo.videoHeight;
  const ctx = camCanvas.getContext('2d');
  ctx.drawImage(camVideo, 0, 0, camCanvas.width, camCanvas.height);
  
  const photoData = camCanvas.toDataURL('image/jpeg', 0.85);
  attachedFile = { type: 'image', name: 'camera_capture.jpg', content: photoData };
  fileName.innerText = '📷 camera_capture.jpg';
  attachmentBar.style.display = 'block';
  sendBtn.disabled = false;
  
  closeLiveCamera();
  showScreen(chatScreen);
  userInput.focus();
});

closeCamModalBtn.addEventListener('click', closeLiveCamera);
camActionBtn.addEventListener('click', openLiveCamera);
if (deckCameraBtn) deckCameraBtn.addEventListener('click', openLiveCamera);
if (cardCameraVision) cardCameraVision.addEventListener('click', openLiveCamera);

// 2. NAVIGATION & SHORTCUTS
homeSearchTrigger.addEventListener('click', () => {
  showScreen(chatScreen);
  userInput.focus();
});

cardNewChat.addEventListener('click', () => {
  currentChatId = Date.now().toString();
  chats[currentChatId] = { title: 'New Chat', messages: [] };
  loadSession(currentChatId);
  showScreen(chatScreen);
});

cardDeepResearch.addEventListener('click', () => {
  showScreen(chatScreen);
  userInput.value = "Think step-by-step with deep reasoning: ";
  userInput.focus();
});

cardVoiceLive.addEventListener('click', () => startLiveVoiceSession());
deckVoiceModeBtn.addEventListener('click', () => startLiveVoiceSession());

deckReasoningBtn.addEventListener('click', () => {
  userInput.value = "Think step-by-step with deep reasoning: " + userInput.value;
  userInput.focus();
});

chatBackBtn.addEventListener('click', () => showScreen(homeScreen));
newChatTopBtn.addEventListener('click', () => cardNewChat.click());

userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
  sendBtn.disabled = !userInput.value.trim() && !attachedFile;
});

// 3. FILE ATTACHMENTS
attachBtn.addEventListener('click', () => filePicker.click());

filePicker.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    attachedFile = {
      type: file.type.startsWith('image') ? 'image' : 'doc',
      name: file.name,
      content: reader.result
    };
    fileName.innerText = file.name;
    attachmentBar.style.display = 'block';
    sendBtn.disabled = false;
  };
  if (file.type.startsWith('image')) reader.readAsDataURL(file);
  else reader.readAsText(file);
});

removeFileBtn.addEventListener('click', () => {
  attachedFile = null;
  filePicker.value = '';
  attachmentBar.style.display = 'none';
  sendBtn.disabled = !userInput.value.trim();
});

// 4. STREAMING CHAT DISPATCH
async function handleSend(isLive = false) {
  const text = userInput.value.trim();
  if (!text && !attachedFile) return;

  if (isListening && recognition) recognition.stop();

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: text.slice(0, 24) || 'AI Session', messages: [] };
  }

  let promptPayload = text;
  if (attachedFile) {
    if (attachedFile.type === 'image') {
      promptPayload = `[Image Attached: ${attachedFile.name}]\n${text || 'Describe and analyze this captured image.'}`;
    } else {
      promptPayload = `[File: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content.slice(0, 8000)}\n\`\`\`\n${text}`;
    }
  }

  appendUserBubble(text || `Attached: ${attachedFile?.name}`);
  chats[currentChatId].messages.push({ role: 'user', content: promptPayload });

  userInput.value = '';
  userInput.style.height = 'auto';
  if (removeFileBtn) removeFileBtn.click();

  const botRow = appendBotBubble();
  const botText = botRow.querySelector('.bot-text');
  const spkBtn = botRow.querySelector('.speaker-btn');
  botText.innerHTML = '<span style="color:#a855f7;">Titan is thinking...</span>';

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
              botText.innerHTML = marked.parse(accumulated);
              chatViewport.scrollTop = chatViewport.scrollHeight;
            }
          } catch {}
        }
      }
    }

    chats[currentChatId].messages.push({ role: 'assistant', content: accumulated });
    localStorage.setItem('titan_ai_sessions', JSON.stringify(chats));
    renderHomeHistory();

    if (spkBtn) spkBtn.onclick = () => window.speakText(accumulated);
    if (isLive || isLiveModeActive) {
      voiceTranscriptText.innerHTML = marked.parse(accumulated);
      window.speakText(accumulated, true);
    }

  } catch (e) {
    botText.innerHTML = '<span style="color:#ef4444;">⚠️ Connection failed. Please check network.</span>';
  }
}

sendBtn.addEventListener('click', () => handleSend(false));
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) handleSend(false);
  }
});

function appendUserBubble(text) {
  const row = document.createElement('div');
  row.className = 'chat-bubble-row user';
  row.innerHTML = `<div class="user-bubble-box">${escapeHtml(text)}</div>`;
  chatViewport.appendChild(row);
  chatViewport.scrollTop = chatViewport.scrollHeight;
}

function appendBotBubble() {
  const row = document.createElement('div');
  row.className = 'chat-bubble-row bot';
  row.innerHTML = `
    <div class="bot-bubble-wrapper">
      <div class="bot-avatar-badge">✦</div>
      <div class="bot-bubble-box">
        <div class="bot-text">...</div>
        <div class="bot-msg-actions">
          <button class="action-mini-icon speaker-btn">🔊 Read</button>
        </div>
      </div>
    </div>
  `;
  chatViewport.appendChild(row);
  chatViewport.scrollTop = chatViewport.scrollHeight;
  return row;
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 5. SPEECH RECOGNITION & SYNTHESIS
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    if (isLiveModeActive) voiceTranscriptText.innerText = "Listening to you...";
  };

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    if (transcript.trim()) {
      userInput.value = transcript;
      if (isLiveModeActive) {
        voiceTranscriptText.innerHTML = `"${transcript}"`;
        await handleSend(true);
      }
    }
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove('listening');
  };
}

function startLiveVoiceSession() {
  isLiveModeActive = true;
  showScreen(voiceScreen);
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  try { recognition && recognition.start(); } catch (e) {}
}

voiceCloseScreenBtn.addEventListener('click', () => {
  isLiveModeActive = false;
  if (recognition) recognition.stop();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  showScreen(homeScreen);
});

voiceBackBtn.addEventListener('click', () => voiceCloseScreenBtn.click());
voiceMainMicBtn.addEventListener('click', () => {
  if (isListening) recognition.stop();
  else recognition.start();
});

micBtn.addEventListener('click', () => {
  if (!recognition) return alert("Speech recognition not supported on this browser.");
  if (isListening) recognition.stop();
  else recognition.start();
});

window.speakText = function(text, isLive = false) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/```[\s\S]*?```/g, '').replace(/[*#`_~]/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.onend = () => {
    if (isLiveModeActive && recognition) {
      voiceTranscriptText.innerText = "Listening again...";
      try { recognition.start(); } catch (e) {}
    }
  };
  window.speechSynthesis.speak(utterance);
};

// 6. SESSIONS & HISTORY
function renderHomeHistory() {
  homeRecentHistoryList.innerHTML = '';
  const keys = Object.keys(chats).reverse().slice(0, 4);
  keys.forEach(id => {
    const card = document.createElement('div');
    card.className = 'history-card-item';
    card.innerHTML = `
      <div class="hist-left">
        <div class="hist-icon-box">✦</div>
        <span class="hist-title">${chats[id].title || 'AI Session'}</span>
      </div>
      <span style="color:#a855f7; font-size:12px;">›</span>
    `;
    card.onclick = () => {
      loadSession(id);
      showScreen(chatScreen);
    };
    homeRecentHistoryList.appendChild(card);
  });
}

function loadSession(id) {
  currentChatId = id;
  chatViewport.innerHTML = '';
  const list = chats[id]?.messages || [];
  list.forEach(m => {
    if (m.role === 'user') {
      appendUserBubble(typeof m.content === 'string' ? m.content : 'User Input');
    } else {
      const bRow = appendBotBubble();
      const bText = bRow.querySelector('.bot-text');
      const spk = bRow.querySelector('.speaker-btn');
      bText.innerHTML = marked.parse(m.content);
      spk.onclick = () => window.speakText(m.content);
    }
  });
}

window.onload = function() {
  renderHomeHistory();
};