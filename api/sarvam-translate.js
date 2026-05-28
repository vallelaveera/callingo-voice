const https = require('https');

// Sarvam AI Translation (Mayura) — Telugu/Kannada ↔ English
// Body: { text, source, target }
// e.g. { text: "నమస్కారం", source: "te-IN", target: "en-IN" }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { text, source = 'te-IN', target = 'en-IN' } = req.body || {};
    if (!text) return res.status(400).json({ error: 'No text provided' });

    const payload = JSON.stringify({
      input: text,
      source_language_code: source,
      target_language_code: target,
      speaker_gender: 'Female',
      mode: 'formal',
      model: 'mayura:v1',
      enable_preprocessing: false,
    });

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.sarvam.ai',
        path: '/translate',
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
      console.error('Sarvam translate error:', result.body);
      return res.status(result.status).json({ error: 'Translation failed', detail: result.body });
    }

    const data = JSON.parse(result.body);
    res.json({ translated: data.translated_text || '' });

  } catch (err) {
    console.error('Sarvam translate error:', err);
    res.status(500).json({ error: err.message });
  }
};
