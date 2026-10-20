// Public leaderboard endpoint:
// - GET  /api/leaderboard         -> returns [{ name, points, quizzes, updatedAt }] sorted by points desc
// - POST /api/leaderboard         -> updates a player's leaderboard entry

const LEADERBOARD_KEY = '__leaderboard__';
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
  const m = key.match(/^lb-([0-9a-f]{2,24})-(\d{1,6})-(\d{1,5})$/);
  if (!m) return null;
  const name = cleanName(fromHex(m[1]));
  if (!name) return null;
  return {
    name,
    points: parseInt(m[2], 10) || 0,
    quizzes: parseInt(m[3], 10) || 0,
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
    if (req.method === 'GET') {
      const merged = new Map();

      const addEntry = (raw) => {
        if (!raw || typeof raw !== 'object') return;
        const name = cleanName(raw.name);
        if (!name || name === LEADERBOARD_KEY) return;
        const k = normKey(name);
        const points = Math.max(0, Number(raw.points) || 0);
        const quizzes = Math.max(0, Number(raw.quizzes) || 0);
        const updatedAt = raw.updatedAt || raw.updated_at || null;
        const prev = merged.get(k);
        if (!prev) {
          merged.set(k, { name, points, quizzes, updatedAt });
        } else {
          merged.set(k, {
            name: updatedAt && (!prev.updatedAt || updatedAt >= prev.updatedAt) ? name : prev.name,
            points: Math.max(prev.points, points),
            quizzes: Math.max(prev.quizzes, quizzes),
            updatedAt: updatedAt && (!prev.updatedAt || updatedAt > prev.updatedAt) ? updatedAt : prev.updatedAt,
          });
        }
      };

      // 1) Try dedicated RPC get_leaderboard()
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

      // 2) Also read shared progress entry '__leaderboard__'
      try {
        const r2 = await fetch(`${url}/rest/v1/rpc/get_quiz_progress`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ p_name: LEADERBOARD_KEY }),
        });
        if (r2.ok) {
          const data = await r2.json();
          const map = data?.progress && typeof data.progress === 'object' ? data.progress : data;
          if (map && typeof map === 'object' && !Array.isArray(map)) {
            for (const [k, v] of Object.entries(map)) {
              if (k === 'ch99' && v?.answers && typeof v.answers === 'object') {
                for (const qid of Object.keys(v.answers)) {
                  const decoded = decodeEntryKey(qid);
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
      return res.status(200).json({ entries });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const name = cleanName(body.name);
      if (!name || name.length > 80 || name === LEADERBOARD_KEY) {
        return res.status(400).json({ error: 'Pseudo invalide.' });
      }
      const points = Math.max(0, Math.min(100000, Math.round(Number(body.points) || 0)));
      const quizzes = Math.max(0, Math.min(10000, Math.round(Number(body.quizzes) || 0)));
      const k = normKey(name);
      const entry = {
        name,
        points,
        quizzes,
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
            p_name: LEADERBOARD_KEY,
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
