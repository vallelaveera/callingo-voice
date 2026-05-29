const https = require('https');

// Soniox Text-to-Speech
// POST /api/soniox-tts
// Body: { text, language }  e.g. { text: "ఎక్కడికి ప్రయాణిస్తున్నారు?", language: "te" }
// Returns: raw audio/mpeg bytes

// Language codes for Soniox TTS
// Full list: soniox.com/docs/tts/concepts/supported-languages
const LANG_MAP = {
  'te':    'te',      // Telugu
  'te-IN': 'te',
  'kn':    'kn',      // Kannada
  'kn-IN': 'kn',
  'hi':    'hi',      // Hindi
  'hi-IN': 'hi',
  'en':    'en',      // English
  'en-IN': 'en',
  'de':    'de',      // German
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { text, language = 'te', voice = 'Maya' } = req.body || {};

    if (!text) return res.status(400).json({ error: 'No text provided' });

    const lang = LANG_MAP[language] || language;

    const payload = JSON.stringify({
      model: 'tts-rt-v1',
      text: text,
      language: lang,
      voice: voice,
      audio_format: 'mp3',
    });

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'tts-rt.soniox.com',
        path: '/tts',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.SONIOX_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };

      const chunks = [];
      const r = https.request(options, (response) => {
        // Check if it's an error (JSON) vs audio (binary)
        const ct = response.headers['content-type'] || '';
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({
          status: response.statusCode,
          contentType: ct,
          body: Buffer.concat(chunks),
        }));
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

    if (result.status !== 200) {
      console.error('[Soniox TTS] Error:', result.status, result.body.toString());
      return res.status(result.status).json({
        error: 'TTS failed',
        detail: result.body.toString(),
      });
    }

    console.log(`[Soniox TTS] ✅ ${lang} "${text.slice(0, 40)}" — ${result.body.length} bytes`);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', result.body.length);
    res.send(result.body);

  } catch (err) {
    console.error('[Soniox TTS] Exception:', err.message);
    res.status(500).json({ error: err.message });
  }
};
