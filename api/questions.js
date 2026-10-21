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
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/quiz_questions?select=id,chapter,position,data,updated_at&deleted_at=is.null&order=chapter.asc,position.asc&limit=2000`,
      { headers }
    );
    if (!r.ok) return res.status(502).json({ error: `Erreur base de données (${r.status})` });
    const baseQuestions = await r.json();
    const map = new Map(baseQuestions.map((q) => [q.id, q]));

    const questions = [...map.values()]
      .filter((q) => q && q.id !== 'cfg-ai-key' && q.chapter !== 'ch99')
      .map((q) => {
        if (q?.data?.reviewed && !q.data.reviewed_by) {
          return { ...q, data: { ...q.data, reviewed_by: 'Thomas L.' } };
        }
        return q;
      });
    // Always serve fresh questions so edits made on a computer appear immediately on phones/tablets.
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json({ questions });
  } catch {
    return res.status(502).json({ error: 'Base de données injoignable' });
  }
}
