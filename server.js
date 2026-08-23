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

// Detect provider ONLY by key prefix (never by variable name)
const rawKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.API_KEY || '';
const apiKey = rawKey.trim();

const isGroqKey = apiKey.startsWith('gsk_');

// 1. Groq Configuration
const GROQ_CONFIG = {
  baseURL: 'https://api.groq.com/openai/v1',
  models: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant'
  ],
  headers: {}
};

// 2. OpenRouter Configuration
const OPENROUTER_CONFIG = {
  baseURL: 'https://openrouter.ai/api/v1',
  models: [
    'meta-llama/llama-3.3-70b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.2-3b-instruct:free',
    'meta-llama/llama-3.1-8b-instruct:free'
  ],
  headers: {
    'HTTP-Referer': 'https://titan-ai-bwzi.onrender.com',
    'X-Title': 'Titan AI',
  }
};

const activeConfig = isGroqKey ? GROQ_CONFIG : OPENROUTER_CONFIG;

const openai = new OpenAI({
  apiKey: apiKey || 'dummy-key',
  baseURL: activeConfig.baseURL,
  defaultHeaders: activeConfig.headers
});

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey || apiKey === 'dummy-key') {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing! Set your API key in Render Environment Variables.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI, an advanced, high-speed assistant. Format responses clearly using Markdown.'
  };

  // Convert array payloads (multimodal/attachments) to clean text
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

  for (const model of activeConfig.models) {
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
      console.warn(`[${isGroqKey ? 'Groq' : 'OpenRouter'}] Model ${model} failed (${lastError}), trying next fallback...`);
    }
  }

  if (!streamSuccess) {
    res.write(`data: ${JSON.stringify({ text: `\n\n⚠️ AI Error: ${lastError}` })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Titan AI online on port ${port} | Active Provider: ${isGroqKey ? 'Groq Official' : 'OpenRouter Official'}`);
});