require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(__dirname));

const apiKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
const genAI = new GoogleGenerativeAI(apiKey);

// Lowest Latency Flash Models
const FAST_MODELS = [
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash'
];

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!apiKey) {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing! Set GEMINI_API_KEY in Render.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  let contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
  }));

  for (const modelName of FAST_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        systemInstruction: "You are Titan AI. Respond concisely, rapidly, and directly in plain text without conversational fluff. Do not output Arabic.",
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 0.6
        }
      });

      const chat = model.startChat({
        history: contents.slice(0, -1)
      });

      const lastMessage = contents[contents.length - 1].parts[0].text;
      const result = await chat.sendMessageStream(lastMessage);

      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      res.write('data: [DONE]\n\n');
      return res.end();
    } catch (err) {
      console.warn(`Model ${modelName} retry...`, err.message);
    }
  }

  res.write(`data: ${JSON.stringify({ text: '⚠️ Server busy, please retry.' })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(port, () => {
  console.log(`Titan AI running on port ${port}`);
});