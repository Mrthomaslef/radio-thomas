// Player pseudo + per-pseudo quiz session & progress (saved in localStorage and synced with /api/progress).
import { CHAPTER_KEYS } from './useQuestions.js';

const NAME_KEY = 'radio-thomas:name';
const PROGRESS_PREFIX = 'quiz-cotten:user:';
const LEGACY_PREFIX = 'quiz-cotten:v1:';
const EVENT_NAME = 'radio-thomas:player';

const normKey = (name) => (name || '').trim().replace(/\s+/g, ' ').toLowerCase();

const notify = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
};

export const subscribePlayer = (fn) => {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(EVENT_NAME, fn);
  return () => window.removeEventListener(EVENT_NAME, fn);
};

export const readName = () => {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
};

export const saveName = (n) => {
  const clean = (n || '').trim().replace(/\s+/g, ' ');
  try {
    if (clean) localStorage.setItem(NAME_KEY, clean);
    else localStorage.removeItem(NAME_KEY);
  } catch { /* private mode: ignore */ }
  if (clean) {
    migrateLegacyIfEmpty(clean);
    syncProgressFromServer(clean);
  }
  notify();
};

function readRawMap(name) {
  const k = normKey(name);
  if (!k) return {};
  try {
    return JSON.parse(localStorage.getItem(`${PROGRESS_PREFIX}${k}`)) || {};
  } catch {
    return {};
  }
}

function writeRawMap(name, map) {
  const k = normKey(name);
  if (!k) return;
  try {
    localStorage.setItem(`${PROGRESS_PREFIX}${k}`, JSON.stringify(map));
  } catch { /* private mode */ }
}

// One-time migration of pre-pseudo localStorage keys (`quiz-cotten:v1:ch1`, etc.) into the user's profile.
function migrateLegacyIfEmpty(name) {
  const k = normKey(name);
  if (!k) return;
  const current = readRawMap(name);
  if (Object.keys(current).length > 0) return;
  let changed = false;
  for (const ch of CHAPTER_KEYS) {
    try {
      const legacy = JSON.parse(localStorage.getItem(`${LEGACY_PREFIX}${ch}`));
      if (legacy && legacy.answers && Object.keys(legacy.answers).length > 0) {
        current[ch] = { answers: legacy.answers, sent: Boolean(legacy.sent) };
        localStorage.removeItem(`${LEGACY_PREFIX}${ch}`);
        changed = true;
      }
    } catch { /* ignore */ }
  }
  if (changed) writeRawMap(name, current);
}

export function readAllProgress(name = readName()) {
  if (!name) return {};
  migrateLegacyIfEmpty(name);
  return readRawMap(name);
}

export function readChapterProgress(chapterKey, name = readName()) {
  const all = readAllProgress(name);
  return all[chapterKey] || { answers: {}, sent: false };
}

let pushTimer = null;
function schedulePush(name) {
  if (!name) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const progress = readRawMap(name);
    fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, progress }),
    }).catch(() => { /* offline or table not yet created */ });
  }, 300);
}

export function writeChapterProgress(chapterKey, data, name = readName()) {
  if (!name) return;
  const all = readRawMap(name);
  all[chapterKey] = {
    answers: data.answers || {},
    sent: Boolean(data.sent),
  };
  writeRawMap(name, all);
  notify();
  schedulePush(name);
}

export function clearChapterProgress(chapterKey, name = readName()) {
  if (!name) return;
  const all = readRawMap(name);
  all[chapterKey] = { answers: {}, sent: false };
  writeRawMap(name, all);
  notify();
  schedulePush(name);
}

export function writeQuestionAnswer(chapterKey, questionId, picked, name = readName()) {
  if (!name || !chapterKey || !questionId) return;
  const cur = readChapterProgress(chapterKey, name);
  const answers = { ...(cur.answers || {}) };
  if (picked && picked.length) answers[questionId] = picked;
  else delete answers[questionId];
  writeChapterProgress(chapterKey, { answers, sent: cur.sent }, name);
}

const HISTORY_CHAPTER_KEY = 'ch98';
const HISTORY_STORAGE_PREFIX = 'quiz-cotten:history:v1:';

function readLocalHistoryList(name) {
  const k = normKey(name);
  if (!k) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(`${HISTORY_STORAGE_PREFIX}${k}`) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeLocalHistoryList(name, list) {
  const k = normKey(name);
  if (!k) return;
  try {
    localStorage.setItem(`${HISTORY_STORAGE_PREFIX}${k}`, JSON.stringify(list));
  } catch {
    // Ignore storage errors in private mode
  }
}

export function encodeAttemptKey({ quiz, score, total, createdAt }) {
  const tsSec = Math.max(1, Math.floor((createdAt ? new Date(createdAt).getTime() : Date.now()) / 1000));
  const ts36 = tsSec.toString(36);
  const qSlug =
    quiz === 'quiz-aleatoire' || quiz === 'aleatoire'
      ? 'aleatoire'
      : String(quiz || 'ch1')
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .slice(0, 10) || 'ch1';
  const s = Math.max(0, Math.min(999, Math.round(Number(score) || 0)));
  const t = Math.max(1, Math.min(999, Math.round(Number(total) || 1)));
  return `h-${ts36}-${qSlug}-${s}-${t}`;
}

export function decodeAttemptKey(key) {
  if (typeof key !== 'string') return null;
  const m = key.match(/^h-([0-9a-z]{1,10})-([a-z0-9]{1,12})-(\d{1,3})-(\d{1,3})$/);
  if (!m) return null;
  const tsSec = parseInt(m[1], 36);
  if (!tsSec || Number.isNaN(tsSec)) return null;
  const quiz = m[2] === 'aleatoire' ? 'quiz-aleatoire' : m[2];
  const score = parseInt(m[3], 10) || 0;
  const total = Math.max(1, parseInt(m[4], 10) || 1);
  return {
    id: key,
    created_at: new Date(tsSec * 1000).toISOString(),
    quiz,
    score,
    total,
    passed: score / total >= 0.6,
  };
}

export function recordQuizAttempt({ quiz, score, total, createdAt }, name = readName()) {
  if (!name) return;
  const normalizedQuiz =
    quiz === 'aleatoire' || quiz === 'quiz-aleatoire' ? 'quiz-aleatoire' : String(quiz || 'ch1');
  const s = Math.max(0, Math.round(Number(score) || 0));
  const t = Math.max(1, Math.round(Number(total) || 1));
  const iso = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();
  const key = encodeAttemptKey({ quiz: normalizedQuiz, score: s, total: t, createdAt: iso });

  // 1) Save in dedicated local history list
  const existingList = readLocalHistoryList(name);
  if (!existingList.some((item) => item.id === key)) {
    const nextList = [
      {
        id: key,
        created_at: iso,
        quiz: normalizedQuiz,
        score: s,
        total: t,
        passed: s / t >= 0.6,
      },
      ...existingList,
    ];
    writeLocalHistoryList(name, nextList);
  }

  // 2) Also save in ch98.answers so /api/progress syncs it across sessions/devices
  const cur = readChapterProgress(HISTORY_CHAPTER_KEY, name);
  const answers = { ...(cur.answers || {}), [key]: ['A'] };
  writeChapterProgress(HISTORY_CHAPTER_KEY, { answers, sent: true }, name);
}

export function readQuizHistory(name = readName(), byChapter = null) {
  if (!name) return [];
  const all = readAllProgress(name);
  const rawAnswers = all[HISTORY_CHAPTER_KEY]?.answers || {};
  const byId = new Map();
  const seenChapters = new Set();

  // 1) Load from dedicated local history list
  for (const item of readLocalHistoryList(name)) {
    if (item && item.id) {
      byId.set(item.id, item);
      seenChapters.add(item.quiz);
    }
  }

  // 2) Merge from ch98.answers (synced via /api/progress)
  for (const k of Object.keys(rawAnswers)) {
    const decoded = decodeAttemptKey(k);
    if (decoded && !byId.has(decoded.id)) {
      byId.set(decoded.id, decoded);
      seenChapters.add(decoded.quiz);
    }
  }

  // 3) Reconstruct random quizzes completed before history tracking was added (from leaderboard storage)
  const kUser = normKey(name);
  const hasRandomInHistory = [...byId.values()].some(
    (x) => x.quiz === 'quiz-aleatoire' || x.quiz === 'aleatoire'
  );
  if (!hasRandomInHistory && kUser) {
    for (const lbKey of ['quiz-cotten:leaderboard:v2', 'quiz-cotten:leaderboard:v1']) {
      try {
        const lbMap = JSON.parse(localStorage.getItem(lbKey) || '{}');
        const entry = lbMap?.[kUser];
        if (entry && Number(entry.extraQuizzes) > 0) {
          const pts = Math.max(0, Number(entry.extraPoints) || 0);
          const count = Math.max(1, Number(entry.extraQuizzes) || 1);
          const avgScore = Math.round(pts / count);
          const totalEst = Math.max(avgScore, 1);
          byId.set(`lb-random-${lbKey}`, {
            id: `lb-random-${lbKey}`,
            created_at: entry.updatedAt || null,
            quiz: 'quiz-aleatoire',
            score: pts,
            total: totalEst,
            passed: true,
          });
          break;
        }
      } catch {
        // Ignore
      }
    }
  }

  // 4) Also include any chapter that was already completed before history tracking was added
  if (byChapter && typeof byChapter === 'object') {
    for (const [chId, qs] of Object.entries(byChapter)) {
      if (!Array.isArray(qs) || qs.length === 0 || seenChapters.has(chId)) continue;
      const chProg = all[chId];
      const ans = chProg?.answers || {};
      const answered = qs.filter((q) => Array.isArray(ans[q.id]) && ans[q.id].length > 0);
      if ((chProg?.sent && answered.length > 0) || answered.length === qs.length) {
        const isPerfect = (q, picked) => {
          const good = q.items.filter((i) => i.correct).map((i) => i.id).sort().join();
          return good === [...picked].sort().join();
        };
        const score = answered.filter((q) => isPerfect(q, ans[q.id])).length;
        const total = qs.length;
        byId.set(`completed-${chId}`, {
          id: `completed-${chId}`,
          created_at: null,
          quiz: chId,
          score,
          total,
          passed: score / total >= 0.6,
        });
      }
    }
  }

  return [...byId.values()].sort((a, b) => {
    if (a.created_at && b.created_at) return b.created_at.localeCompare(a.created_at);
    if (a.created_at) return -1;
    if (b.created_at) return 1;
    return a.quiz.localeCompare(b.quiz);
  });
}

export async function syncUsersHistoryFromAttempts(attempts) {
  if (!Array.isArray(attempts) || attempts.length === 0) return;
  const byUser = new Map();
  for (const a of attempts) {
    if (!a || (typeof a.course === 'string' && a.course.startsWith('report-'))) continue;
    const name = (a.name || a.participant_name || '').trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const k = normKey(name);
    if (!byUser.has(k)) byUser.set(k, { name, keys: {}, items: [] });
    const normalizedQuiz =
      a.quiz === 'aleatoire' || a.quiz === 'quiz-aleatoire' || a.course === 'mixte'
        ? 'quiz-aleatoire'
        : String(a.quiz || 'ch1');
    const s = Math.max(0, Math.round(Number(a.score) || 0));
    const t = Math.max(1, Math.round(Number(a.total) || 1));
    const hKey = encodeAttemptKey({
      quiz: normalizedQuiz,
      score: s,
      total: t,
      createdAt: a.created_at,
    });
    byUser.get(k).keys[hKey] = ['A'];
    byUser.get(k).items.push({
      id: hKey,
      created_at: a.created_at || new Date().toISOString(),
      quiz: normalizedQuiz,
      score: s,
      total: t,
      passed: typeof a.passed === 'boolean' ? a.passed : s / t >= 0.6,
    });
  }

  for (const { name, keys, items } of byUser.values()) {
    const existingList = readLocalHistoryList(name);
    const mergedById = new Map();
    for (const it of existingList) if (it?.id) mergedById.set(it.id, it);
    for (const it of items) if (it?.id) mergedById.set(it.id, it);
    writeLocalHistoryList(name, [...mergedById.values()]);

    const all = readRawMap(name);
    const curAns = all[HISTORY_CHAPTER_KEY]?.answers || {};
    all[HISTORY_CHAPTER_KEY] = {
      answers: { ...curAns, ...keys },
      sent: true,
    };
    writeRawMap(name, all);
    fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        progress: { [HISTORY_CHAPTER_KEY]: all[HISTORY_CHAPTER_KEY] },
      }),
    }).catch(() => {});
  }
  notify();
}

export async function syncProgressFromServer(name = readName()) {
  const clean = (name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return;
  migrateLegacyIfEmpty(clean);
  try {
    const r = await fetch(`/api/progress?name=${encodeURIComponent(clean)}`);
    if (!r.ok) return;
    const json = await r.json();
    const remote = json?.progress && typeof json.progress === 'object' ? json.progress : {};
    const local = readRawMap(clean);
    const merged = { ...remote };
    let localHasNewer = false;

    for (const [ch, locVal] of Object.entries(local)) {
      const remVal = remote[ch] || { answers: {}, sent: false };
      const mergedAnswers = { ...(remVal.answers || {}), ...(locVal.answers || {}) };
      if (Object.keys(mergedAnswers).length > Object.keys(remVal.answers || {}).length) {
        localHasNewer = true;
      }
      merged[ch] = {
        answers: mergedAnswers,
        sent: Boolean(remVal.sent || locVal.sent),
      };
    }

    writeRawMap(clean, merged);
    notify();
    if (localHasNewer) schedulePush(clean);
  } catch { /* ignore network errors */ }
}
