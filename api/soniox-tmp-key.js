const { SonioxNodeClient } = require('@soniox/node');

const client = new SonioxNodeClient(); // reads SONIOX_API_KEY from env

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { api_key, expires_at } = await client.auth.createTemporaryKey({
      usage_type: 'transcribe_websocket',
      expires_in_seconds: 300, // 5 minutes
    });

    res.json({ api_key, expires_at });
  } catch (err) {
    console.error('[Soniox tmp key]', err.message);
    res.status(500).json({ error: err.message });
  }
};
