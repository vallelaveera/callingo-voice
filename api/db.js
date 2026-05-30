const { neon } = require('@neondatabase/serverless');
const { put }  = require('@vercel/blob');
const https    = require('https');

const sql = neon(process.env.POSTGRES_URL);

// ─── Claude scoring ───────────────────────────────────────────
async function scoreWithClaude(transcript, language, jobTitle) {
  const conversation = transcript
    .map(t => `${t.role === 'ai' ? 'Interviewer' : 'Candidate'}: ${t.content}`)
    .join('\n');

  const prompt = `You are an expert interview coach. Analyse this ${language === 'de' ? 'German' : 'English'} mock interview for a ${jobTitle} role.

TRANSCRIPT:
${conversation}

Score the candidate across these 5 categories (0-20 each):
1. Communication Clarity
2. Confidence
3. Answer Depth (STAR method, examples)
4. Relevance
5. Language & Fluency

Return ONLY valid JSON:
{
  "scores": { "clarity":<0-20>, "confidence":<0-20>, "depth":<0-20>, "relevance":<0-20>, "fluency":<0-20> },
  "overall": <0-100>,
  "feedback": {
    "strengths": ["<specific strength>"],
    "improvements": [{ "issue":"<what>", "example":"<quote>", "fix":"<how>" }],
    "filler_count": <number>,
    "short_answers": ["<question>"],
    "summary": "<2-3 sentences>"
  }
}`;

  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const chunks = [];
    const r = https.request(options, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const text = data.content?.[0]?.text || '{}';
          resolve(JSON.parse(text.replace(/```json|```/g,'').trim()));
        } catch(e) { reject(e); }
      });
    });
    r.on('error', reject);
    r.write(payload);
    r.end();
  });
}

function generateReportHTML(session, result, userName) {
  const { scores, overall, feedback } = result;
  const date = new Date(session.started_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' });
  const dur  = Math.round((session.duration_seconds || 0) / 60);
  const lang = session.language === 'de' ? 'German' : 'English';
  const color = overall >= 75 ? '#1a7a4a' : overall >= 50 ? '#c07a00' : '#c0392b';

  const bar = (v, max=20) => {
    const p = Math.round((v/max)*100);
    const c = p>=75?'#1a7a4a':p>=50?'#c07a00':'#c0392b';
    return `<div style="background:#f0f0f0;border-radius:4px;height:10px;width:100%;margin-top:4px;"><div style="background:${c};width:${p}%;height:10px;border-radius:4px;"></div></div>`;
  };

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>body{font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:40px;max-width:800px;}
h1{font-size:28px;margin-bottom:4px;}.sub{color:#666;font-size:14px;margin-bottom:32px;}
.ring{width:120px;height:120px;border-radius:50%;background:conic-gradient(${color} ${overall*3.6}deg,#e0e0e0 0deg);display:flex;align-items:center;justify-content:center;margin:0 auto 24px;}
.inner{width:90px;height:90px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-direction:column;}
.num{font-size:32px;font-weight:800;}.lbl{font-size:11px;color:#888;}
.section{margin-bottom:32px;}.stitle{font-size:16px;font-weight:700;border-bottom:2px solid #e0e0e0;padding-bottom:8px;margin-bottom:16px;}
.cat{display:flex;align-items:center;margin-bottom:12px;gap:12px;}
.catname{width:180px;font-size:13px;color:#444;flex-shrink:0;}.catscore{width:40px;font-size:13px;font-weight:700;text-align:right;}
.strength{background:#f0fdf6;border-left:3px solid #1a7a4a;padding:10px 14px;margin-bottom:8px;border-radius:0 6px 6px 0;font-size:13px;}
.improve{background:#fff8f0;border-left:3px solid #c07a00;padding:10px 14px;margin-bottom:12px;border-radius:0 6px 6px 0;}
.issue{font-weight:700;font-size:13px;color:#c07a00;margin-bottom:4px;}
.example{font-size:12px;color:#666;font-style:italic;margin-bottom:4px;}
.fix{font-size:12px;}.trow{margin-bottom:8px;font-size:12px;line-height:1.5;}
.ai{color:#1a5276;}.user{color:#1a1a1a;}.footer{margin-top:48px;font-size:11px;color:#aaa;text-align:center;}
</style></head><body>
<h1>Interview Report</h1>
<div class="sub">${userName} · ${lang} · ${date} · ${dur} min</div>
<div style="text-align:center;">
  <div class="ring"><div class="inner"><div class="num">${overall}</div><div class="lbl">/ 100</div></div></div>
  <div style="font-size:14px;color:#666;margin-bottom:32px;">${feedback.summary || ''}</div>
</div>
<div class="section"><div class="stitle">Category Scores</div>
  <div class="cat"><div class="catname">Communication Clarity</div><div style="flex:1">${bar(scores.clarity)}</div><div class="catscore">${scores.clarity}/20</div></div>
  <div class="cat"><div class="catname">Confidence</div><div style="flex:1">${bar(scores.confidence)}</div><div class="catscore">${scores.confidence}/20</div></div>
  <div class="cat"><div class="catname">Answer Depth</div><div style="flex:1">${bar(scores.depth)}</div><div class="catscore">${scores.depth}/20</div></div>
  <div class="cat"><div class="catname">Relevance</div><div style="flex:1">${bar(scores.relevance)}</div><div class="catscore">${scores.relevance}/20</div></div>
  <div class="cat"><div class="catname">Language & Fluency</div><div style="flex:1">${bar(scores.fluency)}</div><div class="catscore">${scores.fluency}/20</div></div>
  ${feedback.filler_count>0?`<div style="margin-top:12px;font-size:13px;color:#888;">⚠️ Filler words: <strong>${feedback.filler_count}</strong> times</div>`:''}
</div>
${feedback.strengths?.length?`<div class="section"><div class="stitle">✅ Strengths</div>${feedback.strengths.map(s=>`<div class="strength">${s}</div>`).join('')}</div>`:''}
${feedback.improvements?.length?`<div class="section"><div class="stitle">💡 Areas to Improve</div>${feedback.improvements.map(i=>`<div class="improve"><div class="issue">${i.issue}</div>${i.example?`<div class="example">"${i.example}"</div>`:''}<div class="fix">→ ${i.fix}</div></div>`).join('')}</div>`:''}
<div class="section"><div class="stitle">📄 Transcript</div>${(session.transcript||[]).map(t=>`<div class="trow ${t.role==='ai'?'ai':'user'}"><strong>${t.role==='ai'?'🎙 Interviewer':'👤 You'}:</strong> ${t.content}</div>`).join('')}</div>
<div class="footer">Generated by Callingo</div>
</body></html>`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id, X-User-Email, X-Action');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Route by X-Action header or query param
  const action = req.headers['x-action'] || req.query.action;

  try {
    // ── INIT DB ──────────────────────────────────────────────
    if (action === 'init') {
      await sql`CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
        native_lang TEXT DEFAULT 'en', created_at TIMESTAMP DEFAULT NOW()
      )`;
      await sql`CREATE TABLE IF NOT EXISTS interview_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID, user_email TEXT NOT NULL,
        language TEXT DEFAULT 'en', job_title TEXT DEFAULT 'General',
        started_at TIMESTAMP DEFAULT NOW(), ended_at TIMESTAMP,
        duration_seconds INTEGER DEFAULT 0, transcript JSONB DEFAULT '[]',
        audio_url TEXT, pdf_url TEXT, scores JSONB DEFAULT '{}',
        feedback JSONB DEFAULT '{}', overall_score INTEGER DEFAULT 0
      )`;
      return res.json({ ok: true, message: 'Tables created' });
    }

    // ── SAVE / GET USER ──────────────────────────────────────
    if (action === 'save-user') {
      if (req.method === 'GET') {
        const email = req.query.email;
        if (!email) return res.status(400).json({ error: 'Email required' });
        const rows = await sql`SELECT * FROM users WHERE email=${email.toLowerCase()}`;
        return res.json({ user: rows[0] || null });
      }
      const { name, email, native_lang='en' } = req.body||{};
      if (!name||!email) return res.status(400).json({ error: 'Name and email required' });
      const rows = await sql`
        INSERT INTO users (name,email,native_lang) VALUES (${name},${email.toLowerCase()},${native_lang})
        ON CONFLICT (email) DO UPDATE SET name=${name},native_lang=${native_lang} RETURNING *`;
      return res.json({ user: rows[0] });
    }

    // ── SAVE SESSION ─────────────────────────────────────────
    if (action === 'save-session') {
      if (req.method === 'POST') {
        const { user_email, language='en', job_title='General' } = req.body||{};
        if (!user_email) return res.status(400).json({ error: 'user_email required' });
        const rows = await sql`
          INSERT INTO interview_sessions (user_email,language,job_title)
          VALUES (${user_email.toLowerCase()},${language},${job_title}) RETURNING id,started_at`;
        return res.json({ session: rows[0] });
      }
      if (req.method === 'PATCH') {
        const { session_id, transcript=[], scores={}, feedback={}, overall_score=0, duration_seconds=0, audio_url=null, pdf_url=null } = req.body||{};
        if (!session_id) return res.status(400).json({ error: 'session_id required' });
        const rows = await sql`
          UPDATE interview_sessions SET ended_at=NOW(),
          transcript=${JSON.stringify(transcript)}, scores=${JSON.stringify(scores)},
          feedback=${JSON.stringify(feedback)}, overall_score=${overall_score},
          duration_seconds=${duration_seconds}, audio_url=${audio_url}, pdf_url=${pdf_url}
          WHERE id=${session_id} RETURNING *`;
        return res.json({ session: rows[0] });
      }
    }

    // ── GET SESSIONS ─────────────────────────────────────────
    if (action === 'get-sessions') {
      const { email, limit=10 } = req.query;
      if (!email) return res.status(400).json({ error: 'email required' });
      const rows = await sql`
        SELECT id,language,job_title,started_at,ended_at,duration_seconds,
               overall_score,scores,audio_url,pdf_url
        FROM interview_sessions WHERE user_email=${email.toLowerCase()}
        AND ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ${parseInt(limit)}`;
      return res.json({ sessions: rows });
    }

    // ── SAVE RECORDING ───────────────────────────────────────
    if (action === 'save-recording') {
      const audioBuffer = req.body;
      const sessionId   = req.headers['x-session-id'] || 'unknown';
      const userEmail   = req.headers['x-user-email']  || 'unknown';
      if (!audioBuffer||audioBuffer.length===0) return res.status(400).json({ error: 'No audio' });
      const blob = await put(
        `recordings/${userEmail.replace('@','_')}/${sessionId}.webm`,
        audioBuffer,
        { access:'public', contentType:'audio/webm', token: process.env.BLOB_READ_WRITE_TOKEN }
      );
      return res.json({ url: blob.url });
    }

    // ── GENERATE REPORT ──────────────────────────────────────
    if (action === 'generate-report') {
      const { session_id, user_name='Candidate' } = req.body||{};
      if (!session_id) return res.status(400).json({ error: 'session_id required' });
      const rows = await sql`SELECT * FROM interview_sessions WHERE id=${session_id}`;
      const session = rows[0];
      if (!session) return res.status(404).json({ error: 'Session not found' });
      const result = await scoreWithClaude(session.transcript||[], session.language, session.job_title||'General');
      const html   = generateReportHTML(session, result, user_name);
      const pdfBlob = await put(`pdfs/${session_id}.html`, Buffer.from(html,'utf8'),
        { access:'public', contentType:'text/html', token: process.env.BLOB_READ_WRITE_TOKEN });
      await sql`UPDATE interview_sessions SET scores=${JSON.stringify(result.scores)},
        feedback=${JSON.stringify(result.feedback)}, overall_score=${result.overall},
        pdf_url=${pdfBlob.url} WHERE id=${session_id}`;
      return res.json({ ok:true, scores:result.scores, overall:result.overall, feedback:result.feedback, pdf_url:pdfBlob.url });
    }

    res.status(400).json({ error: 'Unknown action. Use ?action=init|save-user|save-session|get-sessions|save-recording|generate-report' });

  } catch(err) {
    console.error('[DB]', action, err.message);
    res.status(500).json({ error: err.message });
  }
};
