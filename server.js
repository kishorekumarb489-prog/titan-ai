require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(__dirname));

const apiKey = process.env.API_KEY || process.env.OPENROUTER_API_KEY;

const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://titan-ai-bwzi.onrender.com',
    'X-Title': 'Titan AI',
  }
});

// Live-a active-a irukra 100% Free models-a fetch panra function
async function getWorkingFreeModels() {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    const data = await res.json();
    const liveFreeModels = data.data
      .filter(m => m.id.endsWith(':free'))
      .map(m => m.id);

    if (liveFreeModels.length > 0) {
      return liveFreeModels;
    }
  } catch (err) {
    console.warn('Live fetch failed, using fallback list.');
  }

  // Backup active models
  return [
    'meta-llama/llama-3.1-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free'
  ];
}

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey) {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing! Check Render Environment Variables.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI. Respond clearly in English or the requested language (Tamil/Hindi). Do not output Arabic.'
  };

  const payload = [systemPrompt, ...messages.filter(m => m.role !== 'system')];
  const activeModels = await getWorkingFreeModels();
  let lastError = '';

  for (const model of activeModels) {
    try {
      console.log(`Connecting to: ${model}`);
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
      console.warn(`Model ${model} failed, switching to next free model...`);
    }
  }

  res.write(`data: ${JSON.stringify({ text: `\n\n⚠️ Error: ${lastError}` })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});