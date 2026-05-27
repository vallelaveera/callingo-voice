const https = require('https');
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    const { endpoint, body } = req.body;
    const payload = JSON.stringify(body);
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.fish.audio',
        path: endpoint,
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.FISH_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      };
      const r = https.request(options, (response) => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks), contentType: response.headers['content-type'] }));
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });
    res.setHeader('Content-Type', result.contentType || 'application/json');
    res.status(result.status).send(result.body);
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};
