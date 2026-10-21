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
    const headers = {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_list_attempts`, {
      method: 'POST',
      headers,
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

    const rawAttempts = Array.isArray(data.attempts) ? data.attempts : [];
    const attempts = [];
    const reportGroups = new Map();

    for (const a of rawAttempts) {
      if (typeof a.course === 'string' && a.course.startsWith('report-')) {
        const partMatch = a.course.match(/^(report-(?:subm|revedit|revquiz)-[a-z0-9]+-[a-z0-9]+)-p([0-9]+)$/);
        const baseCourse = partMatch ? partMatch[1] : a.course;
        const partIdx = partMatch ? Number.parseInt(partMatch[2], 10) || 0 : 0;

        if (!reportGroups.has(baseCourse)) {
          reportGroups.set(baseCourse, {
            id: baseCourse,
            created_at: a.created_at,
            question_id: a.quiz,
            chunks: new Map(),
            resolved_at: null,
            decision: null,
          });
        }
        const g = reportGroups.get(baseCourse);
        if (a.created_at < g.created_at) g.created_at = a.created_at;
        if (
          a.passed ||
          a.name === '__resolved__' ||
          a.name === '__accepted__' ||
          a.name === '__refused__'
        ) {
          g.resolved_at = a.created_at;
          if (a.name === '__refused__' || a.quiz === 'subm-refused') {
            g.decision = 'refused';
          } else if (a.name === '__accepted__' || a.quiz === 'subm-accepted') {
            g.decision = 'accepted';
          }
        } else {
          g.chunks.set(partIdx * 100 + a.score, a.name);
          if (a.quiz && !a.quiz.startsWith('subm-')) {
            g.question_id = a.quiz;
          }
        }
      } else {
        attempts.push(a);
      }
    }

    const fallbackReports = [];
    for (const g of reportGroups.values()) {
      if (g.chunks.size === 0) continue;
      const b64 = [...g.chunks.entries()]
        .sort((x, y) => x[0] - y[0])
        .map((x) => x[1])
        .join('');
      try {
        const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
        fallbackReports.push({
          id: g.id,
          created_at: g.created_at,
          name: parsed.u || 'Anonyme',
          chapter: parsed.c || 'ch1',
          question_id: g.question_id,
          message: parsed.m || '',
          resolved_at: g.resolved_at,
          decision: g.decision,
        });
      } catch {
        // Ignore malformed fallback row
      }
    }

    let tableReports = [];
    try {
      const rr = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_list_reports`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_password: password }),
      });
      if (rr.ok) {
        const rdata = await rr.json();
        if (rdata?.status === 'ok' && Array.isArray(rdata.reports)) {
          tableReports = rdata.reports;
        }
      }
    } catch {
      // Migration not applied yet; fallbackReports is used
    }

    const reports = [...tableReports, ...fallbackReports].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    return res.status(200).json({ attempts, reports });
  } catch {
    return res.status(502).json({ error: 'Base de données injoignable' });
  }
}
