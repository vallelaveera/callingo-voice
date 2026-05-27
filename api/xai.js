const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }
  try {
    const { endpoint, data, multipart } = req.body;
    const payload = JSON.stringify(data);
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.x.ai',
        path: endpoint,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.XAI_API_KEY}`,
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const r = https.request(options, (response) => {
        let d = '';
        response.on('data', chunk => d += chunk);
        response.on('end', () => resolve({ status: response.statusCode, body: d }));
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
