require('dotenv').config();
const express = require('express');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// PWA Static Files
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.sendFile(path.join(__dirname, 'manifest.json'));
});

app.get('/sw.js', (req, res) => {
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(path.join(__dirname, 'sw.js'));
});

// Auto-Detect Provider by Key Prefix
const rawKey = process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || process.env.API_KEY || '';
const apiKey = rawKey.trim();

const isGroq = apiKey.startsWith('gsk_');
const baseURL = isGroq ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1';

const openai = new OpenAI({
  apiKey: apiKey || 'dummy-key',
  baseURL: baseURL,
  defaultHeaders: isGroq ? {} : {
    'HTTP-Referer': 'https://titan-ai-bwzi.onrender.com',
    'X-Title': 'Titan AI',
  }
});

// Dynamic Model Discovery to prevent 404s
let verifiedModels = isGroq 
  ? ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'] 
  : ['meta-llama/llama-3.3-70b-instruct:free', 'google/gemini-2.0-flash-exp:free'];

async function discoverLiveModels() {
  if (!apiKey || apiKey === 'dummy-key') return;
  try {
    const res = await fetch(`${baseURL}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    if (res.ok) {
      const data = await res.json();
      const list = (data.data || []).map(m => m.id);
      
      // Filter usable text-generation models
      const valid = list.filter(id => 
        !id.includes('whisper') && 
        !id.includes('embed') && 
        !id.includes('guard') && 
        !id.includes('safeguard')
      );

      if (valid.length > 0) {
        verifiedModels = valid;
        console.log(`[Titan AI] Successfully verified ${valid.length} models for ${isGroq ? 'Groq' : 'OpenRouter'}.`);
      }
    }
  } catch (err) {
    console.warn('[Titan AI] Model discovery notice:', err.message);
  }
}

discoverLiveModels();

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey || apiKey === 'dummy-key') {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing! Add GROQ_API_KEY to Render Environment Variables.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI. Give direct, crisp, and concise answers using Markdown. Avoid long preambles.'
  };

  // Ensure content arrays (images/docs) do not crash standard text completions
  const sanitizedMessages = (messages || []).map(m => {
    if (Array.isArray(m.content)) {
      const textPart = m.content.find(c => c.type === 'text')?.text || '';
      return {
        role: m.role,
        content: textPart || 'User uploaded a document or photo query.'
      };
    }
    return m;
  });

  const payload = [systemPrompt, ...sanitizedMessages.filter(m => m.role !== 'system')];
  let lastError = '';
  let streamSuccess = false;

  // Try verified live models in priority order
  for (const model of verifiedModels) {
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
      lastError = err.message || 'Model execution error';
      console.warn(`[Titan AI] ${model} failed (${lastError}). Trying next verified model...`);
    }
  }

  if (!streamSuccess) {
    res.write(`data: ${JSON.stringify({ 
      text: `\n\n⚠️ AI Error: ${lastError}\n\n*Diagnostics:* Provider detected as **${isGroq ? 'Groq' : 'OpenRouter'}** (Key prefix: \`${apiKey.slice(0, 6)}...\`).` 
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Titan AI online on port ${port} | Provider: ${isGroq ? 'Groq Official' : 'OpenRouter'}`);
});