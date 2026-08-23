require('dotenv').config();
const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ limit: '30mb', extended: true }));
app.use(express.static(__dirname));

// PWA direct file routes
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Auto-detect Provider (Groq or OpenRouter)
const rawKey = process.env.OPENROUTER_API_KEY || process.env.API_KEY || process.env.GROQ_API_KEY || '';
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

// 100% Active & Verified Free Models (OpenRouter & Groq)
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
];

const OPENROUTER_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'google/gemini-2.0-flash-thinking-exp:free',
  'mistralai/mistral-small-24b-instruct-2501:free'
];

const targetModels = isGroq ? GROQ_MODELS : OPENROUTER_FREE_MODELS;

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey || apiKey === 'dummy-key') {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing! Please set OPENROUTER_API_KEY in Render Environment Variables.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI, an intelligent, human-like voice and vision assistant. Keep responses clear, fast, and properly formatted in markdown.'
  };

  const payload = [systemPrompt, ...messages.filter(m => m.role !== 'system')];
  let lastError = '';
  let streamSucceeded = false;

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

      streamSucceeded = true;
      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (err) {
      lastError = err.message || 'Model error';
      console.warn(`[OpenRouter/Groq] Model ${model} failed (${lastError}), attempting next available fallback...`);
    }
  }

  if (!streamSucceeded) {
    res.write(`data: ${JSON.stringify({ text: `\n\n⚠️ AI Response Error: ${lastError}. Please check if your OpenRouter key has free tier access.` })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Titan AI running on port ${port} | Mode: ${isGroq ? 'Groq' : 'OpenRouter'}`);
});