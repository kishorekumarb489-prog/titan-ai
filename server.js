require('dotenv').config();
const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '40mb' }));
app.use(express.urlencoded({ limit: '40mb', extended: true }));
app.use(express.static(__dirname));

// PWA routes
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

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

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
];

let dynamicOpenRouterFreeModels = [
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'deepseek/deepseek-r1:free'
];

async function refreshFreeModels() {
  if (isGroq || !apiKey || apiKey === 'dummy-key') return;
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data.data)) {
        const liveFree = data.data
          .map(m => m.id)
          .filter(id => id && id.endsWith(':free'));
        if (liveFree.length > 0) {
          dynamicOpenRouterFreeModels = liveFree;
        }
      }
    }
  } catch (err) {
    console.warn('[OpenRouter] Model discovery warning:', err.message);
  }
}

refreshFreeModels();

app.post('/api/chat', async (req, res) => {
  const { messages, language = 'en-IN' } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey || apiKey === 'dummy-key') {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing in Render dashboard.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const langMap = {
    'ta-IN': 'Tamil (தமிழ்). Reply strictly in clear, natural Tamil script.',
    'hi-IN': 'Hindi (हिन्दी). Reply strictly in standard conversational Hindi Devanagari script.',
    'te-IN': 'Telugu (తెలుగు). Reply strictly in clear Telugu script.',
    'kn-IN': 'Kannada (ಕನ್ನಡ). Reply strictly in clear Kannada script.',
    'ml-IN': 'Malayalam (മലയാളം). Reply strictly in clear Malayalam script.',
    'en-IN': 'Indian English. Reply concisely and naturally.'
  };

  const selectedLangInstruction = langMap[language] || langMap['en-IN'];

  const systemPrompt = {
    role: 'system',
    content: `You are Titan AI, an ultra-intelligent, multimodal live voice & vision assistant modeled after Gemini Live. 
Primary Language: ${selectedLangInstruction}
Guidelines:
1. Keep spoken live responses brief, conversational, and direct (1-3 sentences) unless asked for details.
2. If an image/camera frame is provided, describe what you observe directly in the requested language.`
  };

  const payload = [systemPrompt, ...messages.filter(m => m.role !== 'system')];
  const candidateModels = isGroq ? GROQ_MODELS : dynamicOpenRouterFreeModels;

  let lastError = '';
  let streamSucceeded = false;

  for (const model of candidateModels) {
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
      console.warn(`[Titan AI] Model ${model} failed, fallback triggered...`);
    }
  }

  if (!streamSucceeded) {
    res.write(`data: ${JSON.stringify({ text: `\n\n⚠️ AI Error: ${lastError}` })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Titan AI Server active on port ${port}`);
});