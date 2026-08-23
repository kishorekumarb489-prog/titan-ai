if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

const homeScreen = document.getElementById('homeScreen');
const chatScreen = document.getElementById('chatScreen');
const voiceScreen = document.getElementById('voiceScreen');

const homeSearchTrigger = document.getElementById('homeSearchTrigger');
const cardVoiceChat = document.getElementById('cardVoiceChat');
const cardChatAI = document.getElementById('cardChatAI');
const cardCameraScan = document.getElementById('cardCameraScan');
const cardReasoning = document.getElementById('cardReasoning');
const homeOrbTrigger = document.getElementById('homeOrbTrigger');

const chatViewport = document.getElementById('chatViewport');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const chatBackBtn = document.getElementById('chatBackBtn');
const newChatTopBtn = document.getElementById('newChatTopBtn');

const deckVoiceBtn = document.getElementById('deckVoiceBtn');
const deckCamBtn = document.getElementById('deckCamBtn');
const deckReasonBtn = document.getElementById('deckReasonBtn');

const attachBtn = document.getElementById('attachBtn');
const filePicker = document.getElementById('filePicker');
const attachmentBar = document.getElementById('attachmentBar');
const fileName = document.getElementById('fileName');
const removeFileBtn = document.getElementById('removeFileBtn');

const voiceBackBtn = document.getElementById('voiceBackBtn');
const voiceCloseScreenBtn = document.getElementById('voiceCloseScreenBtn');
const voiceMainMicBtn = document.getElementById('voiceMainMicBtn');
const voiceTranscriptText = document.getElementById('voiceTranscriptText');

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

// Camera Scanner
async function openLiveCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    camVideo.srcObject = cameraStream;
    cameraModal.style.display = 'flex';
  } catch (e) {
    alert("Camera access denied or unsupported.");
  }
}

function closeLiveCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  cameraModal.style.display = 'none';
}

snapPhotoBtn.addEventListener('click', () => {
  if (!camVideo.videoWidth) return;
  camCanvas.width = camVideo.videoWidth;
  camCanvas.height = camVideo.videoHeight;
  const ctx = camCanvas.getContext('2d');
  ctx.drawImage(camVideo, 0, 0);
  
  const imgData = camCanvas.toDataURL('image/jpeg', 0.85);
  attachedFile = { type: 'image', name: 'scan_capture.jpg', content: imgData };
  fileName.innerText = '📷 scan_capture.jpg';
  attachmentBar.style.display = 'block';
  sendBtn.disabled = false;

  closeLiveCamera();
  showScreen(chatScreen);
  userInput.focus();
});

closeCamModalBtn.addEventListener('click', closeLiveCamera);

// Navigation Triggers
homeSearchTrigger.addEventListener('click', () => { showScreen(chatScreen); userInput.focus(); });
homeOrbTrigger.addEventListener('click', () => startVoiceMode());
cardVoiceChat.addEventListener('click', () => startVoiceMode());
cardChatAI.addEventListener('click', () => { showScreen(chatScreen); userInput.focus(); });
cardCameraScan.addEventListener('click', openLiveCamera);
cardReasoning.addEventListener('click', () => {
  showScreen(chatScreen);
  userInput.value = "Think step-by-step with deep reasoning: ";
  userInput.focus();
});

chatBackBtn.addEventListener('click', () => showScreen(homeScreen));
newChatTopBtn.addEventListener('click', () => {
  currentChatId = Date.now().toString();
  chats[currentChatId] = { title: 'New Chat', messages: [] };
  chatViewport.innerHTML = '';
});

deckVoiceBtn.addEventListener('click', startVoiceMode);
deckCamBtn.addEventListener('click', openLiveCamera);
deckReasonBtn.addEventListener('click', () => {
  userInput.value = "Think step-by-step with deep reasoning: ";
  userInput.focus();
});

userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
  sendBtn.disabled = !userInput.value.trim() && !attachedFile;
});

// File Management
attachBtn.addEventListener('click', () => filePicker.click());
filePicker.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    attachedFile = { type: file.type.startsWith('image') ? 'image' : 'doc', name: file.name, content: reader.result };
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

// Chat Dispatch
async function handleSend(isLive = false) {
  const text = userInput.value.trim();
  if (!text && !attachedFile) return;

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: text.slice(0, 24) || 'AI Session', messages: [] };
  }

  let prompt = text;
  if (attachedFile) {
    prompt = `[Attached File/Image: ${attachedFile.name}]\n${text}`;
  }

  appendUserBubble(text || `Attached: ${attachedFile?.name}`);
  chats[currentChatId].messages.push({ role: 'user', content: prompt });

  userInput.value = '';
  userInput.style.height = 'auto';
  if (removeFileBtn) removeFileBtn.click();

  const botRow = appendBotBubble();
  const botText = botRow.querySelector('.bot-text');
  botText.innerHTML = '<span style="color:var(--primary-purple);">Titan is thinking...</span>';

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

    if (isLive || isLiveModeActive) {
      voiceTranscriptText.innerHTML = marked.parse(accumulated);
      speakText(accumulated);
    }
  } catch {
    botText.innerHTML = '<span style="color:#ef4444;">⚠️ Connection error.</span>';
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
  row.innerHTML = `<div class="bot-bubble-box"><div class="bot-text">...</div></div>`;
  chatViewport.appendChild(row);
  chatViewport.scrollTop = chatViewport.scrollHeight;
  return row;
}

function escapeHtml(t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Voice Mode
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'en-IN';
  recognition.onresult = async (e) => {
    const speech = e.results[0][0].transcript;
    if (speech) {
      userInput.value = speech;
      if (isLiveModeActive) {
        voiceTranscriptText.innerText = `"${speech}"`;
        await handleSend(true);
      }
    }
  };
}

function startVoiceMode() {
  isLiveModeActive = true;
  showScreen(voiceScreen);
  try { recognition && recognition.start(); } catch {}
}

voiceCloseScreenBtn.addEventListener('click', () => {
  isLiveModeActive = false;
  if (recognition) recognition.stop();
  showScreen(homeScreen);
});
voiceBackBtn.addEventListener('click', () => voiceCloseScreenBtn.click());
voiceMainMicBtn.addEventListener('click', () => {
  try { recognition && recognition.start(); } catch {}
});
micBtn.addEventListener('click', () => {
  try { recognition && recognition.start(); } catch {}
});

function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/[*#`_~]/g, '');
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(clean));
}