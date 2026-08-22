const GOOGLE_CLIENT_ID = "1027901085880-ltncq1or8f5lupuvnd7g1ea8uq4ierf9.apps.googleusercontent.com";

// DOM Elements
const chatViewport = document.getElementById('chatViewport');
const welcomeCard = document.getElementById('welcomeCard');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const newChatBtn = document.getElementById('newChatBtn');
const historyList = document.getElementById('historyList');
const clearAllBtn = document.getElementById('clearAllBtn');
const filePicker = document.getElementById('filePicker');
const attachBtn = document.getElementById('attachBtn');
const micBtn = document.getElementById('micBtn');
const attachmentBar = document.getElementById('attachmentBar');
const fileName = document.getElementById('fileName');
const fileIcon = document.getElementById('fileIcon');
const removeFileBtn = document.getElementById('removeFileBtn');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');

// Live Mode & Auth DOM
const liveModeBtn = document.getElementById('liveModeBtn');
const liveModalOverlay = document.getElementById('liveModalOverlay');
const closeLiveModeBtn = document.getElementById('closeLiveModeBtn');
const liveStatusText = document.getElementById('liveStatusText');

const googleBtnContainer = document.getElementById('googleBtnContainer');
const userProfile = document.getElementById('userProfile');
const userName = document.getElementById('userName');
const userAvatar = document.getElementById('userAvatar');
const logoutBtn = document.getElementById('logoutBtn');

let attachedFile = null;
let isLiveModeActive = false;
let currentChatId = Date.now().toString();
let chats = JSON.parse(localStorage.getItem('titan_ai_sessions') || '{}');

// Auto resize textarea
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  sendBtn.disabled = !userInput.value.trim() && !attachedFile;
});

sidebarToggle?.addEventListener('click', () => sidebar.classList.toggle('open'));

// ==========================================
// 1. DIRECT GOOGLE SIGN-IN HANDLER
// ==========================================
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(c => {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

window.handleCredentialResponse = function(response) {
  const user = parseJwt(response.credential);
  if (user) {
    const profile = {
      name: user.name,
      email: user.email,
      picture: user.picture
    };
    localStorage.setItem('titan_user_profile', JSON.stringify(profile));
    loadUserProfile();
  }
};

function loadUserProfile() {
  const savedUser = localStorage.getItem('titan_user_profile');
  if (savedUser) {
    const user = JSON.parse(savedUser);
    if (googleBtnContainer) googleBtnContainer.style.display = 'none';
    userProfile.style.display = 'flex';
    userName.innerText = user.name || 'User';
    if (user.picture) userAvatar.src = user.picture;
  } else {
    if (googleBtnContainer) googleBtnContainer.style.display = 'block';
    userProfile.style.display = 'none';
  }
}

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('titan_user_profile');
  loadUserProfile();
  if (window.google?.accounts?.id) {
    google.accounts.id.disableAutoSelect();
  }
});

window.onload = function() {
  loadUserProfile();
  if (window.google?.accounts?.id) {
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleCredentialResponse,
      auto_select: false
    });

    google.accounts.id.renderButton(
      document.getElementById('googleBtnContainer'),
      { theme: 'outline', size: 'medium', shape: 'pill' }
    );
  }
};

// ==========================================
// 2. LIVE WEATHER & GEOLOCATION SENSOR
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
          resolve(`[Live Context - Location: Lat ${lat.toFixed(2)}, Lon ${lon.toFixed(2)} | Temp: ${cw.temperature}°C, Wind: ${cw.windspeed}km/h | Time: ${new Date().toLocaleTimeString()}]`);
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
// 3. GEMINI LIVE VOICE ENGINE & INTERRUPT
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
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
  };

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    if (isLiveModeActive) liveStatusText.innerText = 'Listening to you...';
  };

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    if (transcript.trim()) {
      userInput.value = transcript;
      if (isLiveModeActive) {
        liveStatusText.innerText = 'Titan is processing...';
        await handleSend(true);
      }
    }
  };

  recognition.onerror = () => stopListening();
  recognition.onend = () => {
    stopListening();
    if (isLiveModeActive && !window.speechSynthesis.speaking) {
      setTimeout(() => {
        if (isLiveModeActive) {
          try { recognition.start(); } catch (e) {}
        }
      }, 400);
    }
  };
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove('listening');
  if (!isLiveModeActive) userInput.placeholder = 'Ask Titan AI or talk...';
}

micBtn.addEventListener('click', () => {
  if (!recognition) return;
  if (isListening) recognition.stop();
  else recognition.start();
});

liveModeBtn.addEventListener('click', () => {
  isLiveModeActive = true;
  liveModalOverlay.style.display = 'flex';
  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
  try { recognition.start(); } catch (e) {}
});

closeLiveModeBtn.addEventListener('click', () => {
  isLiveModeActive = false;
  liveModalOverlay.style.display = 'none';
  if (recognition) recognition.stop();
  if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
});

// TTS Speaker Engine
window.speakText = function(btn, text, isLive = false) {
  if (!window.speechSynthesis) return;

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    document.querySelectorAll('.speaker-btn').forEach(b => {
      b.classList.remove('speaking');
      b.innerHTML = `🔊 Read`;
    });
    if (btn && btn.dataset.speaking === 'true') {
      btn.dataset.speaking = 'false';
      return;
    }
  }

  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/[*#`_~]/g, '')
    .trim();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.05;

  if (btn) {
    btn.classList.add('speaking');
    btn.innerHTML = `⏹ Stop`;
    btn.dataset.speaking = 'true';
  }

  if (isLive) liveStatusText.innerText = 'Titan is speaking...';

  utterance.onend = () => {
    if (btn) {
      btn.classList.remove('speaking');
      btn.innerHTML = `🔊 Read`;
      btn.dataset.speaking = 'false';
    }
    if (isLiveModeActive && recognition) {
      liveStatusText.innerText = 'Listening to you...';
      try { recognition.start(); } catch (e) {}
    }
  };

  window.speechSynthesis.speak(utterance);
};

// ==========================================
// 4. ATTACHMENTS & RENDERING
// ==========================================
attachBtn.addEventListener('click', () => filePicker.click());

filePicker.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  if (file.type.startsWith('image/')) {
    reader.onload = () => {
      attachedFile = { type: 'image', name: file.name, data: reader.result };
      fileIcon.innerText = '🖼️';
      fileName.innerText = file.name;
      attachmentBar.style.display = 'block';
      sendBtn.disabled = false;
    };
    reader.readAsDataURL(file);
  } else {
    reader.onload = () => {
      attachedFile = { type: 'doc', name: file.name, content: reader.result.slice(0, 12000) };
      fileIcon.innerText = '📄';
      fileName.innerText = file.name;
      attachmentBar.style.display = 'block';
      sendBtn.disabled = false;
    };
    reader.readAsText(file);
  }
});

removeFileBtn.addEventListener('click', () => {
  attachedFile = null;
  filePicker.value = '';
  attachmentBar.style.display = 'none';
  sendBtn.disabled = !userInput.value.trim();
});

function parseMarkdown(text) {
  if (typeof marked !== 'undefined') {
    return marked.parse(text).replace(/<pre><code class="language-(.*?)">([\s\S]*?)<\/code><\/pre>/g, (m, lang, code) => `
      <pre>
        <div class="code-header">
          <span>${lang || 'code'}</span>
          <button class="copy-btn" onclick="copyCode(this)">Copy</button>
        </div>
        <code>${code}</code>
      </pre>
    `);
  }
  return text.replace(/\n/g, '<br>');
}

window.copyCode = function(btn) {
  const code = btn.closest('pre').querySelector('code').innerText;
  navigator.clipboard.writeText(code);
  btn.innerText = 'Copied!';
  setTimeout(() => (btn.innerText = 'Copy'), 2000);
};

function appendUserMsg(text, imgSrc) {
  if (welcomeCard?.parentNode) welcomeCard.remove();
  const row = document.createElement('div');
  row.className = 'msg-row user';
  const imgTag = imgSrc ? `<img src="${imgSrc}" class="attached-img">` : '';
  row.innerHTML = `<div class="msg-inner"><div class="msg-content">${imgTag}<div>${escapeHtml(text)}</div></div></div>`;
  chatViewport.appendChild(row);
  chatViewport.scrollTop = chatViewport.scrollHeight;
}

function appendBotMsg() {
  if (welcomeCard?.parentNode) welcomeCard.remove();
  const row = document.createElement('div');
  row.className = 'msg-row bot';
  row.innerHTML = `
    <div class="msg-inner">
      <div class="msg-avatar">⚡</div>
      <div class="msg-content">
        <div class="bot-text">...</div>
        <div class="msg-action-bar" style="display: none;">
          <button class="speaker-btn">🔊 Read</button>
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
// 5. CHAT LOGIC & STREAMING
// ==========================================
async function handleSend(isLive = false) {
  const text = userInput.value.trim();
  if (!text && !attachedFile) return;

  if (isListening && recognition) recognition.stop();

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: text.slice(0, 24) || 'Voice Session', messages: [] };
  }

  const weatherContext = await getLiveWeatherContext();
  let fullPrompt = text;
  if (weatherContext && !chats[currentChatId].hasSentWeather) {
    fullPrompt = `${weatherContext}\n${text}`;
    chats[currentChatId].hasSentWeather = true;
  }

  let payload;
  let userImg = null;

  if (attachedFile?.type === 'image') {
    userImg = attachedFile.data;
    payload = {
      role: 'user',
      content: [
        { type: 'text', text: fullPrompt || 'Analyze image.' },
        { type: 'image_url', image_url: { url: attachedFile.data } }
      ]
    };
  } else if (attachedFile?.type === 'doc') {
    payload = {
      role: 'user',
      content: `[File: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content}\n\`\`\`\n${fullPrompt}`
    };
  } else {
    payload = { role: 'user', content: fullPrompt };
  }

  appendUserMsg(text || `Uploaded: ${attachedFile?.name}`, userImg);
  chats[currentChatId].messages.push(payload);

  userInput.value = '';
  userInput.style.height = 'auto';
  removeFileBtn.click();

  const botRow = appendBotMsg();
  const botText = botRow.querySelector('.bot-text');
  const actionBar = botRow.querySelector('.msg-action-bar');
  const speakerBtn = botRow.querySelector('.speaker-btn');

  botText.innerHTML = '<span style="color:#888;">Titan is thinking...</span>';

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
    renderHistory();

    actionBar.style.display = 'flex';
    speakerBtn.onclick = () => window.speakText(speakerBtn, accumulated);

    if (isLive || isLiveModeActive) {
      window.speakText(speakerBtn, accumulated, true);
    }

  } catch {
    botText.innerHTML = '<span style="color:#ff6b6b;">⚠️ Error: Connection failed.</span>';
  }
}

sendBtn.addEventListener('click', () => handleSend(false));
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) handleSend(false);
  }
});

function renderHistory() {
  historyList.innerHTML = '';
  Object.keys(chats).reverse().forEach(id => {
    const el = document.createElement('div');
    el.className = `history-item ${id === currentChatId ? 'active' : ''}`;
    el.innerText = chats[id].title || 'Conversation';
    el.onclick = () => loadSession(id);
    historyList.appendChild(el);
  });
}

function loadSession(id) {
  currentChatId = id;
  chatViewport.innerHTML = '';
  const list = chats[id]?.messages || [];
  if (list.length === 0) {
    chatViewport.appendChild(welcomeCard);
  } else {
    list.forEach(m => {
      if (m.role === 'user') {
        const text = typeof m.content === 'string' ? m.content : (m.content[0]?.text || '');
        const img = Array.isArray(m.content) ? m.content[1]?.image_url?.url : null;
        appendUserMsg(text, img);
      } else {
        const bRow = appendBotMsg();
        const bText = bRow.querySelector('.bot-text');
        const actBar = bRow.querySelector('.msg-action-bar');
        const spkBtn = bRow.querySelector('.speaker-btn');

        bText.innerHTML = parseMarkdown(m.content);
        actBar.style.display = 'flex';
        spkBtn.onclick = () => window.speakText(spkBtn, m.content);
      }
    });
  }
  renderHistory();
}

newChatBtn.addEventListener('click', () => {
  currentChatId = Date.now().toString();
  chats[currentChatId] = { title: 'New Chat', messages: [] };
  loadSession(currentChatId);
});

clearAllBtn.addEventListener('click', () => {
  chats = {};
  localStorage.removeItem('titan_ai_sessions');
  newChatBtn.click();
});

renderHistory();