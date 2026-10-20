// Public leaderboard endpoint:
// - GET  /api/leaderboard[?type=contributors] -> returns [{ name, points, quizzes|reports, updatedAt }]
// - POST /api/leaderboard[?type=contributors] -> updates a player's leaderboard entry

const LEADERBOARD_KEY = '__leaderboard_v2__';
const CONTRIB_KEY = '__contributors_v2__';
const cleanName = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '');
const normKey = (s) => cleanName(s).toLowerCase();

function fromHex(hex) {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) return '';
  try {
    return Buffer.from(hex, 'hex').toString('utf8');
  } catch {
    return '';
  }
}

function decodeEntryKey(key) {
  if (typeof key !== 'string') return null;
  const m = key.match(/^lb2-([0-9a-f]{2,24})-(\d{1,6})-(\d{1,5})$/);
  if (!m) return null;
  const name = cleanName(fromHex(m[1]));
  if (!name) return null;
  return {
    name,
    points: parseInt(m[2], 10) || 0,
    quizzes: parseInt(m[3], 10) || 0,
  };
}

function decodeContribKey(key) {
  if (typeof key !== 'string') return null;
  const m = key.match(/^cb2-([0-9a-f]{2,24})-(\d{1,6})$/);
  if (!m) return null;
  const name = cleanName(fromHex(m[1]));
  if (!name) return null;
  const points = parseInt(m[2], 10) || 0;
  return {
    kind: 'contributors',
    name,
    points,
    reports: points,
  };
}

export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return res.status(500).json({ error: 'Variables Supabase manquantes côté serveur.' });
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  try {
    const body =
      req.method === 'POST'
        ? typeof req.body === 'string'
          ? JSON.parse(req.body || '{}')
          : req.body || {}
        : {};
    const isContrib = req.query?.type === 'contributors' || body?.type === 'contributors';
    const targetProgressKey = isContrib ? CONTRIB_KEY : LEADERBOARD_KEY;

    if (req.method === 'GET') {
      const merged = new Map();

      const addEntry = (raw) => {
        if (!raw || typeof raw !== 'object') return;
        const name = cleanName(raw.name);
        if (!name || name === LEADERBOARD_KEY || name === CONTRIB_KEY || name === '__leaderboard__') return;
        if (isContrib && raw.kind !== 'contributors' && (typeof raw.reports !== 'number' || typeof raw.quizzes === 'number')) {
          return;
        }
        const k = normKey(name);
        const points = Math.max(0, Number(raw.points) || 0);
        const quizzes = isContrib ? 0 : Math.max(0, Number(raw.quizzes) || 0);
        const reports = isContrib ? Math.max(0, Number(raw.reports ?? raw.points) || 0) : 0;
        const updatedAt = raw.updatedAt || raw.updated_at || null;
        const prev = merged.get(k);
        if (!prev) {
          merged.set(k, {
            ...(isContrib ? { kind: 'contributors' } : {}),
            name,
            points: isContrib ? reports : points,
            quizzes,
            reports,
            updatedAt,
          });
        } else {
          const nextReports = Math.max(prev.reports, reports);
          const nextPoints = isContrib ? nextReports : Math.max(prev.points, points);
          merged.set(k, {
            ...(isContrib ? { kind: 'contributors' } : {}),
            name: updatedAt && (!prev.updatedAt || updatedAt >= prev.updatedAt) ? name : prev.name,
            points: nextPoints,
            quizzes: Math.max(prev.quizzes, quizzes),
            reports: nextReports,
            updatedAt: updatedAt && (!prev.updatedAt || updatedAt > prev.updatedAt) ? updatedAt : prev.updatedAt,
          });
        }
      };

      // 1) Try dedicated RPC get_leaderboard() for quiz leaderboard
      if (!isContrib) {
        try {
          const r1 = await fetch(`${url}/rest/v1/rpc/get_leaderboard`, {
            method: 'POST',
            headers,
            body: JSON.stringify({}),
          });
          if (r1.ok) {
            const rows = await r1.json();
            if (Array.isArray(rows)) rows.forEach(addEntry);
          }
        } catch {
          // Ignore if migration not yet applied
        }
      }

      // 2) Read shared progress entry
      try {
        const r2 = await fetch(`${url}/rest/v1/rpc/get_quiz_progress`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ p_name: targetProgressKey }),
        });
        if (r2.ok) {
          const data = await r2.json();
          const map = data?.progress && typeof data.progress === 'object' ? data.progress : data;
          if (map && typeof map === 'object' && !Array.isArray(map)) {
            for (const [k, v] of Object.entries(map)) {
              if (k === 'ch99' && v?.answers && typeof v.answers === 'object') {
                for (const qid of Object.keys(v.answers)) {
                  const decoded = isContrib ? decodeContribKey(qid) : decodeEntryKey(qid);
                  if (decoded) addEntry(decoded);
                }
              } else if (v && typeof v === 'object' && v.name) {
                addEntry(v);
              }
            }
          }
        }
      } catch {
        // Ignore if migration not yet applied
      }

      const entries = [...merged.values()].sort(
        (a, b) => b.points - a.points || b.quizzes - a.quizzes || a.name.localeCompare(b.name, 'fr')
      );

      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ type: isContrib ? 'contributors' : 'quiz', entries });
    }

    if (req.method === 'POST') {
      const name = cleanName(body.name);
      if (!name || name.length > 80 || name === LEADERBOARD_KEY || name === CONTRIB_KEY) {
        return res.status(400).json({ error: 'Pseudo invalide.' });
      }
      const points = Math.max(0, Math.min(100000, Math.round(Number(body.points) || 0)));
      const quizzes = isContrib ? 0 : Math.max(0, Math.min(10000, Math.round(Number(body.quizzes) || 0)));
      const reports = isContrib ? Math.max(0, Math.min(10000, Math.round(Number(body.reports ?? points) || 0))) : 0;
      const k = normKey(name);
      const entry = {
        ...(isContrib ? { kind: 'contributors' } : {}),
        name,
        points: isContrib ? reports : points,
        quizzes,
        reports,
        chapters: body.chapters && typeof body.chapters === 'object' ? body.chapters : undefined,
        extraPoints: Number(body.extraPoints) || 0,
        extraQuizzes: Number(body.extraQuizzes) || 0,
        updatedAt: new Date().toISOString(),
      };

      try {
        await fetch(`${url}/rest/v1/rpc/save_quiz_progress`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            p_name: targetProgressKey,
            p_progress: { [k]: entry },
          }),
        });
      } catch {
        // Ignore if RPC not yet applied
      }

      return res.status(200).json({ ok: true, entry });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  } catch {
    return res.status(500).json({ error: 'Erreur serveur lors de la récupération du classement.' });
  }
}
