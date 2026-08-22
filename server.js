require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// Serve static files from root folder
app.use(express.static(__dirname));

const apiKey = process.env.API_KEY || process.env.OPENROUTER_API_KEY;

const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://render.com',
    'X-Title': 'Titan AI',
  }
});

// Auto-fallback models
const FREE_MODELS = [
  'meta-llama/llama-3.1-8b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'mistralai/mistral-7b-instruct:free'
];

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI. Always respond clearly in English or the user-requested language. Do not output Arabic.'
  };

  const payload = [systemPrompt, ...messages.filter(m => m.role !== 'system')];

  for (const model of FREE_MODELS) {
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
      console.warn(`Model ${model} failed, trying next...`);
    }
  }

  res.write(`data: ${JSON.stringify({ text: '\n\n⚠️ Models busy. Please try again.' })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});