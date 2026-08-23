// Register Service Worker for PWA
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

// --- DOM ELEMENTS ---
// Screens
const authScreen = document.getElementById('authScreen');
const homeScreen = document.getElementById('homeScreen');
const chatScreen = document.getElementById('chatScreen');
const voiceScreen = document.getElementById('voiceScreen');

// User & Profile
const homeUserName = document.getElementById('homeUserName');
const homeUserAvatar = document.getElementById('homeUserAvatar');
const profileBadge = document.getElementById('profileBadge');
const guestBtn = document.getElementById('guestBtn');

// Navigation Triggers
const homeSearchTrigger = document.getElementById('homeSearchTrigger');
const cardTextWriter = document.getElementById('cardTextWriter');
const cardDocAnalysis = document.getElementById('cardDocAnalysis');
const cardVoiceMode = document.getElementById('cardVoiceMode');
const cardCodeTutor = document.getElementById('cardCodeTutor');
const homeHistoryList = document.getElementById('homeHistoryList');

// Chat Viewport & Inputs
const chatViewport = document.getElementById('chatViewport');
const userInput = document.getElementById('userInput');
const chatMicBtn = document.getElementById('chatMicBtn');
const attachBtn = document.getElementById('attachBtn');
const filePicker = document.getElementById('filePicker');
const chatBackBtn = document.getElementById('chatBackBtn');
const newChatTopBtn = document.getElementById('newChatTopBtn');
const chatActiveTopic = document.getElementById('chatActiveTopic');
const chatActiveSub = document.getElementById('chatActiveSub');

// Attachment Previews
const attachmentBar = document.getElementById('attachmentBar');
const fileIcon = document.getElementById('fileIcon');
const fileName = document.getElementById('fileName');
const fileStatusBadge = document.getElementById('fileStatusBadge');
const removeFileBtn = document.getElementById('removeFileBtn');

// Voice Screen Elements
const voiceBackBtn = document.getElementById('voiceBackBtn');
const voiceCloseBtn = document.getElementById('voiceCloseBtn');
const voiceResetBtn = document.getElementById('voiceResetBtn');
const voiceMainMicBtn = document.getElementById('voiceMainMicBtn');
const voiceMuteToggle = document.getElementById('voiceMuteToggle');
const muteLabel = document.getElementById('muteLabel');
const voiceTranscriptText = document.getElementById('voiceTranscriptText');
const voiceStatusSub = document.getElementById('voiceStatusSub');

// --- STATE MANAGEMENT ---
let attachedFile = null;
let isVoiceActive = false;
let isMuted = false;
let currentChatId = Date.now().toString();
let chats = JSON.parse(localStorage.getItem('titan_dark_sessions') || '{}');

function showScreen(screen) {
  [authScreen, homeScreen, chatScreen, voiceScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// 1. GOOGLE IDENTITY AUTHENTICATION GATE
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
    localStorage.setItem('titan_dark_profile', JSON.stringify(profile));
    applyUserProfile(profile);
    showScreen(homeScreen);
  }
};

function applyUserProfile(user) {
  homeUserName.innerText = user.name || 'Titan User';
  if (user.picture) homeUserAvatar.src = user.picture;
}

guestBtn.addEventListener('click', () => {
  applyUserProfile({ name: 'Guest User', picture: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Guest' });
  showScreen(homeScreen);
});

profileBadge.addEventListener('click', () => {
  if (confirm("Sign out of Titan AI?")) {
    localStorage.removeItem('titan_dark_profile');
    showScreen(authScreen);
  }
});

window.onload = function() {
  const savedUser = localStorage.getItem('titan_dark_profile');
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

  renderHistoryList();
};

// 2. DOCUMENT, CODE & PHOTO PARSER
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
  return "DOCX reader library not loaded.";
}

attachBtn.addEventListener('click', () => filePicker.click());

filePicker.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();
  attachmentBar.style.display = 'inline-flex';
  fileName.innerText = file.name;
  fileStatusBadge.innerText = "Processing...";

  try {
    if (file.type.startsWith('image/')) {
      fileIcon.innerText = '🖼️';
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
      attachedFile = {
        type: 'image',
        name: file.name,
        content: base64
      };
    } else if (ext === 'pdf') {
      fileIcon.innerText = '📕';
      const arrayBuffer = await file.arrayBuffer();
      const extractedText = await parsePDF(arrayBuffer);
      attachedFile = {
        type: 'doc',
        name: file.name,
        content: extractedText.slice(0, 30000)
      };
    } else if (ext === 'docx' || ext === 'doc') {
      fileIcon.innerText = '📘';
      const arrayBuffer = await file.arrayBuffer();
      const extractedText = await parseDOCX(arrayBuffer);
      attachedFile = {
        type: 'doc',
        name: file.name,
        content: extractedText.slice(0, 30000)
      };
    } else {
      // Code, TXT, CSV, JSON
      fileIcon.innerText = '📄';
      const text = await file.text();
      attachedFile = {
        type: 'doc',
        name: file.name,
        content: text.slice(0, 30000)
      };
    }

    fileStatusBadge.innerText = "Ready";
    userInput.focus();
  } catch (err) {
    fileStatusBadge.innerText = "Error";
    alert(`File upload failed: ${err.message}`);
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

  // Auto barge-in: Talking immediately stops AI voice readout
  recognition.onspeechstart = () => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      if (isVoiceActive) voiceStatusSub.innerText = "Interrupted • Listening...";
    }
  };

  recognition.onresult = async (event) => {
    const speech = event.results[0][0].transcript;
    if (speech.trim() && !isMuted) {
      if (isVoiceActive) {
        voiceTranscriptText.innerText = `"${speech}"`;
        await handleVoiceExchange(speech);
      } else {
        userInput.value = speech;
        handleSend();
      }
    }
  };

  recognition.onend = () => {
    if (isVoiceActive && !isMuted && !window.speechSynthesis.speaking) {
      setTimeout(() => {
        if (isVoiceActive && !isMuted) {
          try { recognition.start(); } catch (e) {}
        }
      }, 350);
    }
  };
}

// 4. NEON ORB VOICE ASSISTANT
function startVoiceSession(promptText = "Listening to you...") {
  isVoiceActive = true;
  isMuted = false;
  muteLabel.innerText = "🎙️";
  voiceStatusSub.innerText = "Listening...";
  voiceTranscriptText.innerText = promptText;
  showScreen(voiceScreen);

  if (window.speechSynthesis) window.speechSynthesis.cancel();
  try { recognition && recognition.start(); } catch (e) {}
}

function stopVoiceSession() {
  isVoiceActive = false;
  if (recognition) recognition.stop();
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  showScreen(homeScreen);
}

voiceBackBtn.addEventListener('click', stopVoiceSession);
voiceCloseBtn.addEventListener('click', stopVoiceSession);

voiceResetBtn.addEventListener('click', () => {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  voiceTranscriptText.innerText = "Listening to you... Speak anytime.";
  try { recognition && recognition.start(); } catch (e) {}
});

voiceMainMicBtn.addEventListener('click', () => {
  try { recognition && recognition.start(); } catch (e) {}
});

voiceMuteToggle.addEventListener('click', () => {
  isMuted = !isMuted;
  if (isMuted) {
    if (recognition) recognition.stop();
    muteLabel.innerText = "🔇";
    voiceStatusSub.innerText = "Muted";
  } else {
    muteLabel.innerText = "🎙️";
    voiceStatusSub.innerText = "Listening...";
    if (!window.speechSynthesis.speaking) {
      try { recognition && recognition.start(); } catch (e) {}
    }
  }
});

async function handleVoiceExchange(userSpeech) {
  voiceStatusSub.innerText = "Titan Thinking...";

  if (!chats[currentChatId]) {
    chats[currentChatId] = { title: userSpeech.slice(0, 24), topic: "Voice Assistant", messages: [] };
  }
  chats[currentChatId].messages.push({ role: 'user', content: userSpeech });

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
              voiceTranscriptText.innerHTML = marked.parse(accumulated);
            }
          } catch (e) {}
        }
      }
    }

    chats[currentChatId].messages.push({ role: 'assistant', content: accumulated });
    localStorage.setItem('titan_dark_sessions', JSON.stringify(chats));
    renderHistoryList();
    speakVoiceResponse(accumulated);

  } catch (err) {
    voiceStatusSub.innerText = "Connection glitch. Re-listening...";
    if (!isMuted) {
      try { recognition && recognition.start(); } catch (e) {}
    }
  }
}

function speakVoiceResponse(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const clean = text.replace(/[*#`_~]/g, '').trim();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = 1.05;

  utterance.onstart = () => { voiceStatusSub.innerText = "Titan Speaking..."; };
  utterance.onend = () => {
    if (isVoiceActive && !isMuted) {
      voiceStatusSub.innerText = "Listening...";
      voiceTranscriptText.innerText = "Listening to you...";
      try { recognition && recognition.start(); } catch (e) {}
    }
  };

  window.speechSynthesis.speak(utterance);
}

// 5. CHAT DISPATCH ENGINE (TEXT, DOCS & VISION)
async function handleSend() {
  const text = userInput.value.trim();
  if (!text && !attachedFile) return;

  if (!chats[currentChatId]) {
    chats[currentChatId] = {
      title: (attachedFile ? attachedFile.name : text).slice(0, 24),
      topic: chatActiveTopic.innerText || "AI Chat",
      messages: []
    };
  }

  let promptPayload;
  let userDisplayHtml = text;

  if (attachedFile) {
    if (attachedFile.type === 'image') {
      // Vision Multimodal Payload for Groq
      promptPayload = [
        { type: "text", text: text || "Analyze and describe this photo." },
        { type: "image_url", image_url: { url: attachedFile.content } }
      ];
      userDisplayHtml = `
        <div style="margin-bottom: 8px;">
          <img src="${attachedFile.content}" style="max-width: 180px; max-height: 180px; border-radius: 12px; display: block;" alt="Uploaded photo" />
        </div>
        <div>${escapeHtml(text) || 'Analyze this image.'}</div>
      `;
    } else {
      // Document / Code Payload
      promptPayload = `[Document Attached: ${attachedFile.name}]\n\`\`\`text\n${attachedFile.content}\n\`\`\`\n\nPrompt:\n${text || 'Provide a comprehensive overview of this document.'}`;
      userDisplayHtml = `
        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">📄 ${escapeHtml(attachedFile.name)}</div>
        <div>${escapeHtml(text) || 'Summarize this file.'}</div>
      `;
    }
  } else {
    promptPayload = text;
    userDisplayHtml = escapeHtml(text);
  }

  appendBubble(userDisplayHtml, 'user', true);
  chats[currentChatId].messages.push({ role: 'user', content: promptPayload });

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
    localStorage.setItem('titan_dark_sessions', JSON.stringify(chats));
    renderHistoryList();

  } catch {
    botBox.innerHTML = '⚠️ Error communicating with Groq AI engine.';
  }
}

function appendBubble(content, role, isRawHtml = false) {
  const row = document.createElement('div');
  row.className = `chat-bubble-row ${role}`;
  const box = document.createElement('div');
  box.className = role === 'user' ? 'user-bubble-box' : 'bot-bubble-box';

  if (isRawHtml) {
    box.innerHTML = content;
  } else {
    box.innerHTML = escapeHtml(content);
  }

  if (role === 'bot') {
    const actionRow = document.createElement('div');
    actionRow.className = 'bot-action-row';
    actionRow.innerHTML = `
      <button class="bot-action-btn" title="Copy Text" onclick="navigator.clipboard.writeText(this.closest('.bot-bubble-box').innerText)">📋</button>
      <button class="bot-action-btn" title="Read Aloud" onclick="window.speechSynthesis.speak(new SpeechSynthesisUtterance(this.closest('.bot-bubble-box').innerText))">🔊</button>
    `;
    box.appendChild(actionRow);
  }

  row.appendChild(box);
  chatViewport.appendChild(row);
  chatViewport.scrollTop = chatViewport.scrollHeight;
  return box;
}

function escapeHtml(text) {
  if (!text) return '';
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 6. DASHBOARD & HISTORY ROUTING
function openChatWithTopic(topic, sub, initialPrompt = '') {
  currentChatId = Date.now().toString();
  chats[currentChatId] = { title: topic, topic: topic, messages: [] };
  chatActiveTopic.innerText = topic;
  chatActiveSub.innerText = sub;
  chatViewport.innerHTML = '';
  showScreen(chatScreen);
  if (initialPrompt) {
    userInput.value = initialPrompt;
    userInput.focus();
  }
}

cardTextWriter.addEventListener('click', () => openChatWithTopic("Text writer", "Content & Copywriting"));
cardDocAnalysis.addEventListener('click', () => {
  openChatWithTopic("Doc Analyst", "PDF, Docs & Image Insights");
  filePicker.click();
});
cardCodeTutor.addEventListener('click', () => openChatWithTopic("Code tutor", "Algorithms & Debugging", "How do I optimize: "));
cardVoiceMode.addEventListener('click', () => startVoiceSession("Tell me about this year's top trends..."));
homeSearchTrigger.addEventListener('click', () => openChatWithTopic("AI Assistant", "Interactive Chat"));

chatBackBtn.addEventListener('click', () => showScreen(homeScreen));
newChatTopBtn.addEventListener('click', () => {
  currentChatId = Date.now().toString();
  chatViewport.innerHTML = '';
});

userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSend();
});

chatMicBtn.addEventListener('click', () => {
  try { recognition && recognition.start(); } catch {}
});

function renderHistoryList() {
  homeHistoryList.innerHTML = '';
  const keys = Object.keys(chats).reverse().slice(0, 5);
  keys.forEach(id => {
    const item = chats[id];
    const row = document.createElement('div');
    row.className = 'history-item-row';
    row.innerHTML = `
      <div class="hist-left">
        <div class="hist-icon">✦</div>
        <div class="hist-info">
          <h4>${escapeHtml(item.topic || 'AI Assistant')}</h4>
          <p>${escapeHtml(item.title || 'Session')}</p>
        </div>
      </div>
      <span class="hist-arrow">›</span>
    `;
    row.onclick = () => {
      currentChatId = id;
      chatActiveTopic.innerText = item.topic || 'AI Assistant';
      chatActiveSub.innerText = item.title || 'Session';
      chatViewport.innerHTML = '';
      (item.messages || []).forEach(m => {
        if (m.role === 'user') {
          if (Array.isArray(m.content)) {
            const txt = m.content.find(c => c.type === 'text')?.text || '';
            const img = m.content.find(c => c.type === 'image_url')?.image_url?.url || '';
            appendBubble(
              `${img ? `<img src="${img}" style="max-width:180px; max-height:180px; border-radius:12px; display:block; margin-bottom:6px;">` : ''}${escapeHtml(txt)}`,
              'user',
              true
            );
          } else {
            appendBubble(m.content, 'user');
          }
        } else {
          const bBox = appendBubble('', 'bot');
          bBox.innerHTML = marked.parse(m.content);
        }
      });
      showScreen(chatScreen);
    };
    homeHistoryList.appendChild(row);
  });
}