// Helpers to send and read question feedback reports.
// Works with /api/reports and gracefully falls back to /api/attempts when running against an older backend proxy.

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64Utf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export async function submitQuestionReport({ name, chapter, questionId, message }) {
  const cleanName = (name || '').trim().replace(/\s+/g, ' ').slice(0, 80) || 'Anonyme';
  const cleanMsg = (message || '').replace(/\r\n/g, '\n').trim();
  if (cleanMsg.length < 2) {
    throw new Error('Veuillez écrire quelques mots avant d’envoyer.');
  }
  if (cleanMsg.length > 600) {
    throw new Error('Le message ne doit pas dépasser 600 caractères.');
  }

  // 1. Try /api/reports
  try {
    const r = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cleanName,
        chapter,
        questionId,
        message: cleanMsg,
      }),
    });
    if (r.ok) return true;
    if (r.status !== 404) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || 'Impossible d’envoyer le signalement.');
    }
  } catch (e) {
    if (e.message && !e.message.includes('Failed to fetch')) {
      throw e;
    }
  }

  // 2. Fallback via /api/attempts when /api/reports is not deployed yet on the proxy
  const rand = Math.random().toString(16).slice(2, 8);
  const reportSlug = `report-${Date.now().toString(36)}-${rand}`;
  const b64 = toBase64Utf8(JSON.stringify({ u: cleanName, c: chapter, m: cleanMsg }));
  const chunks = [];
  for (let i = 0; i < b64.length; i += 76) {
    chunks.push(b64.slice(i, i + 76));
  }

  for (let idx = 0; idx < chunks.length; idx++) {
    const res = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: chunks[idx],
        course: reportSlug,
        quiz: questionId,
        score: idx,
        total: chunks.length,
        passed: false,
      }),
    });
    if (!res.ok) {
      throw new Error('Impossible d’envoyer le signalement, réessayez.');
    }
  }
  return true;
}

export async function resolveQuestionReport({ password, id, questionId }) {
  try {
    const r = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve', password, id, questionId }),
    });
    if (r.ok) return true;
    if (r.status !== 404) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || 'Impossible de marquer comme traité.');
    }
  } catch (e) {
    if (e.message && !e.message.includes('Failed to fetch')) {
      throw e;
    }
  }

  if (typeof id === 'string' && id.startsWith('report-')) {
    const res = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '__resolved__',
        course: id,
        quiz: questionId || 'c1-q01',
        score: 1,
        total: 1,
        passed: true,
      }),
    });
    if (!res.ok) throw new Error('Impossible de marquer comme traité.');
  }
  return true;
}

export function extractAttemptsAndReports(data) {
  const rawAttempts = Array.isArray(data?.attempts) ? data.attempts : [];
  const serverReports = Array.isArray(data?.reports) ? data.reports : [];

  const attempts = [];
  const reportGroups = new Map();

  for (const a of rawAttempts) {
    if (typeof a.course === 'string' && a.course.startsWith('report-')) {
      if (!reportGroups.has(a.course)) {
        reportGroups.set(a.course, {
          id: a.course,
          created_at: a.created_at,
          question_id: a.quiz,
          chunks: new Map(),
          resolved_at: null,
        });
      }
      const g = reportGroups.get(a.course);
      if (a.created_at < g.created_at) g.created_at = a.created_at;
      if (a.passed || a.name === '__resolved__') {
        g.resolved_at = a.created_at;
      } else {
        g.chunks.set(a.score, a.name);
      }
    } else {
      attempts.push(a);
    }
  }

  const clientParsedReports = [];
  for (const g of reportGroups.values()) {
    if (g.chunks.size === 0) continue;
    const b64 = [...g.chunks.entries()]
      .sort((x, y) => x[0] - y[0])
      .map((x) => x[1])
      .join('');
    try {
      const parsed = JSON.parse(fromBase64Utf8(b64));
      clientParsedReports.push({
        id: g.id,
        created_at: g.created_at,
        name: parsed.u || 'Anonyme',
        chapter: parsed.c || 'ch1',
        question_id: g.question_id,
        message: parsed.m || '',
        resolved_at: g.resolved_at,
      });
    } catch {
      // Ignore malformed row
    }
  }

  const seenIds = new Set(serverReports.map((r) => String(r.id)));
  const mergedReports = [
    ...serverReports,
    ...clientParsedReports.filter((r) => !seenIds.has(String(r.id))),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return { attempts, reports: mergedReports };
}
