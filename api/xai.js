const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).end(); return; }

  try {
    const { endpoint, data } = req.body;
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
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve({
          status: response.statusCode,
          body: Buffer.concat(chunks),
          contentType: response.headers['content-type']
        }));
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
