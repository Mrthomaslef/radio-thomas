import { readName, readAllProgress } from './player.js';

const LOCAL_LB_KEY = 'quiz-cotten:leaderboard:v2';
const LOCAL_CONTRIB_KEY = 'quiz-cotten:contributors:v4';
const USER_PREFIX = 'quiz-cotten:user:';
const SERVER_SHARED_KEY = '__leaderboard_v2__';
const SERVER_CONTRIB_KEY = '__contributors_v4__';

const cleanName = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '');
const normKey = (s) => cleanName(s).toLowerCase();

const isPerfect = (q, picked) => {
  if (!Array.isArray(picked)) return false;
  const good = q.items.filter((i) => i.correct).map((i) => i.id).sort().join();
  return good === [...picked].sort().join();
};

// Encode/decode a leaderboard entry into a valid questionId (`^[a-z0-9-]{1,40}$`)
// under `ch99.answers` so `/api/progress` accepts it even with strict chapter validation.
function toHex(str) {
  const bytes = new TextEncoder().encode(str).slice(0, 12);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) return '';
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

export function encodeEntryKey(entry) {
  const name = cleanName(entry?.name);
  if (!name) return null;
  const hex = toHex(name);
  if (!hex) return null;
  const pts = Math.max(0, Math.min(999999, Math.round(Number(entry.points) || 0)));
  const qz = Math.max(0, Math.min(99999, Math.round(Number(entry.quizzes) || 0)));
  return `lb2-${hex}-${pts}-${qz}`;
}

export function decodeEntryKey(key) {
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

export function encodeContribKey(entry) {
  const name = cleanName(entry?.name);
  if (!name) return null;
  const hex = toHex(name).slice(0, 20);
  if (!hex) return null;
  const reps = Math.max(0, Math.min(9999, Math.round(Number(entry.reports) || 0)));
  const subs = Math.max(0, Math.min(9999, Math.round(Number(entry.submissions) || 0)));
  const pts = Math.max(0, Math.min(99999, Math.round(Number(entry.points) || reps + subs * 10)));
  return `cb4-${hex}-${pts}-${reps}-${subs}`;
}

export function decodeContribKey(key) {
  if (typeof key !== 'string') return null;
  const m = key.match(/^cb4-([0-9a-f]{2,24})-(\d{1,6})(?:-(\d{1,5})-(\d{1,5}))?$/);
  if (!m) return null;
  const name = cleanName(fromHex(m[1]));
  if (!name) return null;
  const points = parseInt(m[2], 10) || 0;
  const reports = m[3] !== undefined ? parseInt(m[3], 10) || 0 : points;
  const submissions = m[4] !== undefined ? parseInt(m[4], 10) || 0 : 0;
  return {
    kind: 'contributors_v4',
    name,
    points: Math.max(points, reports + submissions * 10),
    reports,
    submissions,
  };
}

function readLocalMap() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_LB_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeLocalMap(map) {
  try {
    localStorage.setItem(LOCAL_LB_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors in private mode
  }
}

function computeTotals(entry) {
  const chapters = entry?.chapters && typeof entry.chapters === 'object' ? entry.chapters : {};
  const chapterValues = Object.values(chapters).map((v) => Math.max(0, Number(v) || 0));
  const chapterPoints = chapterValues.reduce((sum, v) => sum + v, 0);
  const chapterCount = Object.keys(chapters).length;
  const extraPoints = Math.max(0, Number(entry?.extraPoints) || 0);
  const extraQuizzes = Math.max(0, Number(entry?.extraQuizzes) || 0);
  const computedPoints = chapterPoints + extraPoints;
  const computedQuizzes = chapterCount + extraQuizzes;
  return {
    name: cleanName(entry?.name) || 'Anonyme',
    chapters,
    extraPoints,
    extraQuizzes,
    points: Math.max(Number(entry?.points) || 0, computedPoints),
    quizzes: Math.max(Number(entry?.quizzes) || 0, computedQuizzes),
    updatedAt: entry?.updatedAt || new Date().toISOString(),
  };
}

// Scans local user progress profiles so any chapter already completed AND passed (>= 60%)
// is automatically credited (1 point per correct answer in completed & passed quizzes only).
export function syncLocalCompletedChapters(byChapter) {
  if (!byChapter || Object.keys(byChapter).length === 0) return readLocalMap();
  const map = readLocalMap();
  let changed = false;

  const inspectUser = (displayName, progressObj) => {
    const name = cleanName(displayName);
    if (!name || name === SERVER_SHARED_KEY || name === '__leaderboard__') return;
    const k = normKey(name);
    const existing = map[k] || { name, chapters: {}, extraPoints: 0, extraQuizzes: 0, points: 0, quizzes: 0 };
    const chapters = { ...(existing.chapters || {}) };
    let userChanged = false;

    for (const [chId, qs] of Object.entries(byChapter)) {
      if (!Array.isArray(qs) || qs.length === 0) continue;
      const chProg = progressObj?.[chId];
      const ans = chProg?.answers || {};
      const answered = qs.filter((q) => Array.isArray(ans[q.id]) && ans[q.id].length > 0);
      // Points are ONLY counted when the user has finished the quiz AND passed it (>= 60%)
      if ((chProg?.sent && answered.length > 0) || answered.length === qs.length) {
        const score = answered.filter((q) => isPerfect(q, ans[q.id])).length;
        const passed = score / qs.length >= 0.6;
        if (passed && (chapters[chId] === undefined || score > chapters[chId])) {
          chapters[chId] = score;
          userChanged = true;
        }
      }
    }

    if (userChanged) {
      map[k] = computeTotals({ ...existing, name, chapters, points: 0, quizzes: 0, updatedAt: new Date().toISOString() });
      changed = true;
    }
  };

  // Current active player
  const current = readName();
  if (current) {
    inspectUser(current, readAllProgress(current));
  }

  // Any other player profile stored on this browser
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (!storageKey || !storageKey.startsWith(USER_PREFIX)) continue;
      const keySuffix = storageKey.slice(USER_PREFIX.length);
      if (!keySuffix || keySuffix === SERVER_SHARED_KEY || keySuffix === '__leaderboard__') continue;
      const prog = JSON.parse(localStorage.getItem(storageKey) || '{}');
      const existingName = map[keySuffix]?.name || (normKey(current) === keySuffix ? current : keySuffix);
      inspectUser(existingName, prog);
    }
  } catch {
    // Ignore localStorage access errors
  }

  if (changed) writeLocalMap(map);
  return map;
}

async function pushAllToServer(mapOrEntry) {
  const entries =
    mapOrEntry && mapOrEntry.name
      ? [mapOrEntry]
      : Object.values(mapOrEntry || {}).filter((e) => e && e.name && (e.quizzes > 0 || e.points > 0));
  if (entries.length === 0) return;

  for (const entry of entries) {
    try {
      await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch {
      // Ignore network errors
    }
  }

  // Also sync encoded entries into `/api/progress` under `ch99.answers`
  try {
    const existingByUser = new Map();
    try {
      const rGet = await fetch(`/api/progress?name=${encodeURIComponent(SERVER_SHARED_KEY)}`);
      if (rGet.ok) {
        const dGet = await rGet.json();
        const ans = dGet?.progress?.ch99?.answers || {};
        for (const qid of Object.keys(ans)) {
          const decoded = decodeEntryKey(qid);
          if (decoded) {
            existingByUser.set(normKey(decoded.name), decoded);
          }
        }
      }
    } catch {
      // Ignore
    }

    for (const entry of entries) {
      const k = normKey(entry.name);
      const prev = existingByUser.get(k);
      if (!prev || entry.points >= prev.points || entry.quizzes >= prev.quizzes) {
        existingByUser.set(k, {
          name: entry.name,
          points: Math.max(prev?.points || 0, entry.points || 0),
          quizzes: Math.max(prev?.quizzes || 0, entry.quizzes || 0),
        });
      }
    }

    const answers = {};
    for (const item of existingByUser.values()) {
      const eKey = encodeEntryKey(item);
      if (eKey) answers[eKey] = ['A'];
    }

    if (Object.keys(answers).length > 0) {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: SERVER_SHARED_KEY,
          progress: {
            ch99: {
              answers,
              sent: true,
            },
          },
        }),
      });
    }
  } catch {
    // Ignore network errors
  }
}

// Called when a player finishes a quiz. Points only count if the quiz is passed (>= 60%).
export async function recordCompletedQuiz({ name, quizKey, score, total = 0, passed = null, randomMode = false }) {
  const clean = cleanName(name || readName());
  if (!clean || clean === SERVER_SHARED_KEY || clean === '__leaderboard__') return null;
  const pts = Math.max(0, Math.round(Number(score) || 0));
  const tot = Math.max(0, Math.round(Number(total) || 0));
  const isPassed = typeof passed === 'boolean' ? passed : tot > 0 ? pts / tot >= 0.6 : false;

  // Do not count points if the quiz is "À revoir" (not passed)
  if (!isPassed) return null;

  const k = normKey(clean);
  const map = readLocalMap();
  const prev = map[k] || {
    name: clean,
    chapters: {},
    extraPoints: 0,
    extraQuizzes: 0,
    points: 0,
    quizzes: 0,
  };

  let next;
  if (randomMode || quizKey === 'aleatoire' || quizKey === 'quiz-aleatoire') {
    next = computeTotals({
      ...prev,
      name: clean,
      extraPoints: (Number(prev.extraPoints) || 0) + pts,
      extraQuizzes: (Number(prev.extraQuizzes) || 0) + 1,
      points: 0,
      quizzes: 0,
      updatedAt: new Date().toISOString(),
    });
  } else {
    const chapters = { ...(prev.chapters || {}) };
    chapters[quizKey] = Math.max(Number(chapters[quizKey]) || 0, pts);
    next = computeTotals({
      ...prev,
      name: clean,
      chapters,
      points: 0,
      quizzes: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  map[k] = next;
  writeLocalMap(map);
  await pushAllToServer(map);
  return next;
}

// Syncs historical attempts (e.g. from AdminPage) into the leaderboard (only passed quizzes).
export async function syncLeaderboardFromAttempts(attempts) {
  if (!Array.isArray(attempts) || attempts.length === 0) return;
  const map = readLocalMap();
  const byUser = new Map();

  for (const a of attempts) {
    if (!a || (typeof a.course === 'string' && a.course.startsWith('report-'))) continue;
    const pts = Math.max(0, Number(a.score) || 0);
    const tot = Math.max(0, Number(a.total) || 0);
    const isPassed = typeof a.passed === 'boolean' ? a.passed : tot > 0 && pts / tot >= 0.6;
    if (!isPassed) continue;

    const name = cleanName(a.name || a.participant_name);
    if (!name || name === SERVER_SHARED_KEY || name === '__leaderboard__') continue;
    const k = normKey(name);
    if (!byUser.has(k)) {
      byUser.set(k, { name, chapters: {}, extraPoints: 0, extraQuizzes: 0 });
    }
    const u = byUser.get(k);
    if (a.quiz === 'aleatoire' || a.quiz === 'quiz-aleatoire' || a.course === 'mixte') {
      u.extraPoints += pts;
      u.extraQuizzes += 1;
    } else if (a.quiz) {
      u.chapters[a.quiz] = Math.max(Number(u.chapters[a.quiz]) || 0, pts);
    }
  }

  for (const [k, u] of byUser.entries()) {
    const prev = map[k] || {};
    const mergedChapters = { ...(prev.chapters || {}), ...u.chapters };
    for (const chId of Object.keys(mergedChapters)) {
      mergedChapters[chId] = Math.max(Number(prev.chapters?.[chId]) || 0, Number(u.chapters?.[chId]) || 0);
    }
    map[k] = computeTotals({
      ...prev,
      name: u.name,
      chapters: mergedChapters,
      extraPoints: Math.max(Number(prev.extraPoints) || 0, u.extraPoints),
      extraQuizzes: Math.max(Number(prev.extraQuizzes) || 0, u.extraQuizzes),
      points: 0,
      quizzes: 0,
      updatedAt: new Date().toISOString(),
    });
  }

  writeLocalMap(map);
  await pushAllToServer(map);
}

// Fetches and merges the leaderboard from server + local completed & passed quizzes.
export async function fetchLeaderboard(byChapter = null) {
  const localMap = syncLocalCompletedChapters(byChapter);
  const merged = new Map();

  const mergeOne = (raw) => {
    if (!raw || typeof raw !== 'object') return;
    const name = cleanName(raw.name);
    if (!name || name === SERVER_SHARED_KEY || name === '__leaderboard__') return;
    const k = normKey(name);
    const normalized = computeTotals(raw);
    if (normalized.quizzes <= 0 && normalized.points <= 0) return;

    const prev = merged.get(k);
    if (!prev) {
      merged.set(k, normalized);
    } else {
      const mergedChapters = { ...(prev.chapters || {}), ...(normalized.chapters || {}) };
      for (const chId of Object.keys(mergedChapters)) {
        mergedChapters[chId] = Math.max(
          Number(prev.chapters?.[chId]) || 0,
          Number(normalized.chapters?.[chId]) || 0
        );
      }
      const combined = computeTotals({
        name:
          normalized.updatedAt && (!prev.updatedAt || normalized.updatedAt >= prev.updatedAt)
            ? normalized.name
            : prev.name,
        chapters: mergedChapters,
        extraPoints: Math.max(prev.extraPoints || 0, normalized.extraPoints || 0),
        extraQuizzes: Math.max(prev.extraQuizzes || 0, normalized.extraQuizzes || 0),
        points: Math.max(prev.points || 0, normalized.points || 0),
        quizzes: Math.max(prev.quizzes || 0, normalized.quizzes || 0),
        updatedAt:
          normalized.updatedAt && (!prev.updatedAt || normalized.updatedAt > prev.updatedAt)
            ? normalized.updatedAt
            : prev.updatedAt,
      });
      merged.set(k, combined);
    }
  };

  Object.values(localMap).forEach(mergeOne);

  // 1) Fetch from /api/leaderboard
  try {
    const r = await fetch('/api/leaderboard');
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data?.entries)) {
        data.entries.forEach(mergeOne);
      }
    }
  } catch {
    // Ignore network error
  }

  // 2) Also check /api/progress?name=__leaderboard_v2__
  try {
    const r2 = await fetch(`/api/progress?name=${encodeURIComponent(SERVER_SHARED_KEY)}`);
    if (r2.ok) {
      const data2 = await r2.json();
      const prog = data2?.progress;
      if (prog && typeof prog === 'object') {
        for (const [k, v] of Object.entries(prog)) {
          if (k === 'ch99' && v?.answers && typeof v.answers === 'object') {
            for (const qid of Object.keys(v.answers)) {
              const decoded = decodeEntryKey(qid);
              if (decoded) mergeOne(decoded);
            }
          } else if (v && typeof v === 'object' && v.name) {
            mergeOne(v);
          }
        }
      }
    }
  } catch {
    // Ignore network error
  }

  // Save merged state locally and ensure all local entries are pushed to server
  const finalMap = {};
  for (const [k, v] of merged.entries()) {
    finalMap[k] = v;
  }
  writeLocalMap(finalMap);

  if (Object.keys(localMap).length > 0) {
    pushAllToServer(finalMap);
  }

  return [...merged.values()].sort(
    (a, b) => b.points - a.points || b.quizzes - a.quizzes || a.name.localeCompare(b.name, 'fr')
  );
}

// ---------- Contributors Leaderboard (1 point per question report / feedback) ----------

function readLocalContribMap() {
  try {
    localStorage.removeItem('quiz-cotten:contributors:v1');
    localStorage.removeItem('quiz-cotten:contributors:v2');
    localStorage.removeItem('quiz-cotten:contributors:v3');
    const raw = JSON.parse(localStorage.getItem(LOCAL_CONTRIB_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeLocalContribMap(map) {
  try {
    localStorage.setItem(LOCAL_CONTRIB_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

async function pushContributorsToServer(mapOrEntry, { replace = false } = {}) {
  const entries =
    mapOrEntry && mapOrEntry.name
      ? [mapOrEntry]
      : Object.values(mapOrEntry || {}).filter((e) => e && e.name && (e.points > 0 || e.reports > 0 || e.submissions > 0));
  if (entries.length === 0 && !replace) return;

  for (const entry of entries) {
    const reps = Math.max(0, Number(entry.reports) || 0);
    const subs = Math.max(0, Number(entry.submissions) || 0);
    const pts = Math.max(0, Number(entry.points) || reps + subs * 10);
    try {
      await fetch('/api/leaderboard?type=contributors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'contributors_v4',
          type: 'contributors',
          name: entry.name,
          points: pts,
          reports: reps,
          submissions: subs,
        }),
      });
    } catch {
      // Ignore network errors
    }
  }

  // Also sync encoded entries into `/api/progress` under `SERVER_CONTRIB_KEY` -> `ch99.answers`
  try {
    const existingByUser = new Map();
    if (!replace) {
      try {
        const rGet = await fetch(`/api/progress?name=${encodeURIComponent(SERVER_CONTRIB_KEY)}`);
        if (rGet.ok) {
          const dGet = await rGet.json();
          const ans = dGet?.progress?.ch99?.answers || {};
          for (const qid of Object.keys(ans)) {
            const decoded = decodeContribKey(qid);
            if (decoded) {
              existingByUser.set(normKey(decoded.name), decoded);
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    for (const entry of entries) {
      const k = normKey(entry.name);
      const prev = existingByUser.get(k);
      const rep = Math.max(prev?.reports || 0, Number(entry.reports) || 0);
      const sub = Math.max(prev?.submissions || 0, Number(entry.submissions) || 0);
      const pts = Math.max(prev?.points || 0, Number(entry.points) || 0, rep + sub * 10);
      existingByUser.set(k, {
        kind: 'contributors_v4',
        name: entry.name,
        points: pts,
        reports: rep,
        submissions: sub,
      });
    }

    const answers = {};
    for (const item of existingByUser.values()) {
      const eKey = encodeContribKey(item);
      if (eKey) answers[eKey] = ['A'];
    }

    if (Object.keys(answers).length > 0 || replace) {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: SERVER_CONTRIB_KEY,
          progress: {
            ch99: {
              answers,
              sent: true,
            },
          },
        }),
      });
    }
  } catch {
    // Ignore network errors
  }
}

// Called when a learner submits a report / feedback on a question (+1 point).
export async function recordContributorReport(name) {
  const clean = cleanName(name || readName());
  if (
    !clean ||
    clean === 'Anonyme' ||
    clean === SERVER_SHARED_KEY ||
    clean === SERVER_CONTRIB_KEY ||
    clean === '__leaderboard__'
  ) {
    return null;
  }
  const k = normKey(clean);
  const map = readLocalContribMap();
  const prev = map[k] || { kind: 'contributors_v4', name: clean, points: 0, reports: 0, submissions: 0 };
  const reps = (Number(prev.reports) || 0) + 1;
  const subs = Number(prev.submissions) || 0;
  const pts = Math.max((Number(prev.points) || 0) + 1, reps + subs * 10);
  const next = {
    kind: 'contributors_v4',
    name: clean,
    points: pts,
    reports: reps,
    submissions: subs,
    updatedAt: new Date().toISOString(),
  };
  map[k] = next;
  writeLocalContribMap(map);
  await pushContributorsToServer(next);
  return next;
}

// Called when an admin validates a question proposed by a learner (+10 points).
export async function recordApprovedSubmission(name) {
  const clean = cleanName(name);
  if (
    !clean ||
    clean === 'Anonyme' ||
    clean === '__resolved__' ||
    clean === SERVER_SHARED_KEY ||
    clean === SERVER_CONTRIB_KEY ||
    clean === '__leaderboard__'
  ) {
    return null;
  }
  const k = normKey(clean);
  const map = readLocalContribMap();
  const prev = map[k] || { kind: 'contributors_v4', name: clean, points: 0, reports: 0, submissions: 0 };
  const reps = Number(prev.reports) || 0;
  const subs = (Number(prev.submissions) || 0) + 1;
  const pts = Math.max((Number(prev.points) || 0) + 10, reps + subs * 10);
  const next = {
    kind: 'contributors_v4',
    name: clean,
    points: pts,
    reports: reps,
    submissions: subs,
    updatedAt: new Date().toISOString(),
  };
  map[k] = next;
  writeLocalContribMap(map);
  await pushContributorsToServer(next);
  return next;
}

// Syncs all historical reports (1 pt each) and accepted question submissions (10 pts each) into the Contributors Leaderboard.
export async function syncContributorsFromReports(reports, submissions = []) {
  const map = {};
  const counts = new Map();

  for (const r of reports || []) {
    if (!r) continue;
    const name = cleanName(r.name || r.participant_name);
    if (
      !name ||
      name === 'Anonyme' ||
      name === '__resolved__' ||
      name === SERVER_SHARED_KEY ||
      name === SERVER_CONTRIB_KEY
    ) {
      continue;
    }
    const k = normKey(name);
    const prev = counts.get(k) || { name, reports: 0, submissions: 0 };
    prev.reports += 1;
    counts.set(k, prev);
  }

  for (const s of submissions || []) {
    if (!s || s.status !== 'accepted') continue;
    const name = cleanName(s.name || s.participant_name);
    if (
      !name ||
      name === 'Anonyme' ||
      name === '__resolved__' ||
      name === SERVER_SHARED_KEY ||
      name === SERVER_CONTRIB_KEY
    ) {
      continue;
    }
    const k = normKey(name);
    const prev = counts.get(k) || { name, reports: 0, submissions: 0 };
    prev.submissions += 1;
    counts.set(k, prev);
  }

  for (const [k, { name, reports: repCount, submissions: subCount }] of counts.entries()) {
    const pts = repCount + subCount * 10;
    if (pts <= 0) continue;
    map[k] = {
      kind: 'contributors_v4',
      name,
      points: pts,
      reports: repCount,
      submissions: subCount,
      updatedAt: new Date().toISOString(),
    };
  }

  writeLocalContribMap(map);
  await pushContributorsToServer(map, { replace: true });
}

// Fetches and merges the Contributors Leaderboard from server + local storage.
export async function fetchContributorsLeaderboard() {
  const localMap = readLocalContribMap();
  const merged = new Map();

  const mergeOne = (raw) => {
    if (!raw || typeof raw !== 'object') return;
    // Strictly require v4 contributor entries (never accept quiz leaderboard or polluted v1/v2/v3 entries!)
    if (raw.kind !== 'contributors_v4') return;

    const name = cleanName(raw.name);
    if (
      !name ||
      name === 'Anonyme' ||
      name === '__resolved__' ||
      name === SERVER_SHARED_KEY ||
      name === SERVER_CONTRIB_KEY
    ) {
      return;
    }
    const reps = Math.max(0, Math.round(Number(raw.reports) || 0));
    const subs = Math.max(0, Math.round(Number(raw.submissions) || 0));
    const pts = Math.max(0, Math.round(Number(raw.points) || 0), reps + subs * 10);
    if (pts <= 0) return;
    const k = normKey(name);
    const prev = merged.get(k);
    if (!prev || pts >= prev.points) {
      const bestReps = Math.max(prev?.reports || 0, reps);
      const bestSubs = Math.max(prev?.submissions || 0, subs);
      const bestPts = Math.max(prev?.points || 0, pts, bestReps + bestSubs * 10);
      merged.set(k, {
        kind: 'contributors_v4',
        name: prev && prev.points > pts ? prev.name : name,
        points: bestPts,
        reports: bestReps,
        submissions: bestSubs,
        updatedAt: raw.updatedAt || prev?.updatedAt || new Date().toISOString(),
      });
    }
  };

  Object.values(localMap).forEach(mergeOne);

  // 1) Fetch from /api/leaderboard?type=contributors
  try {
    const r = await fetch('/api/leaderboard?type=contributors');
    if (r.ok) {
      const data = await r.json();
      if (data?.type === 'contributors_v4' && Array.isArray(data?.entries)) {
        data.entries.forEach(mergeOne);
      }
    }
  } catch {
    // Ignore
  }

  // 2) Also check /api/progress?name=__contributors_v4__
  try {
    const r2 = await fetch(`/api/progress?name=${encodeURIComponent(SERVER_CONTRIB_KEY)}`);
    if (r2.ok) {
      const data2 = await r2.json();
      const prog = data2?.progress;
      if (prog && typeof prog === 'object') {
        for (const [k, v] of Object.entries(prog)) {
          if (k === 'ch99' && v?.answers && typeof v.answers === 'object') {
            for (const qid of Object.keys(v.answers)) {
              const decoded = decodeContribKey(qid);
              if (decoded) mergeOne(decoded);
            }
          } else if (v && typeof v === 'object' && v.name && v.kind === 'contributors_v4') {
            mergeOne(v);
          }
        }
      }
    }
  } catch {
    // Ignore
  }

  const finalMap = {};
  for (const [k, v] of merged.entries()) {
    finalMap[k] = v;
  }
  writeLocalContribMap(finalMap);

  return [...merged.values()].sort(
    (a, b) => b.points - a.points || a.name.localeCompare(b.name, 'fr')
  );
}
