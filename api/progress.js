// GET /api/progress?name=<pseudo> — reads saved quiz progress for a pseudo.
// POST /api/progress { name, progress } — saves/merges quiz progress for a pseudo.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const CHAPTER_KEY = /^ch[0-9]{1,2}$/;
const QUESTION_ID = /^[a-z0-9-]{1,64}$/;
const ITEM_ID = /^[A-F]$/;

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return null;
  }
}

function cleanName(raw) {
  const name = typeof raw === 'string' ? raw.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 1 || name.length > 80 || CONTROL_CHARS.test(name)) return null;
  return name;
}

function cleanProgress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [ch, val] of Object.entries(raw)) {
    if (!CHAPTER_KEY.test(ch) || !val || typeof val !== 'object') continue;
    const rawAnswers = val.answers && typeof val.answers === 'object' ? val.answers : {};
    const answers = {};
    for (const [qid, picked] of Object.entries(rawAnswers)) {
      if (!QUESTION_ID.test(qid) || !Array.isArray(picked)) continue;
      const validPicked = picked.filter((x) => typeof x === 'string' && ITEM_ID.test(x)).slice(0, 6);
      if (validPicked.length > 0) answers[qid] = [...new Set(validPicked)];
    }
    const rawTimestamps =
      val.answerTimestamps && typeof val.answerTimestamps === 'object' ? val.answerTimestamps : {};
    const answerTimestamps = {};
    for (const [qid, ts] of Object.entries(rawTimestamps)) {
      const n = Number(ts);
      if (QUESTION_ID.test(qid) && Number.isFinite(n) && n > 0) {
        answerTimestamps[qid] = Math.floor(n);
      }
    }
    const clearedAt = Number(val.clearedAt);
    const updatedAt = Number(val.updatedAt);
    out[ch] = {
      answers,
      sent: Boolean(val.sent),
      ...(Object.keys(answerTimestamps).length > 0 ? { answerTimestamps } : {}),
      ...(Number.isFinite(clearedAt) && clearedAt > 0 ? { clearedAt: Math.floor(clearedAt) } : {}),
      ...(Number.isFinite(updatedAt) && updatedAt > 0 ? { updatedAt: Math.floor(updatedAt) } : {}),
    };
  }
  return out;
}

function mergeChapterProgress(srv = {}, inc = {}, chKey = '') {
  const srvCleared = Number(srv?.clearedAt) || 0;
  const incCleared = Number(inc?.clearedAt) || 0;

  if (incCleared > srvCleared) {
    return {
      answers: inc.answers || {},
      sent: Boolean(inc.sent),
      ...(inc.answerTimestamps && Object.keys(inc.answerTimestamps).length > 0
        ? { answerTimestamps: inc.answerTimestamps }
        : {}),
      clearedAt: incCleared,
      updatedAt: Math.max(Number(inc.updatedAt) || 0, incCleared),
    };
  }

  if (srvCleared > incCleared) {
    return {
      answers: srv.answers || {},
      sent: Boolean(srv.sent),
      ...(srv.answerTimestamps && Object.keys(srv.answerTimestamps).length > 0
        ? { answerTimestamps: srv.answerTimestamps }
        : {}),
      clearedAt: srvCleared,
      updatedAt: Math.max(Number(srv.updatedAt) || 0, srvCleared),
    };
  }

  const srvAns = srv.answers || {};
  const incAns = inc.answers || {};
  const srvTs = srv.answerTimestamps || {};
  const incTs = inc.answerTimestamps || {};
  const srvChTs = Number(srv.updatedAt) || 0;
  const incChTs = Number(inc.updatedAt) || 0;

  const allQids = new Set([...Object.keys(srvAns), ...Object.keys(incAns)]);
  const mergedAnswers = {};
  const mergedTimestamps = {};
  const isDailyChapter = chKey === 'ch96';

  for (const qid of allQids) {
    const hasSrv = Array.isArray(srvAns[qid]) && srvAns[qid].length > 0;
    const hasInc = Array.isArray(incAns[qid]) && incAns[qid].length > 0;
    const sTime = Number(srvTs[qid]) || srvChTs;
    const iTime = Number(incTs[qid]) || incChTs;

    if (hasSrv && hasInc) {
      // For daily step stars (step-<N> and sd-<YYYYMMDD>-<N>), always keep the highest star rating ('C' > 'B' > 'A')
      if (isDailyChapter && (qid.startsWith('step-') || qid.startsWith('sd-'))) {
        const sCode = srvAns[qid][0] || 'A';
        const iCode = incAns[qid][0] || 'A';
        const bestCode = sCode > iCode ? sCode : iCode;
        mergedAnswers[qid] = [bestCode];
        const maxT = Math.max(sTime, iTime);
        if (maxT > 0) mergedTimestamps[qid] = maxT;
      } else if (iTime >= sTime) {
        mergedAnswers[qid] = incAns[qid];
        if (iTime > 0) mergedTimestamps[qid] = iTime;
      } else {
        mergedAnswers[qid] = srvAns[qid];
        if (sTime > 0) mergedTimestamps[qid] = sTime;
      }
    } else if (hasInc) {
      mergedAnswers[qid] = incAns[qid];
      if (iTime > 0) mergedTimestamps[qid] = iTime;
    } else if (hasSrv) {
      mergedAnswers[qid] = srvAns[qid];
      if (sTime > 0) mergedTimestamps[qid] = sTime;
    }
  }

  const maxCleared = Math.max(incCleared, srvCleared);
  const maxUpdated = Math.max(srvChTs, incChTs);
  return {
    answers: mergedAnswers,
    sent: Boolean(srv.sent || inc.sent),
    ...(Object.keys(mergedTimestamps).length > 0 ? { answerTimestamps: mergedTimestamps } : {}),
    ...(maxCleared > 0 ? { clearedAt: maxCleared } : {}),
    ...(maxUpdated > 0 ? { updatedAt: maxUpdated } : {}),
  };
}

function mergeServerAndClientProgress(serverProg, clientProg) {
  const merged = { ...(serverProg && typeof serverProg === 'object' ? serverProg : {}) };
  for (const [ch, inc] of Object.entries(clientProg || {})) {
    merged[ch] = mergeChapterProgress(merged[ch] || { answers: {}, sent: false }, inc, ch);
  }
  return merged;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    'Content-Type': 'application/json',
  };

  if (req.method === 'GET') {
    const name = cleanName(req.query?.name);
    if (!name) return res.status(400).json({ error: 'Pseudo invalide' });
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_quiz_progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_name: name }),
      });
      if (!r.ok) return res.status(200).json({ exists: false, progress: {} });
      const data = await r.json();
      const prog = data?.progress && typeof data.progress === 'object' ? data.progress : {};
      const exists = Boolean(data?.exists || Object.keys(prog).length > 0);
      return res.status(200).json({ exists, progress: prog });
    } catch {
      return res.status(200).json({ exists: false, progress: {} });
    }
  }

  if (req.method === 'POST') {
    const body = readBody(req);
    const name = cleanName(body?.name);
    const progress = cleanProgress(body?.progress);
    if (!name || !progress) return res.status(400).json({ error: 'Données de progression invalides' });
    try {
      let existing = {};
      try {
        const curRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_quiz_progress`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ p_name: name }),
        });
        if (curRes.ok) {
          const curData = await curRes.json();
          if (curData?.progress && typeof curData.progress === 'object') {
            existing = curData.progress;
          }
        }
      } catch {
        // Proceed with incoming progress if reading current fails
      }

      const merged = mergeServerAndClientProgress(existing, progress);

      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/save_quiz_progress`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ p_name: name, p_progress: merged }),
      });
      if (!r.ok) return res.status(502).json({ error: `Erreur base de données (${r.status})` });
      return res.status(200).json({ ok: true, progress: merged });
    } catch {
      return res.status(502).json({ error: 'Base de données injoignable' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Méthode non autorisée' });
}
