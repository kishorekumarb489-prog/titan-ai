require('dotenv').config();
const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));
app.use(express.static(__dirname));

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

const rawKey = process.env.API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || '';
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

// Guaranteed working fallback models (Groq or OpenRouter)
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
];

const OPENROUTER_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'deepseek/deepseek-chat:free'
];

const targetModels = isGroq ? GROQ_MODELS : OPENROUTER_MODELS;

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey) {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing! Add GROQ_API_KEY in Render Environment variables.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI, an advanced intelligent assistant. Provide clear, well-structured markdown answers.'
  };

  const payload = [systemPrompt, ...messages.filter(m => m.role !== 'system')];
  let lastError = '';

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

      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (err) {
      lastError = err.message || 'Model execution failed';
      console.warn(`Model ${model} failed, attempting next fallback...`);
    }
  }

  res.write(`data: ${JSON.stringify({ text: `\n\n⚠️ AI Error: ${lastError}. Please verify API key permissions.` })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Titan AI Server running on port ${port}`);
});