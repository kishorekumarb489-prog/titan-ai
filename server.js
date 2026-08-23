require('dotenv').config();
const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// PWA Routes
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

const rawKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.API_KEY || '';
const apiKey = rawKey.trim();
const isGroqKey = apiKey.startsWith('gsk_');

const baseURL = isGroqKey ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1';

const openai = new OpenAI({
  apiKey: apiKey || 'dummy-key',
  baseURL: baseURL,
  defaultHeaders: isGroqKey ? {} : {
    'HTTP-Referer': 'https://titan-ai-bwzi.onrender.com',
    'X-Title': 'Titan AI',
  }
});

// Dynamic Model List Storage
let activeModels = isGroqKey ? ['llama-3.3-70b-versatile'] : ['meta-llama/llama-3.3-70b-instruct:free'];

// Dynamically fetch live available models from Groq/OpenRouter
async function fetchActiveModels() {
  if (!apiKey || apiKey === 'dummy-key') return;
  try {
    const res = await fetch(`${baseURL}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (res.ok) {
      const data = await res.json();
      const models = (data.data || []).map(m => m.id);
      if (models.length > 0) {
        // Filter out non-chat models
        const chatModels = models.filter(id => !id.includes('whisper') && !id.includes('embed') && !id.includes('guard'));
        if (chatModels.length > 0) {
          activeModels = chatModels;
          console.log(`[Titan AI] Auto-discovered ${chatModels.length} active models from API.`);
        }
      }
    }
  } catch (err) {
    console.warn('[Titan AI] Model auto-fetch warning:', err.message);
  }
}

// Fetch models immediately on boot
fetchActiveModels();

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey || apiKey === 'dummy-key') {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing! Set GROQ_API_KEY in Render Environment Variables.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI, an advanced, high-speed assistant. Format responses cleanly using Markdown.'
  };

  const sanitizedMessages = (messages || []).map(m => {
    if (Array.isArray(m.content)) {
      const textPart = m.content.find(c => c.type === 'text')?.text || '';
      return {
        role: m.role,
        content: textPart || 'User provided an attachment/query.'
      };
    }
    return m;
  });

  const payload = [systemPrompt, ...sanitizedMessages.filter(m => m.role !== 'system')];
  let lastError = '';
  let streamSuccess = false;

  // Prioritize larger/versatile models first
  const sortedModels = [...activeModels].sort((a, b) => {
    if (a.includes('70b') || a.includes('versatile')) return -1;
    if (b.includes('70b') || b.includes('versatile')) return 1;
    return 0;
  });

  for (const model of sortedModels) {
    try {
      const stream = await openai.chat.completions.create({
        model: model,
        messages: payload,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
        }
      }

      streamSuccess = true;
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (err) {
      lastError = err.message || 'Execution error';
      console.warn(`[Titan AI] Model ${model} failed (${lastError}), trying next fallback...`);
    }
  }

  // If failed, re-fetch models once and retry top 2
  if (!streamSuccess) {
    await fetchActiveModels();
    for (const model of activeModels.slice(0, 2)) {
      try {
        const stream = await openai.chat.completions.create({
          model: model,
          messages: payload,
          stream: true,
        });
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
          }
        }
        res.write('data: [DONE]\n\n');
        return res.end();
      } catch (e) {}
    }
  }

  res.write(`data: { "text": "\n\n⚠️ AI Error: ${lastError}" }\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Titan AI online on port ${port} | Auto-Discovery Engine Active`);
});