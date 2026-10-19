// POST /api/reports — public submission of a question report, or admin resolution of a report.
import { randomBytes } from 'node:crypto';

const CHAPTER = /^ch[0-9]{1,2}$/;
const QUESTION_ID = /^[a-z0-9-]{1,40}$/;
const REPORT_SLUG = /^report-[a-z0-9-]{4,50}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    'Content-Type': 'application/json',
  };

  const body = readBody(req);
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Requête invalide' });
  }

  // Admin action: mark a report as resolved
  if (body.action === 'resolve') {
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || password.length > 200) {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }

    // Verify admin password via admin_list_attempts
    try {
      const checkRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_list_attempts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_password: password }),
      });
      if (!checkRes.ok) return res.status(502).json({ error: `Erreur base de données (${checkRes.status})` });
      const checkData = await checkRes.json();
      if (checkData.status === 'locked') {
        return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard' });
      }
      if (checkData.status !== 'ok') {
        return res.status(401).json({ error: 'Mot de passe incorrect' });
      }

      if (typeof body.id === 'number' || /^\d+$/.test(String(body.id))) {
        await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_resolve_report`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ p_password: password, p_id: Number(body.id) }),
        });
        return res.status(200).json({ ok: true });
      }

      if (typeof body.id === 'string' && REPORT_SLUG.test(body.id)) {
        const qid = QUESTION_ID.test(body.questionId || '') ? body.questionId : 'c1-q01';
        const r = await fetch(`${SUPABASE_URL}/rest/v1/quiz_attempts`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify({
            participant_name: '__resolved__',
            course: body.id,
            quiz: qid,
            score: 1,
            total: 1,
            passed: true,
          }),
        });
        if (!r.ok) return res.status(502).json({ error: `Erreur base de données (${r.status})` });
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: 'Identifiant de signalement invalide' });
    } catch {
      return res.status(502).json({ error: 'Base de données injoignable' });
    }
  }

  // Public action: submit a new report on a question
  const rawName = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
  const name = rawName.slice(0, 80) || 'Anonyme';
  const chapter = typeof body.chapter === 'string' ? body.chapter.trim() : '';
  const questionId = typeof body.questionId === 'string' ? body.questionId.trim() : '';
  const message = typeof body.message === 'string' ? body.message.replace(/\r\n/g, '\n').trim() : '';

  if (!CHAPTER.test(chapter)) return res.status(400).json({ error: 'Chapitre invalide' });
  if (!QUESTION_ID.test(questionId)) return res.status(400).json({ error: 'Identifiant de question invalide' });
  if (message.length < 2 || message.length > 600 || CONTROL_CHARS.test(message)) {
    return res.status(400).json({ error: 'Le message doit contenir entre 2 et 600 caractères' });
  }

  try {
    // 1. Try inserting into dedicated quiz_reports table if migration is applied
    const direct = await fetch(`${SUPABASE_URL}/rest/v1/quiz_reports`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        participant_name: name,
        chapter,
        question_id: questionId,
        message,
      }),
    });
    if (direct.ok) {
      return res.status(200).json({ ok: true });
    }

    // 2. Fallback: store encoded report chunks in quiz_attempts so it works even before migration
    const reportSlug = `report-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
    const b64 = Buffer.from(JSON.stringify({ u: name, c: chapter, m: message }), 'utf8').toString('base64');
    const chunks = [];
    for (let i = 0; i < b64.length; i += 76) {
      chunks.push(b64.slice(i, i + 76));
    }
    const rows = chunks.map((chunk, idx) => ({
      participant_name: chunk,
      course: reportSlug,
      quiz: questionId,
      score: idx,
      total: chunks.length,
      passed: false,
    }));

    const fb = await fetch(`${SUPABASE_URL}/rest/v1/quiz_attempts`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    });
    if (!fb.ok) return res.status(502).json({ error: `Erreur base de données (${fb.status})` });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'Base de données injoignable' });
  }
}
