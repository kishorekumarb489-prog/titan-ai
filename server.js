require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static(__dirname));

const rawKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GROQ_API_KEY || process.env.OPENROUTER_API_KEY || '').trim();

const isGemini = rawKey.startsWith('AIzaSy');
const isGroq = rawKey.startsWith('gsk_');

let genAI = null;
let openai = null;

if (isGemini) {
  genAI = new GoogleGenerativeAI(rawKey);
} else {
  openai = new OpenAI({
    apiKey: rawKey,
    baseURL: isGroq ? 'https://api.groq.com/openai/v1' : 'https://openrouter.ai/api/v1',
    defaultHeaders: isGroq ? {} : {
      'HTTP-Referer': 'https://titan-ai-bwzi.onrender.com',
      'X-Title': 'Titan AI',
    }
  });
}

const FAST_MODELS = isGemini
  ? ['gemini-2.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash']
  : isGroq
  ? ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']
  : ['meta-llama/llama-3.1-8b-instruct:free', 'mistralai/mistral-7b-instruct:free'];

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  if (!rawKey) {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing! Set API_KEY in Render.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemInstruction = 'You are Titan AI, an intelligent, helpful AI assistant. Always respond concisely and directly in clear plain text without robotic fluff. Do not output Arabic.';

  // Engine 1: Google Gemini Native API
  if (isGemini) {
    let contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
    }));

    for (const modelName of FAST_MODELS) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemInstruction,
          generationConfig: {
            maxOutputTokens: 600,
            temperature: 0.5
          }
        });

        const chat = model.startChat({ history: contents.slice(0, -1) });
        const lastMessage = contents[contents.length - 1].parts[0].text;
        const result = await chat.sendMessageStream(lastMessage);

        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            res.write(`data: ${JSON.stringify({ text })}\n\n`);
            if (res.flush) res.flush();
          }
        }

        res.write('data: [DONE]\n\n');
        return res.end();
      } catch (err) {
        console.warn(`Gemini model ${modelName} fallback...`, err.message);
      }
    }
  }

  // Engine 2: Groq / OpenRouter OpenAI-Compatible API
  const payload = [
    { role: 'system', content: systemInstruction },
    ...messages.filter(m => m.role !== 'system')
  ];

  for (const model of FAST_MODELS) {
    try {
      const stream = await openai.chat.completions.create({
        model: model,
        messages: payload,
        stream: true,
        max_tokens: 600,
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
      console.warn(`Model ${model} fallback...`, err.message);
    }
  }

  res.write(`data: ${JSON.stringify({ text: '⚠️ Titan service busy. Retrying...' })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(port, () => {
  console.log(`Titan AI ultra-fast backend running on port ${port}`);
});