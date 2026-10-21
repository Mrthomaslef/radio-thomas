// GET /api/questions — public, read-only list of live quiz questions (RLS hides deleted ones).
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/quiz_questions?select=id,chapter,position,data&deleted_at=is.null&order=chapter.asc,position.asc&limit=2000`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
      }
    );
    if (!r.ok) return res.status(502).json({ error: `Erreur base de données (${r.status})` });
    const questions = await r.json();
    // Short cache: a correction made in the admin shows up within ~30 s.
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({ questions });
  } catch {
    return res.status(502).json({ error: 'Base de données injoignable' });
  }
}
