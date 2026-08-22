const GOOGLE_CLIENT_ID = "1027901085880-ltncq1or8f5lupuvnd7g1ea8uq4ierf9.apps.googleusercontent.com";

// Screen Views
const homeScreen = document.getElementById('homeScreen');
const chatScreen = document.getElementById('chatScreen');
const voiceScreen = document.getElementById('voiceScreen');

// Home Screen Elements
const homeUserName = document.getElementById('homeUserName');
const homeUserAvatar = document.getElementById('homeUserAvatar');
const homeSearchTrigger = document.getElementById('homeSearchTrigger');
const cardNewChat = document.getElementById('cardNewChat');
const cardDeepResearch = document.getElementById('cardDeepResearch');
const cardVoiceLive = document.getElementById('cardVoiceLive');
const cardLiveWeather = document.getElementById('cardLiveWeather');
const homeRecentHistoryList = document.getElementById('homeRecentHistoryList');

// Chat Screen Elements
const chatViewport = document.getElementById('chatViewport');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');
const chatBackBtn = document.getElementById('chatBackBtn');
const newChatTopBtn = document.getElementById('newChatTopBtn');
const deckVoiceModeBtn = document.getElementById('deckVoiceModeBtn');
const deckReasoningBtn = document.getElementById('deckReasoningBtn');
const deckCodeBtn = document.getElementById('deckCodeBtn');
const attachBtn = document.getElementById('attachBtn');
const filePicker = document.getElementById('filePicker');
const attachmentBar = document.getElementById('attachmentBar');
const fileName = document.getElementById('fileName');
const removeFileBtn = document.getElementById('removeFileBtn');

// Voice Screen Elements
const voiceBackBtn = document.getElementById('voiceBackBtn');
const voiceCloseScreenBtn = document.getElementById('voiceCloseScreenBtn');
const voiceMainMicBtn = document.getElementById('voiceMainMicBtn');
const voiceTranscriptText = document.getElementById('voiceTranscriptText');

let attachedFile = null;
let isLiveModeActive = false;
let currentChatId = Date.now().toString();
let chats = JSON.parse(localStorage.getItem('titan_ai_sessions') || '{}');

// Screen Router
function showScreen(screen) {
  [homeScreen, chatScreen, voiceScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// Home Triggers
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
  userInput.value = "Conduct a deep analytical research on: ";
  userInput.focus();
});

cardVoiceLive.addEventListener('click', () => {
  startLiveVoiceSession();
});

cardLiveWeather.addEventListener('click', async () => {
  showScreen(chatScreen);
  userInput.value = "What is the live weather status for my current location?";
  await handleSend();
});

chatBackBtn.addEventListener('click', () => showScreen(homeScreen));
newChatTopBtn.addEventListener('click', () => cardNewChat.click());

deckVoiceModeBtn.addEventListener('click', () => startLiveVoiceSession());
deckReasoningBtn.addEventListener('click', () => {
  userInput.value = "Think step-by-step with deep reasoning: " + userInput.value;
  userInput.focus();
});
deckCodeBtn.addEventListener('click', () => {
  userInput.value = "Write clean, optimized code for: " + userInput.value;
  userInput.focus();
});

// Auto Resize Input
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 100) + 'px';
  sendBtn.disabled = !userInput.value.trim() && !attachedFile;
});

// ==========================================
// 1. GOOGLE IDENTITY SIGN-IN
// ==========================================
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
    const profile = { name: user.name, picture: user.picture };
    localStorage.setItem('titan_user_profile', JSON.stringify(profile));
    loadUserProfile();
  }
};

function loadUserProfile() {
  const savedUser = localStorage.getItem('titan_user_profile');
  if (savedUser) {
    const user = JSON.parse(savedUser);
    homeUserName.innerText = user.name || 'User';
    if (user.picture) homeUserAvatar.src = user.picture;
  }
}

window.onload = function() {
  loadUserProfile();
  if (window.google?.accounts?.id) {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
    });
    google.accounts.id.renderButton(
      document.getElementById('googleBtnContainer'),
      { theme: 'outline', size: 'small', shape: 'pill' }
    );
  }
  renderHomeHistory();
};

// ==========================================
// 2. LIVE WEATHER & SENSORS
// ==========================================
async function getLiveWeatherContext() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve('');

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
          const data = await res.json();
          const cw = data.current_weather;
          resolve(`[User Location: Lat ${lat.toFixed(2)}, Lon ${lon.toFixed(2)} | Temp: ${cw.temperature}°C, Wind: ${cw.windspeed}km/h | Time: ${new Date().toLocaleTimeString()}]`);
        } catch {
          resolve('');
        }
      },
      () => resolve(''),
      { timeout: 4000 }
    );
  });
}

// ==========================================
// 3. GROQ STREAMING & DISPATCH
// ==========================================
async function handleSend(isLive = false) {
  const text = userInput.value.trim();
  if (!text && !attachedFile) return;

  if (isListening && recognition) recognition.stop();

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: text.slice(0, 24) || 'AI Session', messages: [] };
  }

  const weatherContext = await getLiveWeatherContext();
  let fullPrompt = text;
  if (weatherContext && !chats[currentChatId].hasSentWeather) {
    fullPrompt = `${weatherContext}\n${text}`;
    chats[currentChatId].hasSentWeather = true;
  }

  let payload;
  if (attachedFile?.type === 'doc') {
    payload = {
      role: 'user',
      content: `[File: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content}\n\`\`\`\n${fullPrompt}`
    };
  } else {
    payload = { role: 'user', content: fullPrompt };
  }

  appendUserBubble(text || `Attached: ${attachedFile?.name}`);
  chats[currentChatId].messages.push(payload);

  userInput.value = '';
  userInput.style.height = 'auto';
  if (removeFileBtn) removeFileBtn.click();

  const botRow = appendBotBubble();
  const botText = botRow.querySelector('.bot-text');
  const spkBtn = botRow.querySelector('.speaker-btn');

  botText.innerHTML = '<span style="color:#a855f7;">Titan is thinking with Groq...</span>';

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
              botText.innerHTML = parseMarkdown(accumulated);
              chatViewport.scrollTop = chatViewport.scrollHeight;
            }
          } catch {}
        }
      }
    }

    chats[currentChatId].messages.push({ role: 'assistant', content: accumulated });
    localStorage.setItem('titan_ai_sessions', JSON.stringify(chats));
    renderHomeHistory();

    if (spkBtn) {
      spkBtn.onclick = () => window.speakText(spkBtn, accumulated);
    }

    if (isLive || isLiveModeActive) {
      voiceTranscriptText.innerHTML = parseMarkdown(accumulated);
      window.speakText(spkBtn, accumulated, true);
    }

  } catch {
    botText.innerHTML = '<span style="color:#ef4444;">⚠️ Connection failed.</span>';
  }
}

sendBtn.addEventListener('click', () => handleSend(false));
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) handleSend(false);
  }
});

function parseMarkdown(text) {
  if (typeof marked !== 'undefined') {
    return marked.parse(text);
  }
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

// ==========================================
// 4. HOLOGRAPHIC ORB GEMINI LIVE VOICE
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-IN';

  recognition.onspeechstart = () => {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  };

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
    if (isLiveModeActive && !window.speechSynthesis.speaking) {
      setTimeout(() => {
        if (isLiveModeActive) {
          try { recognition.start(); } catch (e) {}
        }
      }, 400);
    }
  };
}

function startLiveVoiceSession() {
  isLiveModeActive = true;
  showScreen(voiceScreen);
  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  try { recognition.start(); } catch (e) {}
}

voiceCloseScreenBtn.addEventListener('click', () => {
  isLiveModeActive = false;
  if (recognition) recognition.stop();
  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  showScreen(homeScreen);
});

voiceBackBtn.addEventListener('click', () => voiceCloseScreenBtn.click());

voiceMainMicBtn.addEventListener('click', () => {
  if (isListening) recognition.stop();
  else recognition.start();
});

micBtn.addEventListener('click', () => {
  if (!recognition) return;
  if (isListening) recognition.stop();
  else recognition.start();
});

window.speakText = function(btn, text, isLive = false) {
  if (!window.speechSynthesis) return;

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    return;
  }

  const cleanText = text.replace(/```[\s\S]*?```/g, '').replace(/[*#`_~]/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.05;

  utterance.onend = () => {
    if (isLiveModeActive && recognition) {
      voiceTranscriptText.innerText = "Listening again...";
      try { recognition.start(); } catch (e) {}
    }
  };

  window.speechSynthesis.speak(utterance);
};

// ==========================================
// 5. ATTACHMENTS & HISTORY
// ==========================================
attachBtn.addEventListener('click', () => filePicker.click());

filePicker.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    attachedFile = { type: 'doc', name: file.name, content: reader.result.slice(0, 12000) };
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
      appendUserBubble(typeof m.content === 'string' ? m.content : 'Input');
    } else {
      const bRow = appendBotBubble();
      const bText = bRow.querySelector('.bot-text');
      const spk = bRow.querySelector('.speaker-btn');
      bText.innerHTML = parseMarkdown(m.content);
      spk.onclick = () => window.speakText(spk, m.content);
    }
  });
}