const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  if (!KV_URL || !KV_TOKEN) {
    res.status(500).json({ error: 'KV not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env vars.' });
    return;
  }

  const kvFetch = (path, body) => new Promise((resolve, reject) => {
    const url = new URL(KV_URL.replace(/\/$/, '') + path);
    const payload = body == null ? null : Buffer.from(body);
    const opts = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: payload ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${KV_TOKEN}`,
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
      },
    };
    const r = https.request(opts, (response) => {
      const chunks = [];
      response.on('data', c => chunks.push(c));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(text)); }
        catch(e) { resolve({ result: text }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });

  try {
    if (req.method === 'GET') {
      const email = String(req.query?.email || '').toLowerCase().trim();
      if (!email) { res.status(400).json({ error: 'email required' }); return; }
      const result = await kvFetch('/get/' + encodeURIComponent('voice:' + email));
      const stored = result && result.result;
      if (!stored) { res.status(200).json({ voiceId: null }); return; }
      try { res.status(200).json(JSON.parse(stored)); }
      catch(e) { res.status(200).json({ voiceId: stored }); }
      return;
    }

    if (req.method === 'POST') {
      const { email, voiceId, name } = req.body || {};
      if (!email || !voiceId) { res.status(400).json({ error: 'email and voiceId required' }); return; }
      const key = 'voice:' + String(email).toLowerCase().trim();
      const value = JSON.stringify({ voiceId, name: name || '', updatedAt: new Date().toISOString() });
      await kvFetch('/set/' + encodeURIComponent(key), value);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch(err) {
    res.status(500).json({ error: err.message });
  }
};
