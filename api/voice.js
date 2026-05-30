const https  = require('https');
const { SonioxNodeClient } = require('@soniox/node');

const sonioxClient = new SonioxNodeClient();

// Language maps
const SONIOX_LANG_MAP = {
  'te': 'te', 'te-IN': 'te',
  'kn': 'kn', 'kn-IN': 'kn',
  'hi': 'hi', 'hi-IN': 'hi',
  'en': 'en', 'en-IN': 'en',
  'de': 'de',
};

// ─── Helpers ──────────────────────────────────────────────────
function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const buf = typeof body === 'string' ? Buffer.from(body) : body;
    const opts = { hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': buf.length } };
    const chunks = [];
    const r = https.request(opts, res => {
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    r.on('error', reject);
    r.write(buf);
    r.end();
  });
}

// ─── Main handler ─────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Id, X-User-Email');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const action = req.query.action;

  try {

    // ── GET SONIOX TEMP KEY (for browser WebSocket STT) ───────
    if (action === 'soniox-tmp-key') {
      const { api_key, expires_at } = await sonioxClient.auth.createTemporaryKey({
        usage_type: 'transcribe_websocket',
        expires_in_seconds: 300,
      });
      return res.json({ api_key, expires_at });
    }

    // ── SONIOX TTS (Telugu / Kannada voice) ───────────────────
    if (action === 'soniox-tts') {
      const { text, language = 'te', voice = 'Maya' } = req.body || {};
      if (!text) return res.status(400).json({ error: 'No text' });

      const lang = SONIOX_LANG_MAP[language] || language;
      const cleanText = text
        .replace(/[౦-౯]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0C66 + 48))
        .replace(/[೦-೯]/g, d => String.fromCharCode(d.charCodeAt(0) - 0x0CE6 + 48));

      const payload = JSON.stringify({ model: 'tts-rt-v1', text: cleanText, language: lang, voice, audio_format: 'mp3' });
      const result  = await httpsPost('tts-rt.soniox.com', '/tts', {
        'Authorization': `Bearer ${process.env.SONIOX_API_KEY}`,
        'Content-Type': 'application/json',
      }, payload);

      if (result.status !== 200) {
        console.error('[Soniox TTS]', result.status, result.body.toString());
        return res.status(result.status).json({ error: result.body.toString() });
      }
      console.log(`[Soniox TTS] ✅ ${lang} ${result.body.length} bytes`);
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Length', result.body.length);
      return res.send(result.body);
    }

    // ── SARVAM TTS (fallback Indic TTS) ───────────────────────
    if (action === 'sarvam-tts') {
      const { text, language = 'te-IN', speaker = 'meera', pace = 1.0 } = req.body || {};
      if (!text) return res.status(400).json({ error: 'No text' });

      const defaultSpeaker = language === 'kn-IN' ? 'pavithra' : 'meera';
      const payload = JSON.stringify({
        inputs: [text], target_language_code: language,
        speaker: speaker || defaultSpeaker, pace, model: 'bulbul:v3', enable_preprocessing: true,
      });
      const result = await httpsPost('api.sarvam.ai', '/text-to-speech', {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'Content-Type': 'application/json',
      }, payload);

      if (result.status !== 200) return res.status(result.status).json({ error: result.body.toString() });
      const data   = JSON.parse(result.body.toString());
      const audioBuf = Buffer.from(data.audios?.[0] || '', 'base64');
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('Content-Length', audioBuf.length);
      return res.send(audioBuf);
    }

    // ── SARVAM STT (Telugu/Kannada speech → text) ─────────────
    if (action === 'sarvam-transcribe') {
      const audioBuffer = req.body;
      const lang = req.query.lang || 'te-IN';
      if (!audioBuffer || audioBuffer.length === 0) return res.status(400).json({ error: 'No audio' });

      const boundary = '----SarvamBoundary' + Date.now();
      const header   = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.webm"\r\nContent-Type: audio/webm\r\n\r\n`);
      const fields   = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nsaarika:v2.5\r\n--${boundary}\r\nContent-Disposition: form-data; name="language_code"\r\n\r\n${lang}\r\n--${boundary}\r\nContent-Disposition: form-data; name="with_timestamps"\r\n\r\nfalse\r\n--${boundary}--\r\n`);
      const body     = Buffer.concat([header, audioBuffer, fields]);

      const result = await httpsPost('api.sarvam.ai', '/speech-to-text', {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      }, body);

      if (result.status !== 200) return res.status(result.status).json({ error: result.body.toString() });
      const data = JSON.parse(result.body.toString());
      return res.json({ text: data.transcript || '' });
    }

    // ── SARVAM TRANSLATE (Indic ↔ English) ───────────────────
    if (action === 'sarvam-translate') {
      const { text, source = 'te-IN', target = 'en-IN' } = req.body || {};
      if (!text) return res.status(400).json({ error: 'No text' });

      const payload = JSON.stringify({
        input: text, source_language_code: source, target_language_code: target,
        speaker_gender: 'Female', mode: 'formal', model: 'mayura:v1', enable_preprocessing: false,
      });
      const result = await httpsPost('api.sarvam.ai', '/translate', {
        'api-subscription-key': process.env.SARVAM_API_KEY,
        'Content-Type': 'application/json',
      }, payload);

      if (result.status !== 200) return res.status(result.status).json({ error: result.body.toString() });
      const data = JSON.parse(result.body.toString());
      return res.json({ translated: data.translated_text || '' });
    }

    res.status(400).json({ error: 'Unknown action. Use ?action=soniox-tmp-key|soniox-tts|sarvam-tts|sarvam-transcribe|sarvam-translate' });

  } catch (err) {
    console.error('[voice]', action, err.message);
    res.status(500).json({ error: err.message });
  }
};
