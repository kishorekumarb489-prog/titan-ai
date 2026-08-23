require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(__dirname));

const apiKey = (process.env.API_KEY || process.env.OPENROUTER_API_KEY || '').trim();

const openai = new OpenAI({
  apiKey: apiKey,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': 'https://titan-ai-bwzi.onrender.com',
    'X-Title': 'Titan AI',
  }
});

// Dynamic Cache for Free Models
let cachedFreeModels = [];
let lastFetchTime = 0;

// Auto-search & fetch currently active 100% free models from OpenRouter
async function fetchLiveFreeModels() {
  const now = Date.now();
  // Cache for 15 minutes to avoid redundant API calls
  if (cachedFreeModels.length > 0 && now - lastFetchTime < 15 * 60 * 1000) {
    return cachedFreeModels;
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models');
    const data = await res.json();
    
    if (data && Array.isArray(data.data)) {
      // Filter models ending with ':free' or having 0 cost pricing
      const freeModels = data.data
        .filter(m => m.id.endsWith(':free') || (m.pricing?.prompt === '0' && m.pricing?.completion === '0'))
        .map(m => m.id);

      if (freeModels.length > 0) {
        cachedFreeModels = freeModels;
        lastFetchTime = now;
        console.log(`[OpenRouter Discovery] Found ${freeModels.length} active free models:`, freeModels.slice(0, 5));
        return cachedFreeModels;
      }
    }
  } catch (err) {
    console.warn('[Discovery Warning] Failed to fetch live models list:', err.message);
  }

  // Robust Hardcoded Fallback if discovery endpoint fails
  return [
    'openrouter/free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'mistralai/mistral-7b-instruct:free'
  ];
}

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

  // Get real-time dynamically fetched free models
  const availableModels = await fetchLiveFreeModels();

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI, an intelligent, helpful AI assistant. Always respond directly and concisely in clear English or user-requested language (Tamil/Hindi).'
  };

  const payload = [systemPrompt, ...messages.filter(m => m.role !== 'system')];
  let lastError = '';

  for (const model of availableModels) {
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
      console.warn(`[Auto-Router] ${model} failed, auto-trying next active free model...`);
    }
  }

  res.write(`data: ${JSON.stringify({ text: `\n\n⚠️ Error: ${lastError}` })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(port, () => {
  console.log(`Server running on port ${port} with Auto-Discovery Engine`);
});