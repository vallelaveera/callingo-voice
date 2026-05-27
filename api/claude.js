const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const body = req.body || {};
    const payload = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 200,
      ...(body.system ? { system: body.system } : {}),
      ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
      messages: body.messages,
    });

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const r = https.request(options, (response) => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }));
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

    res.status(result.status).send(result.body);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};
