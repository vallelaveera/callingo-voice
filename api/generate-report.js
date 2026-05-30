const https  = require('https');
const { put } = require('@vercel/blob');
const { neon } = require('@neondatabase/serverless');
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
1. Communication Clarity — structured, clear answers
2. Confidence — assertive language, minimal filler words (um, uh, like)
3. Answer Depth — uses STAR method, gives specific examples
4. Relevance — actually answers the question asked
5. Language & Fluency — grammar, vocabulary, naturalness

Also identify:
- Specific good moments with exact quotes
- Specific issues with exact quotes and how to fix them
- Filler word count (um, uh, like, you know)
- One-word/very short answers that needed more depth

Return ONLY valid JSON:
{
  "scores": {
    "clarity": <0-20>,
    "confidence": <0-20>,
    "depth": <0-20>,
    "relevance": <0-20>,
    "fluency": <0-20>
  },
  "overall": <sum of above 0-100>,
  "feedback": {
    "strengths": ["<specific strength with quote>", ...],
    "improvements": [
      {
        "issue": "<what went wrong>",
        "example": "<exact quote from transcript>",
        "fix": "<specific advice on how to improve>"
      }
    ],
    "filler_count": <number>,
    "short_answers": ["<question where answer was too short>"],
    "summary": "<2-3 sentence overall assessment>"
  }
}`;

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
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
    const r = https.request(options, response => {
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        try {
          const data = JSON.parse(Buffer.concat(chunks).toString());
          const text = data.content?.[0]?.text || '{}';
          const clean = text.replace(/```json|```/g, '').trim();
          resolve(JSON.parse(clean));
        } catch(e) { reject(e); }
      });
    });
    r.on('error', reject);
    r.write(payload);
    r.end();
  });
}

// ─── Simple PDF generator (no external library needed) ────────
function generatePDFHTML(session, result, userName) {
  const { scores, overall, feedback } = result;
  const date = new Date(session.started_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });
  const duration = Math.round((session.duration_seconds || 0) / 60);
  const lang = session.language === 'de' ? 'German' : 'English';

  const scoreBar = (val, max = 20) => {
    const pct = Math.round((val / max) * 100);
    const color = pct >= 75 ? '#1a7a4a' : pct >= 50 ? '#c07a00' : '#c0392b';
    return `<div style="background:#f0f0f0;border-radius:4px;height:10px;width:100%;margin-top:4px;">
      <div style="background:${color};width:${pct}%;height:10px;border-radius:4px;"></div>
    </div>`;
  };

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  body { font-family: Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 40px; max-width: 800px; }
  h1 { color: #1a1a1a; font-size: 28px; margin-bottom: 4px; }
  .sub { color: #666; font-size: 14px; margin-bottom: 32px; }
  .score-ring { width: 120px; height: 120px; border-radius: 50%; background: conic-gradient(
    ${overall >= 75 ? '#1a7a4a' : overall >= 50 ? '#c07a00' : '#c0392b'} ${overall * 3.6}deg,
    #e0e0e0 0deg); display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; }
  .score-inner { width: 90px; height: 90px; background: white; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; flex-direction: column; }
  .score-num { font-size: 32px; font-weight: 800; color: #1a1a1a; }
  .score-label { font-size: 11px; color: #888; }
  .section { margin-bottom: 32px; }
  .section-title { font-size: 16px; font-weight: 700; border-bottom: 2px solid #e0e0e0;
    padding-bottom: 8px; margin-bottom: 16px; }
  .cat-row { display: flex; align-items: center; margin-bottom: 12px; gap: 12px; }
  .cat-name { width: 180px; font-size: 13px; color: #444; flex-shrink: 0; }
  .cat-score { width: 40px; font-size: 13px; font-weight: 700; text-align: right; flex-shrink: 0; }
  .cat-bar { flex: 1; }
  .strength { background: #f0fdf6; border-left: 3px solid #1a7a4a; padding: 10px 14px;
    margin-bottom: 8px; border-radius: 0 6px 6px 0; font-size: 13px; }
  .improvement { background: #fff8f0; border-left: 3px solid #c07a00; padding: 10px 14px;
    margin-bottom: 12px; border-radius: 0 6px 6px 0; }
  .improvement .issue { font-weight: 700; font-size: 13px; color: #c07a00; margin-bottom: 4px; }
  .improvement .example { font-size: 12px; color: #666; font-style: italic; margin-bottom: 4px; }
  .improvement .fix { font-size: 12px; color: #1a1a1a; }
  .transcript-row { margin-bottom: 8px; font-size: 12px; line-height: 1.5; }
  .ai-line { color: #1a5276; }
  .user-line { color: #1a1a1a; }
  .footer { margin-top: 48px; font-size: 11px; color: #aaa; text-align: center; }
</style>
</head>
<body>

<h1>Interview Report</h1>
<div class="sub">${userName} · ${lang} · ${date} · ${duration} min</div>

<div style="text-align:center;">
  <div class="score-ring">
    <div class="score-inner">
      <div class="score-num">${overall}</div>
      <div class="score-label">/ 100</div>
    </div>
  </div>
  <div style="font-size:14px;color:#666;margin-bottom:32px;">${feedback.summary}</div>
</div>

<div class="section">
  <div class="section-title">Category Scores</div>
  <div class="cat-row"><div class="cat-name">Communication Clarity</div><div class="cat-bar">${scoreBar(scores.clarity)}</div><div class="cat-score">${scores.clarity}/20</div></div>
  <div class="cat-row"><div class="cat-name">Confidence</div><div class="cat-bar">${scoreBar(scores.confidence)}</div><div class="cat-score">${scores.confidence}/20</div></div>
  <div class="cat-row"><div class="cat-name">Answer Depth</div><div class="cat-bar">${scoreBar(scores.depth)}</div><div class="cat-score">${scores.depth}/20</div></div>
  <div class="cat-row"><div class="cat-name">Relevance</div><div class="cat-bar">${scoreBar(scores.relevance)}</div><div class="cat-score">${scores.relevance}/20</div></div>
  <div class="cat-row"><div class="cat-name">Language & Fluency</div><div class="cat-bar">${scoreBar(scores.fluency)}</div><div class="cat-score">${scores.fluency}/20</div></div>
  ${feedback.filler_count > 0 ? `<div style="margin-top:12px;font-size:13px;color:#888;">⚠️ Filler words detected: <strong>${feedback.filler_count}</strong> times (um, uh, like, you know)</div>` : ''}
</div>

${feedback.strengths?.length ? `
<div class="section">
  <div class="section-title">✅ Strengths</div>
  ${feedback.strengths.map(s => `<div class="strength">${s}</div>`).join('')}
</div>` : ''}

${feedback.improvements?.length ? `
<div class="section">
  <div class="section-title">💡 Areas to Improve</div>
  ${feedback.improvements.map(i => `
    <div class="improvement">
      <div class="issue">${i.issue}</div>
      ${i.example ? `<div class="example">"${i.example}"</div>` : ''}
      <div class="fix">→ ${i.fix}</div>
    </div>
  `).join('')}
</div>` : ''}

${feedback.short_answers?.length ? `
<div class="section">
  <div class="section-title">📝 Questions That Needed Deeper Answers</div>
  ${feedback.short_answers.map(q => `<div style="font-size:13px;color:#666;margin-bottom:6px;">• ${q}</div>`).join('')}
</div>` : ''}

<div class="section">
  <div class="section-title">📄 Full Transcript</div>
  ${(session.transcript || []).map(t => `
    <div class="transcript-row ${t.role === 'ai' ? 'ai-line' : 'user-line'}">
      <strong>${t.role === 'ai' ? '🎙 Interviewer' : '👤 You'}:</strong> ${t.content}
    </div>
  `).join('')}
</div>

<div class="footer">Generated by Callingo · callingo.app</div>
</body>
</html>`;
}

// ─── Main handler ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const { session_id, user_name = 'Candidate', user_email } = req.body || {};
    if (!session_id) return res.status(400).json({ error: 'session_id required' });

    // Get session from DB
    const sessionResult = await sql`
      SELECT * FROM interview_sessions WHERE id = ${session_id}
    `;
    const session = sessionResult.rows[0];
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Score with Claude
    const result = await scoreWithClaude(
      session.transcript || [],
      session.language,
      session.job_title || 'General'
    );

    // Generate PDF HTML
    const pdfHTML = generatePDFHTML(session, result, user_name);

    // Save PDF HTML to Vercel Blob
    const pdfBlob = await put(
      `pdfs/${session_id}.html`,
      Buffer.from(pdfHTML, 'utf8'),
      { access: 'public', contentType: 'text/html', token: process.env.BLOB_READ_WRITE_TOKEN }
    );

    // Update session in DB with scores + pdf_url
    await sql`
      UPDATE interview_sessions SET
        scores = ${JSON.stringify(result.scores)},
        feedback = ${JSON.stringify(result.feedback)},
        overall_score = ${result.overall},
        pdf_url = ${pdfBlob.url}
      WHERE id = ${session_id}
    `;

    res.json({
      ok: true,
      scores: result.scores,
      overall: result.overall,
      feedback: result.feedback,
      pdf_url: pdfBlob.url,
    });

  } catch(err) {
    console.error('generate-report error:', err);
    res.status(500).json({ error: err.message });
  }
};
