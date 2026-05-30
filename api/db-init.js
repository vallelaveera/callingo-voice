const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.POSTGRES_URL);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        native_lang TEXT DEFAULT 'en',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS interview_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID REFERENCES users(id),
        user_email TEXT NOT NULL,
        language TEXT DEFAULT 'en',
        job_title TEXT DEFAULT 'General',
        started_at TIMESTAMP DEFAULT NOW(),
        ended_at TIMESTAMP,
        duration_seconds INTEGER DEFAULT 0,
        transcript JSONB DEFAULT '[]',
        audio_url TEXT,
        pdf_url TEXT,
        scores JSONB DEFAULT '{}',
        feedback JSONB DEFAULT '{}',
        overall_score INTEGER DEFAULT 0
      )
    `;
    res.json({ ok: true, message: 'Tables created' });
  } catch(err) {
    console.error('DB init error:', err);
    res.status(500).json({ error: err.message });
  }
};
