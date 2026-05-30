const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.POSTGRES_URL);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    if (req.method === 'POST') {
      // Create new session at start of interview
      const { user_email, language = 'en', job_title = 'General' } = req.body || {};
      if (!user_email) return res.status(400).json({ error: 'user_email required' });

      const result = await sql`
        INSERT INTO interview_sessions (user_email, language, job_title)
        VALUES (${user_email.toLowerCase()}, ${language}, ${job_title})
        RETURNING id, started_at
      `;
      return res.json({ session: result.rows[0] });
    }

    if (req.method === 'PATCH') {
      // Update session at end with transcript + scores
      const {
        session_id,
        transcript = [],
        scores = {},
        feedback = {},
        overall_score = 0,
        duration_seconds = 0,
        audio_url = null,
        pdf_url = null,
      } = req.body || {};

      if (!session_id) return res.status(400).json({ error: 'session_id required' });

      const result = await sql`
        UPDATE interview_sessions SET
          ended_at = NOW(),
          transcript = ${JSON.stringify(transcript)},
          scores = ${JSON.stringify(scores)},
          feedback = ${JSON.stringify(feedback)},
          overall_score = ${overall_score},
          duration_seconds = ${duration_seconds},
          audio_url = ${audio_url},
          pdf_url = ${pdf_url}
        WHERE id = ${session_id}
        RETURNING *
      `;
      return res.json({ session: result.rows[0] });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch(err) {
    console.error('save-session error:', err);
    res.status(500).json({ error: err.message });
  }
};
