require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(__dirname));

const apiKey = (process.env.API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || '').trim();

// Auto-detect Groq vs OpenRouter
const isGroq = apiKey.startsWith('gsk_');

const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: isGroq ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1',
  defaultHeaders: isGroq ? {} : {
    'HTTP-Referer': 'https://titan-ai-bwzi.onrender.com',
    'X-Title': 'Titan AI',
  }
});

// 100% Active Production Models
const ACTIVE_MODELS = isGroq
  ? [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant'
    ]
  : [
      'meta-llama/llama-3.3-70b-instruct:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'mistralai/mistral-7b-instruct:free'
    ];

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey) {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing in Render Environment!' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI, an intelligent, helpful, and concise AI assistant. Respond directly in clear English or the user-requested language. Do not output Arabic.'
  };

  const payload = [systemPrompt, ...messages.filter(m => m.role !== 'system')];
  let lastError = '';

  for (const model of ACTIVE_MODELS) {
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
      lastError = err.message || 'Model unavailable';
      console.warn(`Model ${model} failed, switching to backup...`);
    }
  }

  res.write(`data: ${JSON.stringify({ text: `\n\n⚠️ Error: ${lastError}` })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});