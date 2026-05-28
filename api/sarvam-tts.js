const https = require('https');

// Sarvam AI TTS (Bulbul v3) — Telugu and Kannada
// Receives { text, language } returns audio/mpeg

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { text, language = 'te-IN', speaker = 'meera', pace = 1.0 } = req.body || {};

    if (!text) return res.status(400).json({ error: 'No text provided' });

    // Speaker options for Bulbul v3:
    // Female: meera, pavithra, maitreyi, aradhya
    // Male: achal, deva, karan, abhur
    // Pick a good default per language
    const defaultSpeaker = language === 'kn-IN' ? 'pavithra' : 'meera';

    const payload = JSON.stringify({
      inputs: [text],
      target_language_code: language,
      speaker: speaker || defaultSpeaker,
      pace,
      model: 'bulbul:v3',
      enable_preprocessing: true,
    });

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.sarvam.ai',
        path: '/text-to-speech',
        method: 'POST',
        headers: {
          'api-subscription-key': process.env.SARVAM_API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
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
      r.write(payload);
      r.end();
    });

    if (result.status !== 200) {
      console.error('Sarvam TTS error:', result.body);
      return res.status(result.status).json({ error: 'TTS failed', detail: result.body });
    }

    const data = JSON.parse(result.body);
    // Sarvam returns base64-encoded WAV
    const audioBase64 = data.audios?.[0];
    if (!audioBase64) return res.status(500).json({ error: 'No audio returned' });

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', audioBuffer.length);
    res.send(audioBuffer);

  } catch (err) {
    console.error('Sarvam TTS error:', err);
    res.status(500).json({ error: err.message });
  }
};
