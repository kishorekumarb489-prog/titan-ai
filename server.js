require('dotenv').config();
const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Direct PWA Routes
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Accurate Provider Detection
const rawKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.API_KEY || '';
const apiKey = rawKey.trim();
const isGroq = apiKey.startsWith('gsk_');

const openai = new OpenAI({
  apiKey: apiKey || 'dummy-key',
  baseURL: isGroq ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1',
  defaultHeaders: isGroq ? {} : {
    'HTTP-Referer': 'https://titan-ai-bwzi.onrender.com',
    'X-Title': 'Titan AI',
  }
});

// Provider-Specific Verified Models
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama-3.2-11b-vision-preview'
];

let OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free'
];

// Dynamically sync active free models if using OpenRouter
async function syncOpenRouterModels() {
  if (isGroq || !apiKey || apiKey === 'dummy-key') return;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (res.ok) {
      const data = await res.json();
      const liveFree = (data.data || [])
        .map(m => m.id)
        .filter(id => id && id.endsWith(':free'));
      if (liveFree.length > 0) {
        OPENROUTER_MODELS = liveFree;
        console.log(`[OpenRouter] Synced ${liveFree.length} active free models.`);
      }
    }
  } catch (err) {
    console.warn('[OpenRouter] Dynamic sync fallback active:', err.message);
  }
}
syncOpenRouterModels();

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey || apiKey === 'dummy-key') {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing! Add GROQ_API_KEY or OPENROUTER_API_KEY in Render Environment Variables.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI, an intelligent, high-speed assistant. Provide well-structured markdown answers.'
  };

  const payload = [systemPrompt, ...messages.filter(m => m.role !== 'system')];
  const targetModels = isGroq ? GROQ_MODELS : OPENROUTER_MODELS;

  let lastError = '';
  let completed = false;

  for (const model of targetModels) {
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

      completed = true;
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (err) {
      lastError = err.message || 'Model failed';
      console.warn(`[${isGroq ? 'Groq' : 'OpenRouter'}] ${model} error: ${lastError}. Trying next...`);
    }
  }

  if (!completed) {
    res.write(`data: ${JSON.stringify({ text: `\n\n⚠️ AI Error: ${lastError}` })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Titan AI online on port ${port} | Active Provider: ${isGroq ? 'Groq (Ultra-Fast)' : 'OpenRouter'}`);
});