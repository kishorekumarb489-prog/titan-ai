// ==========================================
// NOISE-FILTERED GEMINI LIVE VOICE ENGINE
// ==========================================
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let userSpeakingTimeout = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-IN';

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    if (isLiveModeActive) voiceTranscriptText.innerText = "Listening to you...";
  };

  recognition.onresult = async (event) => {
    let interimTranscript = '';
    let finalTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const trans = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += trans;
      } else {
        interimTranscript += trans;
      }
    }

    const detectedText = (finalTranscript || interimTranscript).trim();

    // Noise Gate Filter: Ignore short audio bursts / background TV whispers (< 4 chars)
    if (detectedText.length > 4) {
      // Intentional speech detected -> cancel AI speaker
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.cancel();
      }

      if (isLiveModeActive) {
        voiceTranscriptText.innerHTML = `"${detectedText}"`;
      }

      // Debounce sending to allow user to complete sentence naturally
      clearTimeout(userSpeakingTimeout);
      userSpeakingTimeout = setTimeout(async () => {
        if (detectedText.length > 3) {
          userInput.value = detectedText;
          if (recognition) recognition.stop();
          await handleSend(isLiveModeActive);
        }
      }, 1100);
    }
  };

  recognition.onerror = () => {
    isListening = false;
    micBtn.classList.remove('listening');
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove('listening');
    // Auto restart loop in Live Mode only when AI is not actively speaking
    if (isLiveModeActive && !window.speechSynthesis.speaking) {
      setTimeout(() => {
        if (isLiveModeActive) {
          try { recognition.start(); } catch (e) {}
        }
      }, 400);
    }
  };
}

// Multi-Voice TTS persona with dynamic voice engine
window.speakText = function(text, isLive = false) {
  if (!window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const cleanText = text
    .replace(/```[\s\S]*?```/g, 'Code block omitted.')
    .replace(/[*#`_~]/g, '')
    .trim();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  const selectedModel = voiceModelSelect ? voiceModelSelect.value : 'female-natural';

  if (selectedModel === 'female-natural') {
    utterance.pitch = 1.15;
    utterance.rate = 1.15; // Faster response rate
  } else if (selectedModel === 'male-deep') {
    utterance.pitch = 0.8;
    utterance.rate = 1.05;
  } else if (selectedModel === 'female-calm') {
    utterance.pitch = 1.0;
    utterance.rate = 1.05;
  } else if (selectedModel === 'male-crisp') {
    utterance.pitch = 1.1;
    utterance.rate = 1.2;
  }

  utterance.onend = () => {
    if (isLiveModeActive && recognition) {
      voiceTranscriptText.innerText = "Listening again...";
      try { recognition.start(); } catch (e) {}
    }
  };

  window.speechSynthesis.speak(utterance);
};