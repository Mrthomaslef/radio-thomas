// Public leaderboards, computed by the database:
// - GET /api/leaderboard                     -> quiz points   (RPC get_leaderboard)
// - GET /api/leaderboard?type=contributors   -> contributors  (RPC get_contributors_leaderboard)
// Both return { type, entries: [{ name, points, quizzes|reports+submissions, updatedAt }] }.
// The two lists never share data: quiz points come from passed quiz attempts, contributor points
// from question reports and accepted proposals.

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') {
    // Old browsers used to push their own totals here; the server now computes everything itself.
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: 'Variables Supabase manquantes côté serveur.' });
  }

  const isContrib = req.query?.type === 'contributors';
  try {
    const r = await fetch(
      `${url}/rest/v1/rpc/${isContrib ? 'get_contributors_leaderboard' : 'get_leaderboard'}`,
      {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }
    );
    if (!r.ok) {
      return res.status(502).json({ error: `Erreur base de données (${r.status})` });
    }
    const rows = await r.json();
    const entries = (Array.isArray(rows) ? rows : []).map((row) => ({
      name: row.name,
      points: row.points,
      quizzes: isContrib ? 0 : row.quizzes || 0,
      reports: isContrib ? row.reports || 0 : 0,
      submissions: isContrib ? row.submissions || 0 : 0,
      updatedAt: row.updatedAt || null,
    }));
    return res.status(200).json({ type: isContrib ? 'contributors_v4' : 'quiz', entries });
  } catch {
    return res.status(502).json({ error: 'Base de données injoignable' });
  }
}
