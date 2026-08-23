require('dotenv').config();
const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// PWA File Routes
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Strict Provider Detection based on Key Prefix
const rawKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.API_KEY || '';
const apiKey = rawKey.trim();

const isGroq = apiKey.startsWith('gsk_');
const isOpenRouter = apiKey.startsWith('sk-or-') || (!isGroq && apiKey.length > 20);

const baseURL = isGroq 
  ? 'https://api.groq.com/openai/v1' 
  : 'https://openrouter.ai/api/v1';

const openai = new OpenAI({
  apiKey: apiKey || 'dummy-key',
  baseURL: baseURL,
  defaultHeaders: isGroq ? {} : {
    'HTTP-Referer': 'https://titan-ai-bwzi.onrender.com',
    'X-Title': 'Titan AI',
  }
});

// Strict Provider-Specific Models
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
];

const OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free'
];

const targetModels = isGroq ? GROQ_MODELS : OPENROUTER_MODELS;

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey || apiKey === 'dummy-key') {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key missing! Set GROQ_API_KEY or OPENROUTER_API_KEY in Render.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI, an intelligent, fast, and structured assistant. Format answers using clean Markdown.'
  };

  // Convert array payloads (images/attachments) to clean text for text-only endpoints
  const sanitizedMessages = (messages || []).map(m => {
    if (Array.isArray(m.content)) {
      const textPart = m.content.find(c => c.type === 'text')?.text || '';
      return {
        role: m.role,
        content: textPart || 'User attached an image/document.'
      };
    }
    return m;
  });

  const payload = [systemPrompt, ...sanitizedMessages.filter(m => m.role !== 'system')];
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
      lastError = err.message || 'Model execution error';
      console.warn(`[${isGroq ? 'Groq' : 'OpenRouter'}] ${model} failed (${lastError}), trying next fallback...`);
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
  console.log(`Titan AI Server active on port ${port} | Provider: ${isGroq ? 'Groq (Ultra-Fast)' : 'OpenRouter'}`);
});