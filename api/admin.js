// POST /api/admin {password} — lists quiz results. The password is checked inside Postgres
// (function admin_list_attempts), which also throttles wrong guesses.
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

  const body = readBody(req);
  const password = body && typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 200) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_list_attempts`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_password: password }),
    });
    if (!r.ok) return res.status(502).json({ error: `Erreur base de données (${r.status})` });

    const data = await r.json();
    if (data.status === 'locked') {
      return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard' });
    }
    if (data.status !== 'ok') {
      return res.status(401).json({ error: 'Mot de passe incorrect' });
    }
    return res.status(200).json({ attempts: data.attempts });
  } catch {
    return res.status(502).json({ error: 'Base de données injoignable' });
  }
}
