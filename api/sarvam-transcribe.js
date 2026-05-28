const https = require('https');

// Sarvam AI STT — supports te-IN (Telugu) and kn-IN (Kannada)
// Receives raw audio buffer, returns { text, language_code }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const audioBuffer = req.body;
    const lang = req.query.lang || 'te-IN'; // te-IN or kn-IN

    if (!audioBuffer || audioBuffer.length === 0) {
      return res.status(400).json({ error: 'No audio received' });
    }

    const boundary = '----SarvamBoundary' + Date.now();
    const filename  = 'audio.webm';

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      `Content-Type: audio/webm\r\n\r\n`
    );

    const fields = Buffer.from(
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="model"\r\n\r\nsaarika:v2.5` +
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="language_code"\r\n\r\n${lang}` +
      `\r\n--${boundary}\r\n` +
      `Content-Disposition: form-data; name="with_timestamps"\r\n\r\nfalse` +
      `\r\n--${boundary}--\r\n`
    );

    const body = Buffer.concat([header, audioBuffer, fields]);

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.sarvam.ai',
        path: '/speech-to-text',
        method: 'POST',
        headers: {
          'api-subscription-key': process.env.SARVAM_API_KEY,
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
      console.error('Sarvam STT error:', result.body);
      return res.status(result.status).json({ error: 'Transcription failed', detail: result.body });
    }

    const data = JSON.parse(result.body);
    res.json({ text: data.transcript || '' });

  } catch (err) {
    console.error('Sarvam transcribe error:', err);
    res.status(500).json({ error: err.message });
  }
};
