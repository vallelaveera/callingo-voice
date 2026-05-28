const https = require('https');
const { Readable } = require('stream');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    // req.body is a Buffer (raw audio) sent as application/octet-stream
    // req.query.lang is the language hint e.g. 'de', 'en'
    const audioBuffer = req.body;
    const lang = req.query.lang || 'en';

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'No audio received' });
    }

    // Groq Whisper expects multipart/form-data
    const boundary = '----GroqBoundary' + Date.now();
    const filename  = 'audio.webm';

    // Build multipart body manually (no npm packages needed)
    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: audio/webm\r\n\r\n`
    );
    const modelPart = Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\n` +
      `whisper-large-v3-turbo` +          // fastest Groq Whisper model
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      lang +
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="response_format"\r\n\r\n` +
      `json` +
      `\r\n--${boundary}--\r\n`
    );

    const body = Buffer.concat([header, audioBuffer, modelPart]);

    const result = await new Promise((resolve, reject) => {
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

    if (result.status !== 200) {
      console.error('Groq error:', result.body);
      return res.status(result.status).json({ error: 'Transcription failed', detail: result.body });
    }

    const data = JSON.parse(result.body);
    res.json({ text: data.text || '' });

  } catch (err) {
    console.error('Transcribe error:', err);
    res.status(500).json({ error: err.message });
  }
};
