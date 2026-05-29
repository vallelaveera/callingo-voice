const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const body = req.body || {};
    const wantStream = body.stream === true;

    const payload = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: typeof body.max_tokens === 'number' ? body.max_tokens : 200,
      ...(body.system ? { system: body.system } : {}),
      ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
      messages: body.messages,
      // Tell Anthropic to stream when the client asked for it
      ...(wantStream ? { stream: true } : {}),
    });

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

    if (wantStream) {
      // ── STREAMING PATH ──────────────────────────────────────
      // Forward Anthropic's SSE response directly to the client
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering if present

      await new Promise((resolve, reject) => {
        const r = https.request(options, (response) => {
          // Pipe every chunk straight to the client as it arrives
          response.on('data', chunk => {
            if (!res.writableEnded) res.write(chunk);
          });
          response.on('end', () => {
            if (!res.writableEnded) res.end();
            resolve();
          });
          response.on('error', reject);
        });
        r.on('error', reject);
        r.write(payload);
        r.end();
      });

    } else {
      // ── NON-STREAMING PATH (unchanged) ──────────────────────
      const result = await new Promise((resolve, reject) => {
        const r = https.request(options, (response) => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => resolve({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString(),
          }));
          response.on('error', reject);
        });
        r.on('error', reject);
        r.write(payload);
        r.end();
      });

      res.status(result.status).send(result.body);
    }

  } catch(err) {
    if (!res.writableEnded) res.status(500).json({ error: err.message });
  }
};
