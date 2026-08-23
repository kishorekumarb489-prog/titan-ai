const GOOGLE_CLIENT_ID = "1027901085880-ltncq1or8f5lupuvnd7g1ea8uq4ierf9.apps.googleusercontent.com";

// Setup PDF.js worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Modal & Profiles
const welcomeLoginModal = document.getElementById('welcomeLoginModal');
const homeUserName = document.getElementById('homeUserName');
const homeUserAvatar = document.getElementById('homeUserAvatar');
const logoutBtn = document.getElementById('logoutBtn');

// Screen Views
const homeScreen = document.getElementById('homeScreen');
const chatScreen = document.getElementById('chatScreen');
const voiceScreen = document.getElementById('voiceScreen');

// Navigation Triggers
const homeSearchTrigger = document.getElementById('homeSearchTrigger');
const cardNewChat = document.getElementById('cardNewChat');
const cardDeepResearch = document.getElementById('cardDeepResearch');
const cardVoiceLive = document.getElementById('cardVoiceLive');
const cardLiveWeather = document.getElementById('cardLiveWeather');
const homeRecentHistoryList = document.getElementById('homeRecentHistoryList');
const clearAllHistoryBtn = document.getElementById('clearAllHistoryBtn');

const chatBackBtn = document.getElementById('chatBackBtn');
const newChatTopBtn = document.getElementById('newChatTopBtn');
const chatViewport = document.getElementById('chatViewport');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');

const deckVoiceModeBtn = document.getElementById('deckVoiceModeBtn');
const deckReasoningBtn = document.getElementById('deckReasoningBtn');
const deckCodeBtn = document.getElementById('deckCodeBtn');

// Voice & Vision Elements
const voiceBackBtn = document.getElementById('voiceBackBtn');
const voiceCloseScreenBtn = document.getElementById('voiceCloseScreenBtn');
const voiceMainMicBtn = document.getElementById('voiceMainMicBtn');
const voiceTranscriptText = document.getElementById('voiceTranscriptText');
const voiceMuteBtn = document.getElementById('voiceMuteBtn');
const voicePauseBtn = document.getElementById('voicePauseBtn');
const micOnIcon = document.getElementById('micOnIcon');
const micOffIcon = document.getElementById('micOffIcon');
const pauseIcon = document.getElementById('pauseIcon');
const playIcon = document.getElementById('playIcon');

// Camera Elements
const cameraToggleBtn = document.getElementById('cameraToggleBtn');
const cameraContainer = document.getElementById('cameraContainer');
const orbContainer = document.getElementById('orbContainer');
const cameraStream = document.getElementById('cameraStream');
const cameraCanvas = document.getElementById('cameraCanvas');

// File Upload Elements
const attachBtn = document.getElementById('attachBtn');
const filePicker = document.getElementById('filePicker');
const attachmentBar = document.getElementById('attachmentBar');
const fileName = document.getElementById('fileName');
const removeFileBtn = document.getElementById('removeFileBtn');

let attachedFile = null;
let isSending = false;
let isLiveModeActive = false;
let isMicMuted = false;
let isSessionPaused = false;
let isAiSpeaking = false;
let isCameraActive = false;
let cameraMediaStream = null;
let userSpeakingTimeout = null;
let currentChatId = Date.now().toString();
let chats = JSON.parse(localStorage.getItem('titan_ai_sessions') || '{}');

function showScreen(screen) {
  [homeScreen, chatScreen, voiceScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

function enforceAuthentication() {
  const savedUser = localStorage.getItem('titan_user_profile');
  if (!savedUser) {
    welcomeLoginModal.style.display = 'flex';
  } else {
    welcomeLoginModal.style.display = 'none';
    const user = JSON.parse(savedUser);
    homeUserName.innerText = user.name || 'Titan Explorer';
    if (user.picture) homeUserAvatar.src = user.picture;
  }
}

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(window.atob(base64));
  } catch {
    return null;
  }
}

window.handleCredentialResponse = function(response) {
  const user = parseJwt(response.credential);
  if (user) {
    const profile = { name: user.name, picture: user.picture, email: user.email };
    localStorage.setItem('titan_user_profile', JSON.stringify(profile));
    enforceAuthentication();
  }
};

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('titan_user_profile');
  if (window.google?.accounts?.id) google.accounts.id.disableAutoSelect();
  enforceAuthentication();
});

window.onload = function() {
  enforceAuthentication();
  if (window.google?.accounts?.id) {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false
    });
    google.accounts.id.renderButton(
      document.getElementById('googleModalBtnContainer'),
      { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with' }
    );
  }
  renderHomeHistory();
};

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
  userInput.value = "Conduct a step-by-step deep reasoning for: ";
  userInput.focus();
  sendBtn.disabled = false;
});

cardVoiceLive.addEventListener('click', () => startLiveVoiceSession());

cardLiveWeather.addEventListener('click', async () => {
  showScreen(chatScreen);
  userInput.value = "What is the live weather forecast in my area?";
  await handleSend();
});

chatBackBtn.addEventListener('click', () => showScreen(homeScreen));
newChatTopBtn.addEventListener('click', () => cardNewChat.click());

deckVoiceModeBtn.addEventListener('click', () => startLiveVoiceSession());
deckReasoningBtn.addEventListener('click', () => {
  userInput.value = "Think step-by-step with deep reasoning: " + userInput.value;
  userInput.focus();
  sendBtn.disabled = false;
});
deckCodeBtn.addEventListener('click', () => {
  userInput.value = "Write clean, fully-commented code for: " + userInput.value;
  userInput.focus();
  sendBtn.disabled = false;
});

userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
  sendBtn.disabled = !userInput.value.trim() && !attachedFile;
});

// ==========================================
// UNIVERSAL DOCUMENT & IMAGE READER
// ==========================================
attachBtn.addEventListener('click', () => filePicker.click());

filePicker.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  fileName.innerText = `Loading ${file.name}...`;
  attachmentBar.style.display = 'block';

  try {
    // 1. PDF Parsing
    if (ext === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map(item => item.str).join(' ') + '\n';
      }
      attachedFile = {
        type: 'doc',
        name: file.name,
        content: `[Attached PDF Document: ${file.name}]\n${fullText.slice(0, 15000)}`
      };
      fileName.innerText = `📄 ${file.name}`;
      sendBtn.disabled = false;
    }
    // 2. Word (.docx) Parsing
    else if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
      attachedFile = {
        type: 'doc',
        name: file.name,
        content: `[Attached Word Document: ${file.name}]\n${result.value.slice(0, 15000)}`
      };
      fileName.innerText = `📝 ${file.name}`;
      sendBtn.disabled = false;
    }
    // 3. Images (JPEG, PNG, WEBP)
    else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      const reader = new FileReader();
      reader.onload = () => {
        attachedFile = {
          type: 'image',
          name: file.name,
          dataUrl: reader.result
        };
        fileName.innerText = `🖼️ ${file.name}`;
        sendBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    }
    // 4. Code / Text (.txt, .py, .js, .csv, .c, .cpp, .html, .json, .md)
    else {
      const reader = new FileReader();
      reader.onload = () => {
        attachedFile = {
          type: 'doc',
          name: file.name,
          content: `[Attached File: ${file.name}]\n\`\`\`\n${reader.result.slice(0, 15000)}\n\`\`\``
        };
        fileName.innerText = `📁 ${file.name}`;
        sendBtn.disabled = false;
      };
      reader.readAsText(file);
    }
  } catch (err) {
    fileName.innerText = `⚠️ Error reading ${file.name}`;
  }
});

removeFileBtn?.addEventListener('click', () => {
  attachedFile = null;
  filePicker.value = '';
  attachmentBar.style.display = 'none';
  sendBtn.disabled = !userInput.value.trim();
});

// ==========================================
// CAMERA STREAM HANDLER
// ==========================================
cameraToggleBtn.addEventListener('click', async () => {
  if (isCameraActive) {
    stopCameraStream();
  } else {
    try {
      cameraMediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      cameraStream.srcObject = cameraMediaStream;
      isCameraActive = true;
      cameraToggleBtn.classList.add('active');
      cameraToggleBtn.innerText = '📷 Stop Cam';
      cameraContainer.style.display = 'block';
      orbContainer.style.display = 'none';
      voiceTranscriptText.innerText = "Camera active! Speak to analyze view.";
    } catch (err) {
      alert("Camera permission is needed for live vision mode.");
    }
  }
});

function stopCameraStream() {
  if (cameraMediaStream) {
    cameraMediaStream.getTracks().forEach(track => track.stop());
    cameraMediaStream = null;
  }
  isCameraActive = false;
  cameraToggleBtn.classList.remove('active');
  cameraToggleBtn.innerText = '📷 Camera';
  cameraContainer.style.display = 'none';
  orbContainer.style.display = 'block';
}

function captureCurrentCameraFrame() {
  if (!isCameraActive || !cameraStream.videoWidth) return null;
  cameraCanvas.width = cameraStream.videoWidth;
  cameraCanvas.height = cameraStream.videoHeight;
  const ctx = cameraCanvas.getContext('2d');
  ctx.drawImage(cameraStream, 0, 0, cameraCanvas.width, cameraCanvas.height);
  return cameraCanvas.toDataURL('image/jpeg', 0.6);
}

// ==========================================
// DISPATCH ENGINE (NO DOUBLE-SENDS)
// ==========================================
async function handleSend(isLive = false) {
  const text = userInput.value.trim();
  if (!text && !attachedFile) return;
  if (isSending) return;

  isSending = true;
  isAiSpeaking = true;
  sendBtn.disabled = true;

  if (recognition) {
    try { recognition.stop(); } catch (e) {}
  }

  if (isLive || isLiveModeActive) {
    voiceTranscriptText.innerText = "Thinking...";
  }

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: text.slice(0, 24) || attachedFile?.name || 'Session', messages: [] };
  }

  let fullPrompt = text;
  let attachedImageData = null;

  if (attachedFile) {
    if (attachedFile.type === 'doc') {
      fullPrompt = `${attachedFile.content}\n\nUser Question: ${text || 'Please summarize or explain this document.'}`;
    } else if (attachedFile.type === 'image') {
      attachedImageData = attachedFile.dataUrl;
    }
  }

  const cameraFrame = isLive && isCameraActive ? captureCurrentCameraFrame() : attachedImageData;

  appendUserBubble(text || `Uploaded: ${attachedFile?.name}`);
  chats[currentChatId].messages.push({ role: 'user', content: fullPrompt });

  userInput.value = '';
  userInput.style.height = 'auto';
  if (removeFileBtn) removeFileBtn.click();

  const botRow = appendBotBubble();
  const botText = botRow.querySelector('.bot-text');
  const spkBtn = botRow.querySelector('.speaker-action-btn');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        messages: chats[currentChatId].messages,
        image: cameraFrame
      })
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';
    let hasStartedSpeaking = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          try {
            const data = JSON.parse(line.replace('data: ', ''));
            if (data.text) {
              accumulated += data.text;
              botText.innerHTML = parseMarkdown(accumulated);
              chatViewport.scrollTop = chatViewport.scrollHeight;

              if ((isLive || isLiveModeActive) && !hasStartedSpeaking && (/[.?!,]|\n/.test(accumulated) || accumulated.length > 40)) {
                hasStartedSpeaking = true;
                voiceTranscriptText.innerHTML = parseMarkdown(accumulated);
                window.speakText(accumulated, true);
              }
            }
          } catch {}
        }
      }
    }

    chats[currentChatId].messages.push({ role: 'assistant', content: accumulated });
    localStorage.setItem('titan_ai_sessions', JSON.stringify(chats));
    renderHomeHistory();

    if (spkBtn) spkBtn.onclick = () => window.speakText(accumulated);

    if ((isLive || isLiveModeActive) && !hasStartedSpeaking) {
      voiceTranscriptText.innerHTML = parseMarkdown(accumulated);
      window.speakText(accumulated, true);
    }

  } catch {
    botText.innerHTML = '<span style="color:#ef4444;">⚠️ Connection failed.</span>';
    if (isLive || isLiveModeActive) {
      voiceTranscriptText.innerText = "Error connecting. Try speaking again.";
      isAiSpeaking = false;
      restartRecognitionSafe();
    }
  } finally {
    isSending = false;
    sendBtn.disabled = !userInput.value.trim() && !attachedFile;
  }
}

sendBtn.addEventListener('click', (e) => {
  e.preventDefault();
  handleSend(false);
});

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) handleSend(false);
  }
});

function parseMarkdown(text) {
  if (typeof marked !== 'undefined') return marked.parse(text);
  return text.replace(/\n/g, '<br>');
}

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
      <div class="bot-avatar-badge">⚡</div>
      <div class="bot-bubble-box">
        <div class="bot-text">...</div>
        <button class="speaker-action-btn">🔊 Read</button>
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

// ==========================================
// ZERO-DELAY VOICE ENGINE
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-IN';

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    if (isLiveModeActive && !isMicMuted && !isSessionPaused && !isAiSpeaking) {
      voiceTranscriptText.innerText = "Listening to you...";
    }
  };

  recognition.onresult = async (event) => {
    if (isMicMuted || isSessionPaused || isAiSpeaking) return;

    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const trans = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += trans;
      else interimTranscript += trans;
    }

    const detectedText = (finalTranscript || interimTranscript).trim();

    if (detectedText.length > 2) {
      if (isLiveModeActive) {
        voiceTranscriptText.innerHTML = `"${detectedText}"`;
      }

      clearTimeout(userSpeakingTimeout);
      userSpeakingTimeout = setTimeout(async () => {
        if (detectedText.length > 2 && !isSending) {
          userInput.value = detectedText;
          try { recognition.stop(); } catch (e) {}
          await handleSend(isLiveModeActive);
        }
      }, 550);
    }
  };

  recognition.onerror = () => {
    isListening = false;
    micBtn.classList.remove('listening');
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove('listening');
    restartRecognitionSafe();
  };
}

function restartRecognitionSafe() {
  if (isLiveModeActive && !isAiSpeaking && !isMicMuted && !isSessionPaused) {
    setTimeout(() => {
      if (isLiveModeActive && !isAiSpeaking && !isMicMuted && !isSessionPaused) {
        try { recognition.start(); } catch (e) {}
      }
    }, 200);
  }
}

voiceMuteBtn.addEventListener('click', () => {
  isMicMuted = !isMicMuted;
  if (isMicMuted) {
    if (recognition) try { recognition.stop(); } catch (e) {}
    voiceMuteBtn.classList.add('muted');
    micOnIcon.style.display = 'none';
    micOffIcon.style.display = 'block';
    voiceTranscriptText.innerText = "Microphone Muted 🔇";
  } else {
    voiceMuteBtn.classList.remove('muted');
    micOnIcon.style.display = 'block';
    micOffIcon.style.display = 'none';
    voiceTranscriptText.innerText = "Listening to you...";
    restartRecognitionSafe();
  }
});

voicePauseBtn.addEventListener('click', () => {
  isSessionPaused = !isSessionPaused;
  if (isSessionPaused) {
    if (recognition) try { recognition.stop(); } catch (e) {}
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    voicePauseBtn.classList.add('paused');
    pauseIcon.style.display = 'none';
    playIcon.style.display = 'block';
    voiceTranscriptText.innerText = "Session Paused ⏸️";
  } else {
    voicePauseBtn.classList.remove('paused');
    pauseIcon.style.display = 'block';
    playIcon.style.display = 'none';
    voiceTranscriptText.innerText = "Listening to you...";
    restartRecognitionSafe();
  }
});

function startLiveVoiceSession() {
  isLiveModeActive = true;
  isMicMuted = false;
  isSessionPaused = false;
  isAiSpeaking = false;
  voiceMuteBtn.classList.remove('muted');
  voicePauseBtn.classList.remove('paused');
  micOnIcon.style.display = 'block';
  micOffIcon.style.display = 'none';
  pauseIcon.style.display = 'block';
  playIcon.style.display = 'none';
  showScreen(voiceScreen);
  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  try { recognition.start(); } catch (e) {}
}

voiceCloseScreenBtn.addEventListener('click', () => {
  isLiveModeActive = false;
  isAiSpeaking = false;
  stopCameraStream();
  if (recognition) try { recognition.stop(); } catch (e) {}
  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  showScreen(homeScreen);
});

voiceBackBtn.addEventListener('click', () => voiceCloseScreenBtn.click());

voiceMainMicBtn.addEventListener('click', () => {
  if (isListening) try { recognition.stop(); } catch (e) {}
  else try { recognition.start(); } catch (e) {}
});

micBtn.addEventListener('click', () => {
  if (!recognition) return;
  if (isListening) try { recognition.stop(); } catch (e) {}
  else try { recognition.start(); } catch (e) {}
});

window.speakText = function(text, isLive = false) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  isAiSpeaking = true;

  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'Code block.')
    .replace(/[*#`_~]/g, '')
    .trim();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.2;
  utterance.pitch = 1.05;

  utterance.onend = () => {
    isAiSpeaking = false;
    if (isLiveModeActive && !isMicMuted && !isSessionPaused) {
      voiceTranscriptText.innerText = "Listening again...";
      restartRecognitionSafe();
    }
  };

  window.speechSynthesis.speak(utterance);
};

function renderHomeHistory() {
  homeRecentHistoryList.innerHTML = '';
  const keys = Object.keys(chats).reverse().slice(0, 4);
  keys.forEach(id => {
    const item = document.createElement('div');
    item.className = 'history-item-pill';
    item.innerHTML = `
      <span>💬 ${chats[id].title || 'AI Session'}</span>
      <span style="color:#a855f7;">›</span>
    `;
    item.onclick = () => {
      loadSession(id);
      showScreen(chatScreen);
    };
    homeRecentHistoryList.appendChild(item);
  });
}

clearAllHistoryBtn.addEventListener('click', () => {
  chats = {};
  localStorage.removeItem('titan_ai_sessions');
  renderHomeHistory();
});

function loadSession(id) {
  currentChatId = id;
  chatViewport.innerHTML = '';
  const list = chats[id]?.messages || [];
  list.forEach(m => {
    if (m.role === 'user') {
      appendUserBubble(typeof m.content === 'string' ? m.content : 'Input');
    } else {
      const bRow = appendBotBubble();
      const bText = bRow.querySelector('.bot-text');
      const spk = bRow.querySelector('.speaker-action-btn');
      bText.innerHTML = parseMarkdown(m.content);
      spk.onclick = () => window.speakText(m.content);
    }
  });
}