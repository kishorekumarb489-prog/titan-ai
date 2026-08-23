require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));
app.use(express.static(__dirname));

const rawKey = (process.env.GEMINI_API_KEY || process.env.API_KEY || '').trim();
const genAI = new GoogleGenerativeAI(rawKey);

const FAST_VISION_MODELS = ['gemini-1.5-flash', 'gemini-1.5-flash-latest'];

app.post('/api/chat', async (req, res) => {
  const { messages, image } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  if (!rawKey) {
    res.write(`data: ${JSON.stringify({ text: '⚠️ API Key is missing! Set GEMINI_API_KEY in Render.' })}\n\n`);
    res.write('data: [DONE]\n\n');
    return res.end();
  }

  const systemInstruction = 'You are Titan AI, an ultra-fast multimodal AI assistant with live voice and vision capabilities. When an image or camera frame is provided, concisely explain what you see in direct plain text without conversational filler. Keep answers brief and rapid.';

  for (const modelName of FAST_VISION_MODELS) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: systemInstruction,
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.4
        }
      });

      let promptParts = [];

      if (image && image.startsWith('data:image')) {
        const base64Data = image.split(',')[1];
        promptParts.push({
          inlineData: {
            data: base64Data,
            mimeType: 'image/jpeg'
          }
        });
      }

      const lastUserMsg = messages[messages.length - 1];
      const userText = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : 'Analyze this visual scene.';
      promptParts.push({ text: userText });

      const result = await model.generateContentStream(promptParts);

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
      console.warn(`Model ${modelName} fallback...`, err.message);
    }
  }

  res.write(`data: ${JSON.stringify({ text: '⚠️ Processing error. Please retry.' })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
});

app.listen(port, () => {
  console.log(`Titan AI Fast Multi-modal server running on port ${port}`);
});