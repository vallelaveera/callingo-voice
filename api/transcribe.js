const https = require('https');

// ============================================================
// Language routing:
//   te (Telugu)  → HuggingFace vasista22/whisper-telugu-large-v2
//   kn (Kannada) → HuggingFace vasista22/whisper-kannada-medium
//   everything else → Groq whisper-large-v3-turbo
// Same response shape for both: { text: "..." }
// ============================================================

const HF_MODELS = {
  te: 'vasista22/whisper-telugu-large-v2',
  kn: 'vasista22/whisper-kannada-medium',
};

// HuggingFace Inference API — sends raw audio, returns { text }
async function transcribeHuggingFace(audioBuffer, modelId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api-inference.huggingface.co',
      path: `/models/${modelId}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'audio/webm',
        'Content-Length': audioBuffer.length,
      },
    };

    const r = https.request(options, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString(),
      }));
    });
    r.on('error', reject);
    r.write(audioBuffer);
    r.end();
  });
}

// Groq Whisper — multipart/form-data, returns { text }
async function transcribeGroq(audioBuffer, lang) {
  const boundary = '----GroqBoundary' + Date.now();
  const filename  = 'audio.webm';

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: audio/webm\r\n\r\n`
  );
  const modelPart = Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\nwhisper-large-v3-turbo` +
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="language"\r\n\r\n${lang}` +
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="response_format"\r\n\r\njson` +
    `\r\n--${boundary}--\r\n`
  );

  const body = Buffer.concat([header, audioBuffer, modelPart]);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/audio/transcriptions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };
    const r = https.request(options, (response) => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString(),
      }));
    });
    r.on('error', reject);
    r.write(body);
    r.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const audioBuffer = req.body;
    // lang comes in as 'te', 'kn', 'de', 'en' etc.
    // for Sarvam STT (te-IN, kn-IN) the client sends 'te' or 'kn' to this endpoint
    const lang = (req.query.lang || 'en').split('-')[0].toLowerCase();

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'No audio received' });
    }

    const hfModel = HF_MODELS[lang];

    if (hfModel) {
      // ── HuggingFace path (Telugu / Kannada) ──────────────────
      console.log(`[STT] HuggingFace ${lang} → ${hfModel}`);
      const result = await transcribeHuggingFace(audioBuffer, hfModel);

      if (result.status === 503) {
        // Model is loading (cold start) — tell client to retry in ~20s
        console.warn('[STT] HuggingFace model loading, falling back to Groq');
        // Fall back to Groq rather than making user wait 20s
        const groqLang = lang === 'te' ? 'te' : 'kn';
        const fallback = await transcribeGroq(audioBuffer, groqLang);
        if (fallback.status !== 200) {
          console.error('Groq fallback error:', fallback.body);
          return res.status(fallback.status).json({ error: 'Transcription failed' });
        }
        const data = JSON.parse(fallback.body);
        return res.json({ text: data.text || '', provider: 'groq-fallback' });
      }

      if (result.status !== 200) {
        console.error('HuggingFace error:', result.body);
        return res.status(result.status).json({ error: 'Transcription failed', detail: result.body });
      }

      const data = JSON.parse(result.body);
      // HF returns { text: "..." } directly
      return res.json({ text: data.text || '', provider: 'huggingface' });

    } else {
      // ── Groq path (English, German, and everything else) ─────
      console.log(`[STT] Groq ${lang}`);
      const result = await transcribeGroq(audioBuffer, lang);

      if (result.status !== 200) {
        console.error('Groq error:', result.body);
        return res.status(result.status).json({ error: 'Transcription failed', detail: result.body });
      }

      const data = JSON.parse(result.body);
      return res.json({ text: data.text || '', provider: 'groq' });
    }

  } catch (err) {
    console.error('Transcribe error:', err);
    res.status(500).json({ error: err.message });
  }
};
