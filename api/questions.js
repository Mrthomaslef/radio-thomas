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
    const headers = {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    };
    const [r, ovRes] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/quiz_questions?select=id,chapter,position,data,updated_at&deleted_at=is.null&order=chapter.asc,position.asc&limit=2000`,
        { headers }
      ),
      fetch(`${SUPABASE_URL}/rest/v1/rpc/get_quiz_progress`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_name: '__rev_questions__' }),
      }).catch(() => null),
    ]);
    if (!r.ok) return res.status(502).json({ error: `Erreur base de données (${r.status})` });
    const baseQuestions = await r.json();
    const map = new Map(baseQuestions.map((q) => [q.id, q]));

    if (ovRes && ovRes.ok) {
      const ovData = await ovRes.json().catch(() => ({}));
      const overlay = ovData?.progress;
      if (overlay && typeof overlay === 'object' && !Array.isArray(overlay)) {
        for (const [id, ov] of Object.entries(overlay)) {
          if (ov && ov.id && ov.chapter && ov.data) {
            const existing = map.get(id);
            if (!existing || !existing.updated_at || (ov.updated_at && ov.updated_at >= existing.updated_at)) {
              map.set(id, ov);
            }
          }
        }
      }
    }

    const questions = [...map.values()].map((q) => {
      if (q?.data?.reviewed && !q.data.reviewed_by) {
        return { ...q, data: { ...q.data, reviewed_by: 'Thomas L.' } };
      }
      return q;
    });
    // Short cache: a correction made in the admin shows up within ~30 s.
    res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
    return res.status(200).json({ questions });
  } catch {
    return res.status(502).json({ error: 'Base de données injoignable' });
  }
}
