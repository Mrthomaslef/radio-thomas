// GET /api/questions — public, read-only list of live quiz questions (RLS hides deleted ones).
let cachedPublicQuestions = null;
let cachedPublicAt = 0;
const PUBLIC_CACHE_TTL_MS = 10000;

// Server-side circuit breaker against ?v= cache-busting loops from stale tabs:
// max 6 requests per 15 seconds per IP.
const ipHits = new Map();
function checkQuestionsRateLimit(req) {
  const ip =
    (req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  const now = Date.now();
  const prev = (ipHits.get(ip) || []).filter((t) => now - t < 15000);
  if (prev.length >= 6) {
    ipHits.set(ip, prev);
    return false;
  }
  prev.push(now);
  ipHits.set(ip, prev);
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  if (!checkQuestionsRateLimit(req)) {
    res.setHeader('Retry-After', '10');
    return res.status(429).json({ error: 'Trop de requêtes rapprochées. Patientez quelques secondes.' });
  }

  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  try {
    if (cachedPublicQuestions && Date.now() - cachedPublicAt < PUBLIC_CACHE_TTL_MS) {
      res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=3600');
      return res.status(200).json({ questions: cachedPublicQuestions });
    }

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
    cachedPublicQuestions = questions;
    cachedPublicAt = Date.now();
    // Served from Vercel's CDN to protect Supabase & Vercel bandwidth quotas.
    // The admin/reviewer pages bypass the cache with ?v=<timestamp> right after edits.
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ questions });
  } catch {
    return res.status(502).json({ error: 'Base de données injoignable' });
  }
}
