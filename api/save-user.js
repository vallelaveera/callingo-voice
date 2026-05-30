const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.POSTGRES_URL);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    if (req.method === 'POST') {
      // Register or login
      const { name, email, native_lang = 'en' } = req.body || {};
      if (!name || !email) return res.status(400).json({ error: 'Name and email required' });

      // Upsert — if email exists update name, else insert
      const result = await sql`
        INSERT INTO users (name, email, native_lang)
        VALUES (${name}, ${email.toLowerCase()}, ${native_lang})
        ON CONFLICT (email) DO UPDATE
        SET name = ${name}, native_lang = ${native_lang}
        RETURNING *
      `;
      return res.json({ user: result.rows[0] });
    }

    if (req.method === 'GET') {
      const email = req.query.email;
      if (!email) return res.status(400).json({ error: 'Email required' });
      const result = await sql`
        SELECT * FROM users WHERE email = ${email.toLowerCase()}
      `;
      return res.json({ user: result.rows[0] || null });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch(err) {
    console.error('save-user error:', err);
    res.status(500).json({ error: err.message });
  }
};
