const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { audioBase64, name } = req.body;
    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const boundary = 'fish' + Date.now();

    const addField = (name, value) =>
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);

    const fileHeader = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="voices"; filename="voice.webm"\r\nContent-Type: audio/webm\r\n\r\n`
    );
    const fileFooter = Buffer.from('\r\n');
    const closing = Buffer.from(`--${boundary}--\r\n`);

    const body = Buffer.concat([
      addField('type', 'tts'),
      addField('title', name || 'My Callingo Voice'),
      addField('train_mode', 'fast'),
      addField('visibility', 'private'),
      addField('enhance_audio_quality', 'true'),
      fileHeader,
      audioBuffer,
      fileFooter,
      closing
    ]);

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.fish.audio',
        path: '/model',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.FISH_API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
        },
      };
      const r = https.request(options, (response) => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({
          status: response.statusCode,
          body: Buffer.concat(chunks).toString()
        }));
      });
      r.on('error', reject);
      r.write(body);
      r.end();
    });

    res.status(result.status).json(JSON.parse(result.body));
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};
