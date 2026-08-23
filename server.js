require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));
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

// Active OpenRouter Free & Multimodal Models
const OPENROUTER_MODELS = [
  'google/gemini-2.0-flash-exp:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free'
];

app.post('/api/chat', async (req, res) => {
  const { messages, image } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  if (!apiKey) {
    res.write(`data: ${JSON.stringify({ text: '⚠️ OpenRouter API Key missing! Set API_KEY in Render Environment.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemPrompt = {
    role: 'system',
    content: 'You are Titan AI, an ultra-fast multimodal AI assistant with live voice and vision capabilities. When an image is provided, concisely explain what you see in direct plain text without conversational filler. Keep answers brief unless detail is asked.'
  };

  // Build Payload with Text / Camera Image
  let formattedMessages = [systemPrompt];

  if (Array.isArray(messages)) {
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'system') continue;

      // Attach vision payload to the latest user message if camera frame exists
      if (i === messages.length - 1 && image && typeof image === 'string' && image.startsWith('data:image')) {
        formattedMessages.push({
          role: 'user',
          content: [
            { type: 'text', text: typeof m.content === 'string' ? m.content : 'Describe what is in this live camera frame.' },
            { type: 'image_url', image_url: { url: image } }
          ]
        });
      } else {
        formattedMessages.push({
          role: m.role || 'user',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        });
      }
    }
  }

  let lastError = '';

  for (const model of OPENROUTER_MODELS) {
    try {
      const stream = await openai.chat.completions.create({
        model: model,
        messages: formattedMessages,
        stream: true,
        max_tokens: 500,
        temperature: 0.5
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
          if (res.flush) res.flush();
        }
      }

      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (err) {
      lastError = err.message || 'Model failed';
      console.warn(`[OpenRouter] Model ${model} failed, switching to backup:`, lastError);
    }
  }

  res.write(`data: ${JSON.stringify({ text: `⚠️ OpenRouter Error: ${lastError}` })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(port, () => {
  console.log(`Titan AI running on port ${port} powered by OpenRouter`);
});