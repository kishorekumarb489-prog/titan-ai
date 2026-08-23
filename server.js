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

// Dedicated Vision & Text Models
const GROQ_TEXT_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
const GROQ_VISION_MODELS = ['llama-3.2-11b-vision-instruct', 'llama-3.2-90b-vision-instruct', 'llama-3.3-70b-versatile'];

const OPENROUTER_TEXT_MODELS = ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.0-flash-exp:free'];
const OPENROUTER_VISION_MODELS = ['google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.2-11b-vision-instruct:free'];

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey || apiKey === 'dummy-key') {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing! Set GROQ_API_KEY in Render.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  // Detect if user uploaded an image
  const hasImage = (messages || []).some(m => 
    Array.isArray(m.content) && m.content.some(c => c.type === 'image_url')
  );

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI. Provide crisp, direct, and concise answers in Markdown. When analyzing images, describe key visual details directly without long preambles.'
  };

  const payload = [systemPrompt, ...messages.filter(m => m.role !== 'system')];

  // Route to vision models if image exists, otherwise use high-speed text models
  let targetModels;
  if (isGroqKey) {
    targetModels = hasImage ? GROQ_VISION_MODELS : GROQ_TEXT_MODELS;
  } else {
    targetModels = hasImage ? OPENROUTER_VISION_MODELS : OPENROUTER_TEXT_MODELS;
  }

  let lastError = '';
  let streamSuccess = false;

  for (const model of targetModels) {
    try {
      const stream = await openai.chat.completions.create({
        model: model,
        messages: payload,
        max_tokens: 600,
        temperature: 0.5,
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
      lastError = err.message || 'Model execution failed';
      console.warn(`[Titan AI] ${model} failed (${lastError}), trying next fallback...`);
    }
  }

  if (!streamSuccess) {
    res.write(`data: ${JSON.stringify({ text: `\n\n⚠️ AI Vision Error: ${lastError}` })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Titan AI online on port ${port} | Smart Vision Routing Enabled`);
});