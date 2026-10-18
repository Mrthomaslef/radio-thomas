// POST /api/attempts — stores one quiz result. Public (insert-only); names cannot be read back from here.
const SLUG = /^[a-z0-9-]{1,60}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return null;
  }
}

function validate(b) {
  if (!b || typeof b !== 'object') return 'Corps de requête invalide';
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 1 || name.length > 80 || CONTROL_CHARS.test(name)) return 'Nom invalide';
  if (typeof b.course !== 'string' || !SLUG.test(b.course)) return 'Cours invalide';
  if (typeof b.quiz !== 'string' || !SLUG.test(b.quiz)) return 'Quiz invalide';
  if (!Number.isInteger(b.total) || b.total < 1 || b.total > 100) return 'Total invalide';
  if (!Number.isInteger(b.score) || b.score < 0 || b.score > b.total) return 'Score invalide';
  if (typeof b.passed !== 'boolean') return 'Résultat invalide';
  if (b.startedAt !== undefined && (typeof b.startedAt !== 'string' || Number.isNaN(Date.parse(b.startedAt)))) {
    return 'Date de début invalide';
  }
  return null;
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

  const body = readBody(req);
  const problem = validate(body);
  if (problem) return res.status(400).json({ error: problem });

  const row = {
    participant_name: body.name.trim(),
    course: body.course,
    quiz: body.quiz,
    score: body.score,
    total: body.total,
    passed: body.passed,
    started_at: body.startedAt ? new Date(body.startedAt).toISOString() : null,
  };

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/quiz_attempts`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (!r.ok) return res.status(502).json({ error: `Erreur base de données (${r.status})` });
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'Base de données injoignable' });
  }
}
