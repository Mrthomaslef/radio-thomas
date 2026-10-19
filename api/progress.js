// GET /api/progress?name=<pseudo> — reads saved quiz progress for a pseudo.
// POST /api/progress { name, progress } — saves/merges quiz progress for a pseudo.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const CHAPTER_KEY = /^ch[0-9]{1,2}$/;
const QUESTION_ID = /^[a-z0-9-]{1,40}$/;
const ITEM_ID = /^[A-F]$/;

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return null;
  }
}

function cleanName(raw) {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > 80 || CONTROL_CHARS.test(name)) return null;
  return name;
}

function cleanProgress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [ch, val] of Object.entries(raw)) {
    if (!CHAPTER_KEY.test(ch) || !val || typeof val !== 'object') continue;
    const rawAnswers = val.answers && typeof val.answers === 'object' ? val.answers : {};
    const answers = {};
    for (const [qid, picked] of Object.entries(rawAnswers)) {
      if (!QUESTION_ID.test(qid) || !Array.isArray(picked)) continue;
      const validPicked = picked.filter((x) => typeof x === 'string' && ITEM_ID.test(x)).slice(0, 6);
      if (validPicked.length > 0) answers[qid] = [...new Set(validPicked)];
    }
    out[ch] = {
      answers,
      sent: Boolean(val.sent),
    };
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    'Content-Type': 'application/json',
  };

  if (req.method === 'GET') {
    const name = cleanName(req.query?.name);
    if (!name) return res.status(400).json({ error: 'Pseudo invalide' });
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_quiz_progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_name: name }),
      });
      if (!r.ok) return res.status(200).json({ progress: {} });
      const data = await r.json();
      return res.status(200).json({ progress: data?.progress || {} });
    } catch {
      return res.status(200).json({ progress: {} });
    }
  }

  if (req.method === 'POST') {
    const body = readBody(req);
    const name = cleanName(body?.name);
    const progress = cleanProgress(body?.progress);
    if (!name || !progress) return res.status(400).json({ error: 'Données de progression invalides' });
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_quiz_progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_name: name, p_progress: progress }),
      });
      if (!r.ok) return res.status(502).json({ error: `Erreur base de données (${r.status})` });
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(502).json({ error: 'Base de données injoignable' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Méthode non autorisée' });
}
