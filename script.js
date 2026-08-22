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

let attachedFile = null;
let currentChatId = Date.now().toString();
let chats = JSON.parse(localStorage.getItem('titan_ai_sessions') || '{}');

// Auto-expand input box
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
  sendBtn.disabled = !userInput.value.trim() && !attachedFile;
});

// Mobile Sidebar
sidebarToggle?.addEventListener('click', () => sidebar.classList.toggle('open'));

// ===================
// VOICE INPUT (MIC)
// ===================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-IN'; // Works for Indian English, Hindi, and Tamil mix

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    userInput.placeholder = 'Listening... Speak now';
  };

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(result => result[0].transcript)
      .join('');
    userInput.value = transcript;
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
    sendBtn.disabled = !userInput.value.trim();
  };

  recognition.onerror = (event) => {
    console.warn('Speech recognition error:', event.error);
    stopListening();
  };

  recognition.onend = () => {
    stopListening();
  };
} else {
  micBtn.style.display = 'none'; // Browser does not support speech recognition
}

function stopListening() {
  isListening = false;
  micBtn.classList.remove('listening');
  userInput.placeholder = 'Message Titan AI or use voice...';
}

micBtn.addEventListener('click', () => {
  if (!recognition) return;
  if (isListening) {
    recognition.stop();
  } else {
    recognition.start();
  }
});

// ===================
// SPEAKER (TEXT TO SPEECH)
// ===================
window.speakText = function(btn, text) {
  if (!window.speechSynthesis) return;

  if (window.speechSynthesis.speaking) {
    window.speechSynthesis.cancel();
    document.querySelectorAll('.speaker-btn').forEach(b => {
      b.classList.remove('speaking');
      b.innerHTML = `🔊 Read`;
    });
    if (btn.dataset.speaking === 'true') {
      btn.dataset.speaking = 'false';
      return;
    }
  }

  // Remove code blocks and markdown symbols before reading out
  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/[*#`_~]/g, '')
    .trim();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;

  btn.classList.add('speaking');
  btn.innerHTML = `⏹ Stop`;
  btn.dataset.speaking = 'true';

  utterance.onend = () => {
    btn.classList.remove('speaking');
    btn.innerHTML = `🔊 Read`;
    btn.dataset.speaking = 'false';
  };

  utterance.onerror = () => {
    btn.classList.remove('speaking');
    btn.innerHTML = `🔊 Read`;
    btn.dataset.speaking = 'false';
  };

  window.speechSynthesis.speak(utterance);
};

// ===================
// FILE ATTACHMENTS
// ===================
attachBtn.addEventListener('click', () => filePicker.click());

filePicker.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  const isImg = file.type.startsWith('image/');

  if (isImg) {
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
      const safeContent = reader.result.slice(0, 12000);
      attachedFile = { type: 'doc', name: file.name, content: safeContent };
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

// Markdown Formatter
function parseMarkdown(text) {
  if (typeof marked !== 'undefined') {
    let raw = marked.parse(text);
    return raw.replace(/<pre><code class="language-(.*?)">([\s\S]*?)<\/code><\/pre>/g, (m, lang, code) => {
      return `
        <pre>
          <div class="code-header">
            <span>${lang || 'code'}</span>
            <button class="copy-btn" onclick="copyCode(this)">Copy</button>
          </div>
          <code>${code}</code>
        </pre>
      `;
    });
  }
  return text.replace(/\n/g, '<br>');
}

window.copyCode = function(btn) {
  const code = btn.closest('pre').querySelector('code').innerText;
  navigator.clipboard.writeText(code);
  btn.innerText = 'Copied!';
  setTimeout(() => (btn.innerText = 'Copy'), 2000);
};

// DOM Message Appenders
function appendUserMsg(text, imgSrc) {
  if (welcomeCard && welcomeCard.parentNode) welcomeCard.remove();
  const row = document.createElement('div');
  row.className = 'msg-row user';

  let imgTag = imgSrc ? `<img src="${imgSrc}" class="attached-img">` : '';
  row.innerHTML = `
    <div class="msg-inner">
      <div class="msg-content">
        ${imgTag}
        <div>${escapeHtml(text)}</div>
      </div>
    </div>
  `;
  chatViewport.appendChild(row);
  chatViewport.scrollTop = chatViewport.scrollHeight;
}

function appendBotMsg() {
  if (welcomeCard && welcomeCard.parentNode) welcomeCard.remove();
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

// Send and Stream Response
async function handleSend() {
  const text = userInput.value.trim();
  if (!text && !attachedFile) return;

  if (isListening && recognition) {
    recognition.stop();
  }

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: text.slice(0, 24) || 'Voice Query', messages: [] };
  }

  let payload;
  let userImg = null;

  if (attachedFile && attachedFile.type === 'image') {
    userImg = attachedFile.data;
    payload = {
      role: 'user',
      content: [
        { type: 'text', text: text || 'Analyze this image.' },
        { type: 'image_url', image_url: { url: attachedFile.data } }
      ]
    };
  } else if (attachedFile && attachedFile.type === 'doc') {
    payload = {
      role: 'user',
      content: `[Attached File: ${attachedFile.name}]\n\`\`\`\n${attachedFile.content}\n\`\`\`\n\nPrompt: ${text || 'Explain this.'}`
    };
  } else {
    payload = { role: 'user', content: text };
  }

  appendUserMsg(text || `Uploaded: ${attachedFile?.name}`, userImg);
  chats[currentChatId].messages.push(payload);

  userInput.value = '';
  userInput.style.height = 'auto';
  const hasImg = !!userImg;
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
      body: JSON.stringify({
        messages: chats[currentChatId].messages,
        hasImage: hasImg
      })
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
          } catch (e) {}
        }
      }
    }

    chats[currentChatId].messages.push({ role: 'assistant', content: accumulated });
    localStorage.setItem('titan_ai_sessions', JSON.stringify(chats));
    renderHistory();

    // Enable speaker button once answer completes
    actionBar.style.display = 'flex';
    speakerBtn.onclick = () => window.speakText(speakerBtn, accumulated);

  } catch (err) {
    botText.innerHTML = '<span style="color:#ff6b6b;">⚠️ Error: Connection failed.</span>';
  }
}

sendBtn.addEventListener('click', handleSend);
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) handleSend();
  }
});

// Chat History Management
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