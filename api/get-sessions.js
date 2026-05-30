const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.POSTGRES_URL);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { email, limit = 10 } = req.query;
    if (!email) return res.status(400).json({ error: 'email required' });

    const result = await sql`
      SELECT
        id, language, job_title, started_at, ended_at,
        duration_seconds, overall_score, scores, audio_url, pdf_url
      FROM interview_sessions
      WHERE user_email = ${email.toLowerCase()}
        AND ended_at IS NOT NULL
      ORDER BY started_at DESC
      LIMIT ${parseInt(limit)}
    `;

    res.json({ sessions: result.rows });
  } catch(err) {
    console.error('get-sessions error:', err);
    res.status(500).json({ error: err.message });
  }
};
