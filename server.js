require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const apiKey = process.env.API_KEY || process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.error('❌ ERROR: API key is missing in your .env file!');
}

const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'http://localhost:3000',
    'X-Title': 'Titan AI',
  }
});

// Dynamically fetch all currently working 100% FREE models from OpenRouter
async function getActiveFreeModels() {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    const data = await res.json();
    const freeModels = data.data
      .filter(m => m.id.endsWith(':free'))
      .map(m => m.id);

    console.log(`📡 Found ${freeModels.length} active free models on OpenRouter.`);
    return freeModels.length > 0 ? freeModels : ['meta-llama/llama-3.1-8b-instruct:free'];
  } catch (err) {
    console.warn('Failed to fetch live model list, using defaults.');
    return [
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
      'qwen/qwen-2.5-72b-instruct:free'
    ];
  }
}

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI, a smart AI assistant. Answer in English or the user requested language. Format code cleanly.'
  };

  const payload = [systemPrompt, ...messages.filter(m => m.role !== 'system')];
  const models = await getActiveFreeModels();
  let lastError = '';

  // Try the live free models until one succeeds
  for (const model of models.slice(0, 5)) {
    try {
      console.log(`⚡ Trying Model: ${model}`);
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
    } catch (error) {
      lastError = error.message || 'Busy';
      console.warn(`⚠️ Model ${model} failed (${lastError}), trying next...`);
    }
  }

  res.write(`data: ${JSON.stringify({ text: `\n\n⚠️ Error: ${lastError}` })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(port, () => {
  console.log(`=========================================`);
  console.log(`⚡ Titan AI Server running at: http://localhost:${port}`);
  console.log(`=========================================`);
});