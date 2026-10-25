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
let pendingPushName = '';

function pushProgressNow(name) {
  const clean = (name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return Promise.resolve();
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  pendingPushName = '';
  const progress = readRawMap(clean);
  return fetch('/api/progress', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: clean, progress }),
    keepalive: true,
  })
    .then(async (r) => {
      if (!r.ok) return;
      const json = await r.json();
      if (json?.progress && typeof json.progress === 'object') {
        applyRemoteProgressMerge(clean, json.progress, false);
      }
    })
    .catch(() => { /* offline or table not yet created */ });
}

function schedulePush(name) {
  if (!name) return;
  pendingPushName = name;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushProgressNow(name);
  }, 80);
}

export function writeChapterProgress(chapterKey, data, name = readName()) {
  if (!name) return;
  const now = Date.now();
  const all = readRawMap(name);
  const prev = all[chapterKey] || {};
  const prevAns = prev.answers || {};
  const nextAns = data.answers || {};
  const prevTs =
    prev.answerTimestamps && typeof prev.answerTimestamps === 'object' ? prev.answerTimestamps : {};
  const nextTs = {
    ...prevTs,
    ...(data.answerTimestamps && typeof data.answerTimestamps === 'object' ? data.answerTimestamps : {}),
  };

  for (const [qid, picked] of Object.entries(nextAns)) {
    if (
      !nextTs[qid] ||
      JSON.stringify(prevAns[qid]) !== JSON.stringify(picked)
    ) {
      nextTs[qid] = now;
    }
  }

  const clearedAt = data.clearedAt !== undefined ? Number(data.clearedAt) || 0 : Number(prev.clearedAt) || 0;
  all[chapterKey] = {
    answers: nextAns,
    sent: Boolean(data.sent),
    historyRecorded:
      data.historyRecorded !== undefined
        ? Boolean(data.historyRecorded)
        : Boolean(data.sent || prev.historyRecorded),
    ...(Object.keys(nextTs).length > 0 ? { answerTimestamps: nextTs } : {}),
    ...(clearedAt > 0 ? { clearedAt } : {}),
    updatedAt: Number(data.updatedAt) || now,
  };
  writeRawMap(name, all);
  notify();
  schedulePush(name);
}

export function clearChapterProgress(chapterKey, name = readName()) {
  if (!name) return;
  const now = Date.now();
  const all = readRawMap(name);
  all[chapterKey] = {
    answers: {},
    sent: false,
    historyRecorded: false,
    clearedAt: now,
    updatedAt: now,
  };
  writeRawMap(name, all);
  notify();
  schedulePush(name);
}

export function writeQuestionAnswer(chapterKey, questionId, picked, name = readName()) {
  if (!name || !chapterKey || !questionId) return;
  const now = Date.now();
  const cur = readChapterProgress(chapterKey, name);
  const answers = { ...(cur.answers || {}) };
  const answerTimestamps = { ...(cur.answerTimestamps || {}) };
  if (picked && picked.length) {
    answers[questionId] = picked;
    answerTimestamps[questionId] = now;
    writeChapterProgress(chapterKey, { answers, answerTimestamps, sent: cur.sent, updatedAt: now }, name);
  } else {
    delete answers[questionId];
    answerTimestamps[questionId] = now;
    writeChapterProgress(
      chapterKey,
      { answers, answerTimestamps, sent: cur.sent, clearedAt: now, updatedAt: now },
      name
    );
  }
}

const BOOKMARKS_CHAPTER_KEY = 'ch97';
const BOOKMARKS_STORAGE_PREFIX = 'quiz-cotten:bookmarks:v1:';

function readLocalBookmarksMap(name) {
  const k = normKey(name);
  if (!k) return {};
  try {
    const raw = JSON.parse(localStorage.getItem(`${BOOKMARKS_STORAGE_PREFIX}${k}`) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeLocalBookmarksMap(name, map) {
  const k = normKey(name);
  if (!k) return;
  try {
    localStorage.setItem(`${BOOKMARKS_STORAGE_PREFIX}${k}`, JSON.stringify(map));
  } catch {
    // Ignore storage errors in private mode
  }
}

export function readBookmarks(name = readName()) {
  if (!name) return {};
  const all = readAllProgress(name);
  const ch97 = all[BOOKMARKS_CHAPTER_KEY];
  const remoteAns = ch97?.answers || {};
  const remoteTs = ch97?.answerTimestamps || {};
  const localMap = readLocalBookmarksMap(name);
  const out = {};

  for (const [qid, val] of Object.entries(remoteAns)) {
    if (Array.isArray(val) && val[0] === 'A') {
      out[qid] = true;
    }
  }

  // Only fall back to localMap for questions not yet tracked in ch97.answers
  for (const [qid, entry] of Object.entries(localMap)) {
    const isObj = entry && typeof entry === 'object' && !Array.isArray(entry);
    const isOn = isObj ? Boolean(entry.on) : Boolean(entry);
    const locTime = isObj ? Number(entry.ts) || 0 : 0;
    const remTime = Number(remoteTs[qid]) || 0;
    const hasRemote = Array.isArray(remoteAns[qid]) && remoteAns[qid].length > 0;

    if (!hasRemote || (locTime > 0 && locTime > remTime)) {
      if (isOn) out[qid] = true;
      else delete out[qid];
    }
  }
  return out;
}

export function isQuestionBookmarked(questionId, name = readName()) {
  if (!questionId) return false;
  const map = readBookmarks(name);
  return Boolean(map[questionId]);
}

export function toggleQuestionBookmark(questionId, name = readName()) {
  if (!name || !questionId) return false;
  const now = Date.now();
  const current = readBookmarks(name);
  const nextVal = !current[questionId];

  const localMap = readLocalBookmarksMap(name);
  localMap[questionId] = { on: nextVal, ts: now };
  writeLocalBookmarksMap(name, localMap);

  const cur = readChapterProgress(BOOKMARKS_CHAPTER_KEY, name);
  const answers = { ...(cur.answers || {}) };
  const answerTimestamps = { ...(cur.answerTimestamps || {}) };
  answers[questionId] = [nextVal ? 'A' : 'B'];
  answerTimestamps[questionId] = now;
  writeChapterProgress(
    BOOKMARKS_CHAPTER_KEY,
    { answers, answerTimestamps, sent: true, updatedAt: now },
    name
  );
  return nextVal;
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

export function recordQuizAttempt({ quiz, score, total, createdAt, restarted = false }, name = readName()) {
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
        ...(restarted ? { restarted: true } : {}),
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

  const sorted = [...byId.values()].sort((a, b) => {
    if (a.created_at && b.created_at) return b.created_at.localeCompare(a.created_at);
    if (a.created_at) return -1;
    if (b.created_at) return 1;
    return a.quiz.localeCompare(b.quiz);
  });

  // Deduplicate accidental reload entries (same chapter quiz, same score & total within 30 min without restart)
  const chronological = [...sorted].reverse();
  const dedupedChrono = [];
  const lastByQuiz = new Map();
  for (const item of chronological) {
    if (item.quiz && item.quiz !== 'quiz-aleatoire' && !item.restarted && item.created_at) {
      const prev = lastByQuiz.get(item.quiz);
      if (
        prev &&
        prev.score === item.score &&
        prev.total === item.total &&
        prev.created_at &&
        Math.abs(new Date(item.created_at).getTime() - new Date(prev.created_at).getTime()) < 30 * 60 * 1000
      ) {
        continue;
      }
    }
    dedupedChrono.push(item);
    if (item.quiz) lastByQuiz.set(item.quiz, item);
  }

  return dedupedChrono.reverse();
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

function applyRemoteProgressMerge(clean, remote, allowRepush = true) {
  const local = readRawMap(clean);
  const allChapters = new Set([...Object.keys(remote || {}), ...Object.keys(local)]);
  const merged = {};
  let localHasNewer = false;

  for (const ch of allChapters) {
    const locVal = local[ch] || { answers: {}, sent: false };
    const remVal = (remote && remote[ch]) || { answers: {}, sent: false };
    const locCleared = Number(locVal?.clearedAt) || 0;
    const remCleared = Number(remVal?.clearedAt) || 0;

    if (locCleared > remCleared) {
      merged[ch] = {
        answers: locVal.answers || {},
        sent: Boolean(locVal.sent),
        historyRecorded: Boolean(locVal.historyRecorded || locVal.sent),
        ...(locVal.answerTimestamps && Object.keys(locVal.answerTimestamps).length > 0
          ? { answerTimestamps: locVal.answerTimestamps }
          : {}),
        clearedAt: locCleared,
        updatedAt: Math.max(Number(locVal.updatedAt) || 0, locCleared),
      };
      localHasNewer = true;
      continue;
    }

    if (remCleared > locCleared) {
      merged[ch] = {
        answers: remVal.answers || {},
        sent: Boolean(remVal.sent),
        historyRecorded: Boolean(remVal.historyRecorded || remVal.sent),
        ...(remVal.answerTimestamps && Object.keys(remVal.answerTimestamps).length > 0
          ? { answerTimestamps: remVal.answerTimestamps }
          : {}),
        clearedAt: remCleared,
        updatedAt: Math.max(Number(remVal.updatedAt) || 0, remCleared),
      };
      continue;
    }

    const remAns = remVal.answers || {};
    const locAns = locVal.answers || {};
    const remTs = remVal.answerTimestamps || {};
    const locTs = locVal.answerTimestamps || {};
    const remChTs = Number(remVal.updatedAt) || 0;
    const locChTs = Number(locVal.updatedAt) || 0;

    const allQids = new Set([...Object.keys(remAns), ...Object.keys(locAns)]);
    const mergedAnswers = {};
    const mergedTimestamps = {};
    const isDailyCh = ch === 'ch96';

    for (const qid of allQids) {
      const hasRem = Array.isArray(remAns[qid]) && remAns[qid].length > 0;
      const hasLoc = Array.isArray(locAns[qid]) && locAns[qid].length > 0;
      const rTime = Number(remTs[qid]) || remChTs;
      const lTime = Number(locTs[qid]) || locChTs;

      if (hasRem && hasLoc) {
        if (isDailyCh && (qid.startsWith('step-') || qid.startsWith('sd-'))) {
          const rCode = remAns[qid][0] || 'A';
          const lCode = locAns[qid][0] || 'A';
          const bestCode = lCode > rCode ? lCode : rCode;
          mergedAnswers[qid] = [bestCode];
          const maxT = Math.max(rTime, lTime);
          if (maxT > 0) mergedTimestamps[qid] = maxT;
          if (lCode > rCode) localHasNewer = true;
          continue;
        }
        const sameAns = JSON.stringify(remAns[qid]) === JSON.stringify(locAns[qid]);
        if (sameAns) {
          mergedAnswers[qid] = remAns[qid];
          const maxT = Math.max(rTime, lTime);
          if (maxT > 0) mergedTimestamps[qid] = maxT;
        } else if (lTime > rTime) {
          mergedAnswers[qid] = locAns[qid];
          if (lTime > 0) mergedTimestamps[qid] = lTime;
          localHasNewer = true;
        } else {
          // Remote server copy wins when equal or newer (prevents stale local storage from reverting answers)
          mergedAnswers[qid] = remAns[qid];
          if (rTime > 0) mergedTimestamps[qid] = rTime;
        }
      } else if (hasLoc) {
        mergedAnswers[qid] = locAns[qid];
        if (lTime > 0) mergedTimestamps[qid] = lTime;
        localHasNewer = true;
      } else if (hasRem) {
        mergedAnswers[qid] = remAns[qid];
        if (rTime > 0) mergedTimestamps[qid] = rTime;
      }
    }

    const maxCleared = Math.max(locCleared, remCleared);
    const maxUpdated = Math.max(remChTs, locChTs);
    merged[ch] = {
      answers: mergedAnswers,
      sent: Boolean(remVal.sent || locVal.sent),
      historyRecorded: Boolean(
        remVal.historyRecorded || locVal.historyRecorded || remVal.sent || locVal.sent
      ),
      ...(Object.keys(mergedTimestamps).length > 0 ? { answerTimestamps: mergedTimestamps } : {}),
      ...(maxCleared > 0 ? { clearedAt: maxCleared } : {}),
      ...(maxUpdated > 0 ? { updatedAt: maxUpdated } : {}),
    };
  }

  // Keep the local bookmarks mirror in sync with merged ch97 so stale local flags never override ch97
  const mergedCh97 = merged[BOOKMARKS_CHAPTER_KEY];
  if (mergedCh97?.answers) {
    const syncedBookmarks = {};
    const ch97Ts = mergedCh97.answerTimestamps || {};
    for (const [qid, val] of Object.entries(mergedCh97.answers)) {
      if (Array.isArray(val) && val.length > 0) {
        syncedBookmarks[qid] = { on: val[0] === 'A', ts: Number(ch97Ts[qid]) || Date.now() };
      }
    }
    writeLocalBookmarksMap(clean, syncedBookmarks);
  }

  // Keep the local daily steps mirror in sync with merged ch96 so cross-device steps & in-progress answers stay identical
  const mergedCh96 = merged['ch96'];
  if (mergedCh96?.answers) {
    syncLocalDailyStepsFromCh96(clean, mergedCh96);
  }

  writeRawMap(clean, merged);
  notify();
  if (allowRepush && localHasNewer) schedulePush(clean);
}

export async function checkPseudoExists(name) {
  const clean = (name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return false;
  const local = readRawMap(clean);
  if (Object.keys(local).length > 0) return true;
  try {
    const r = await fetch(`/api/progress?name=${encodeURIComponent(clean)}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const json = await r.json();
    const prog = json?.progress && typeof json.progress === 'object' ? json.progress : {};
    return Boolean(json?.exists || Object.keys(prog).length > 0);
  } catch {
    return false;
  }
}

export async function syncProgressFromServer(name = readName()) {
  const clean = (name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return;
  migrateLegacyIfEmpty(clean);
  try {
    const r = await fetch(`/api/progress?name=${encodeURIComponent(clean)}`, { cache: 'no-store' });
    if (!r.ok) return;
    const json = await r.json();
    const remote = json?.progress && typeof json.progress === 'object' ? json.progress : {};
    applyRemoteProgressMerge(clean, remote, true);
  } catch { /* ignore network errors */ }
}

const DAILY_CHAPTER_KEY = 'ch96';

function formatLocalDay(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return { iso: `${y}-${m}-${d}`, compact: `${y}${m}${d}` };
}

export const MAX_DAILY_STEPS = 3;
export const QUESTIONS_PER_STEP = 3;
const DAILY_STEPS_LOCAL_PREFIX = 'quiz-cotten:daily-steps:v1:';

function readLocalDailyStepsMap(name) {
  const k = normKey(name);
  if (!k) return {};
  try {
    const raw = JSON.parse(localStorage.getItem(`${DAILY_STEPS_LOCAL_PREFIX}${k}`) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeLocalDailyStepsMap(name, map) {
  const k = normKey(name);
  if (!k) return;
  try {
    localStorage.setItem(`${DAILY_STEPS_LOCAL_PREFIX}${k}`, JSON.stringify(map));
  } catch {
    // Ignore private mode errors
  }
}

function reconstructStepSessionFromCh96(sNum, ch96) {
  const rawAns = ch96?.answers || {};
  const tsMap = ch96?.answerTimestamps || {};
  const sqPrefix = `sq-${sNum}-`;
  const indexed = [];
  let maxTs = 0;

  for (const [k, val] of Object.entries(rawAns)) {
    if (!k.startsWith(sqPrefix) || !Array.isArray(val) || val[0] !== 'A') continue;
    const rest = k.slice(sqPrefix.length);
    const dashIdx = rest.indexOf('-');
    if (dashIdx === -1) continue;
    const orderIdx = parseInt(rest.slice(0, dashIdx), 10);
    const qid = rest.slice(dashIdx + 1);
    if (!Number.isNaN(orderIdx) && qid) {
      indexed.push({ orderIdx, qid });
      const t = Number(tsMap[k]) || 0;
      if (t > maxTs) maxTs = t;
    }
  }
  indexed.sort((a, b) => a.orderIdx - b.orderIdx);
  const questionIds = indexed.map((x) => x.qid);

  const clearedTs = Number(tsMap[`sc-${sNum}`]) || 0;
  if (clearedTs > maxTs) maxTs = clearedTs;

  const saPrefix = `sa-${sNum}-`;
  const answers = {};
  for (const [k, val] of Object.entries(rawAns)) {
    if (!k.startsWith(saPrefix) || !Array.isArray(val) || val.length === 0) continue;
    const qid = k.slice(saPrefix.length);
    const aTs = Number(tsMap[k]) || 0;
    if (aTs > maxTs) maxTs = aTs;
    // Ignore answers that were cleared by a later restart (`sc-<sNum>`)
    if (clearedTs > 0 && aTs > 0 && aTs <= clearedTs) continue;
    if (qid) {
      answers[qid] = val;
    }
  }

  return { questionIds, answers, clearedTs, updatedAt: maxTs };
}

function syncLocalDailyStepsFromCh96(name, ch96) {
  const rawAns = ch96?.answers || {};
  const stepNums = new Set();
  for (const k of Object.keys(rawAns)) {
    const m = k.match(/^(?:sq|sa|sc)-(\d{1,4})(?:-|$)/);
    if (m) stepNums.add(parseInt(m[1], 10));
  }
  if (stepNums.size === 0) return;

  const localMap = readLocalDailyStepsMap(name);
  let changed = false;
  for (const sNum of stepNums) {
    if (!sNum || sNum < 1) continue;
    const fromCh96 = reconstructStepSessionFromCh96(sNum, ch96);
    const prevLocal = localMap[sNum] || {};
    const localUpdated = Number(prevLocal.updatedAt) || 0;

    if (fromCh96.updatedAt >= localUpdated || !prevLocal.questionIds?.length) {
      const nextQids =
        fromCh96.questionIds.length > 0 ? fromCh96.questionIds : prevLocal.questionIds || [];
      const nextAns =
        fromCh96.clearedTs > localUpdated
          ? fromCh96.answers
          : { ...(prevLocal.answers || {}), ...fromCh96.answers };
      localMap[sNum] = {
        questionIds: nextQids,
        answers: nextAns,
        updatedAt: Math.max(localUpdated, fromCh96.updatedAt, Date.now()),
      };
      changed = true;
    }
  }
  if (changed) writeLocalDailyStepsMap(name, localMap);
}

export function readDailyStepSession(stepNumber, name = readName()) {
  if (!name || !stepNumber) return { questionIds: [], answers: {} };
  const sNum = Math.floor(Number(stepNumber));
  const localMap = readLocalDailyStepsMap(name);
  const localEntry = localMap[sNum] || {};
  const ch96 = readChapterProgress(DAILY_CHAPTER_KEY, name);
  const fromCh96 = reconstructStepSessionFromCh96(sNum, ch96);

  // Prefer synced ch96 questionIds so all devices share the exact same step questions
  const questionIds =
    fromCh96.questionIds.length > 0
      ? fromCh96.questionIds
      : Array.isArray(localEntry.questionIds)
        ? [...localEntry.questionIds]
        : [];

  const localUpdated = Number(localEntry.updatedAt) || 0;
  let answers;
  if (fromCh96.clearedTs > localUpdated) {
    answers = { ...fromCh96.answers };
  } else {
    answers = {
      ...(localEntry.answers && typeof localEntry.answers === 'object' ? localEntry.answers : {}),
      ...fromCh96.answers,
    };
  }

  return { questionIds, answers };
}

export function saveDailyStepSession(stepNumber, { questionIds, answers }, name = readName()) {
  if (!name || !stepNumber) return;
  const sNum = Math.floor(Number(stepNumber));
  const now = Date.now();

  const localMap = readLocalDailyStepsMap(name);
  const prevLocal = localMap[sNum] || {};
  const finalQids = Array.isArray(questionIds) && questionIds.length > 0 ? questionIds : prevLocal.questionIds || [];
  const finalAns = answers && typeof answers === 'object' ? answers : prevLocal.answers || {};

  localMap[sNum] = {
    questionIds: finalQids,
    answers: finalAns,
    updatedAt: now,
  };
  writeLocalDailyStepsMap(name, localMap);

  const cur = readChapterProgress(DAILY_CHAPTER_KEY, name);
  const chAns = { ...(cur.answers || {}) };
  const chTs = { ...(cur.answerTimestamps || {}) };

  const sqPrefix = `sq-${sNum}-`;
  finalQids.forEach((qid, idx) => {
    const key = `${sqPrefix}${idx}-${qid}`.slice(0, 64);
    if (!chAns[key]) {
      chAns[key] = ['A'];
      chTs[key] = now;
    }
  });

  const saPrefix = `sa-${sNum}-`;
  for (const [qid, picked] of Object.entries(finalAns)) {
    const key = `${saPrefix}${qid}`.slice(0, 64);
    if (Array.isArray(picked) && picked.length > 0) {
      chAns[key] = picked;
      chTs[key] = now;
    }
  }

  writeChapterProgress(
    DAILY_CHAPTER_KEY,
    { answers: chAns, answerTimestamps: chTs, sent: true, updatedAt: now },
    name
  );
}

export function clearDailyStepAnswers(stepNumber, name = readName()) {
  if (!name || !stepNumber) return;
  const sNum = Math.floor(Number(stepNumber));
  const now = Date.now();
  const localMap = readLocalDailyStepsMap(name);
  const prevLocal = localMap[sNum] || {};
  localMap[sNum] = {
    questionIds: prevLocal.questionIds || [],
    answers: {},
    updatedAt: now,
  };
  writeLocalDailyStepsMap(name, localMap);

  const cur = readChapterProgress(DAILY_CHAPTER_KEY, name);
  const chAns = { ...(cur.answers || {}) };
  const chTs = { ...(cur.answerTimestamps || {}) };
  const saPrefix = `sa-${sNum}-`;
  for (const k of Object.keys(chAns)) {
    if (k.startsWith(saPrefix)) {
      delete chAns[k];
      chTs[k] = now;
    }
  }
  // Record a synced step-clear timestamp key so other devices also clear older in-progress answers
  const scKey = `sc-${sNum}`;
  chAns[scKey] = ['A'];
  chTs[scKey] = now;

  writeChapterProgress(
    DAILY_CHAPTER_KEY,
    { answers: chAns, answerTimestamps: chTs, sent: true, updatedAt: now },
    name
  );
}

export function readDailyState(name = readName()) {
  if (!name) {
    return {
      goal: QUESTIONS_PER_STEP,
      onboarded: false,
      steps: {},
      currentStep: 1,
      totalStars: 0,
      todayCount: 0,
      todayStepsCount: 0,
      maxDailySteps: MAX_DAILY_STEPS,
      streak: 0,
      activeDays: [],
      starsByDay: {},
    };
  }
  const ch96 = readChapterProgress(DAILY_CHAPTER_KEY, name);
  const ans = ch96?.answers || {};
  const tsMap = ch96?.answerTimestamps || {};

  // Unified at 3 questions per step
  const goal = QUESTIONS_PER_STEP;
  const onboarded = Array.isArray(ans['onboarded']) && ans['onboarded'][0] === 'A';

  // 2) Completed steps & stars: step-<N> -> A (1), B (2), C (3)
  const steps = {};
  let maxCompletedStep = 0;
  let totalStars = 0;
  for (const [k, val] of Object.entries(ans)) {
    const m = k.match(/^step-(\d{1,4})$/);
    if (!m || !Array.isArray(val) || !val[0]) continue;
    const stepNum = parseInt(m[1], 10);
    if (!stepNum || stepNum < 1) continue;
    const starCode = val[0];
    const stars = starCode === 'C' ? 3 : starCode === 'B' ? 2 : 1;
    steps[stepNum] = stars;
    totalStars += stars;
    if (stepNum > maxCompletedStep) maxCompletedStep = stepNum;
  }

  // 3) Track active streak days and stars earned per day (completing 1 step suffices to continue the streak)
  const { iso: todayIso, compact: todayCompact } = formatLocalDay(new Date());
  const qPrefix = `q-${todayCompact}-`;
  const sdPrefix = `sd-${todayCompact}-`;
  let todayCount = 0;
  const todayStepsSet = new Set();

  const activeDates = new Set();
  const starsByDay = {};
  const countedDaySteps = new Set();

  for (const [k, val] of Object.entries(ans)) {
    if (!Array.isArray(val) || !val[0]) continue;
    if (k.startsWith(qPrefix) && val[0] === 'A') {
      todayCount += 1;
    }
    if (k.startsWith(sdPrefix)) {
      todayStepsSet.add(k.slice(sdPrefix.length));
    }

    const mSd = k.match(/^sd-(\d{4})(\d{2})(\d{2})-(\d{1,4})$/);
    if (mSd) {
      const dayIso = `${mSd[1]}-${mSd[2]}-${mSd[3]}`;
      const sNum = parseInt(mSd[4], 10);
      activeDates.add(dayIso);
      if (sNum > 0) {
        const keyPair = `${dayIso}:${sNum}`;
        if (!countedDaySteps.has(keyPair)) {
          countedDaySteps.add(keyPair);
          const code = val[0];
          const sdStars = code === 'C' ? 3 : code === 'B' ? 2 : 1;
          const sStars = Math.max(sdStars, steps[sNum] || 1);
          starsByDay[dayIso] = (starsByDay[dayIso] || 0) + sStars;
        }
      }
      continue;
    }

    const ms = k.match(/^streak-(\d{4}-\d{2}-\d{2})$/);
    if (ms && val[0] === 'A') {
      activeDates.add(ms[1]);
    }
  }

  // Also attribute any completed step-<N> via its timestamp if not already in sd-YYYYMMDD-<N>
  for (const [sNumStr, sStars] of Object.entries(steps)) {
    const sNum = parseInt(sNumStr, 10);
    const stepTs = Number(tsMap[`step-${sNum}`]);
    const dayIso =
      stepTs > 0 ? formatLocalDay(new Date(stepTs)).iso : todayIso;
    activeDates.add(dayIso);
    const keyPair = `${dayIso}:${sNum}`;
    if (!countedDaySteps.has(keyPair)) {
      countedDaySteps.add(keyPair);
      starsByDay[dayIso] = (starsByDay[dayIso] || 0) + sStars;
    }
  }

  const todayStepsCount = todayStepsSet.size;

  // Calculate consecutive day streak (1 completed step in a day suffices to keep the streak alive)
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  const todayStr = formatLocalDay(cursor).iso;
  if (!activeDates.has(todayStr)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (activeDates.has(formatLocalDay(cursor).iso)) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    goal,
    onboarded,
    steps,
    currentStep: maxCompletedStep + 1,
    totalStars,
    todayCount,
    todayStepsCount,
    maxDailySteps: MAX_DAILY_STEPS,
    streak,
    activeDays: [...activeDates].sort(),
    starsByDay,
  };
}

export function markDailyOnboarded(name = readName()) {
  if (!name) return;
  writeQuestionAnswer(DAILY_CHAPTER_KEY, 'onboarded', ['A'], name);
}

export function saveDailyGoal(goalNumber, name = readName()) {
  if (!name) return;
  const g = Number(goalNumber);
  const code = g === 1 ? 'D' : g === 3 ? 'A' : 'B';
  writeQuestionAnswer(DAILY_CHAPTER_KEY, 'daily-goal', [code], name);
}

export function recordDailyQuestionAnswered(name = readName()) {
  if (!name) return;
  const now = Date.now();
  const { compact } = formatLocalDay(new Date(now));
  const cur = readChapterProgress(DAILY_CHAPTER_KEY, name);
  const answers = { ...(cur.answers || {}) };
  const answerTimestamps = { ...(cur.answerTimestamps || {}) };

  const prefix = `q-${compact}-`;
  let maxIdx = 0;
  for (const k of Object.keys(answers)) {
    if (k.startsWith(prefix)) {
      const idx = parseInt(k.slice(prefix.length), 10) || 0;
      if (idx > maxIdx) maxIdx = idx;
    }
  }
  const nextKey = `${prefix}${maxIdx + 1}`;
  answers[nextKey] = ['A'];
  answerTimestamps[nextKey] = now;

  writeChapterProgress(
    DAILY_CHAPTER_KEY,
    { answers, answerTimestamps, sent: true, updatedAt: now },
    name
  );
}

export function recordDailyStepCompleted(stepNumber, stars, name = readName()) {
  if (!name || !stepNumber || stepNumber < 1) return;
  const now = Date.now();
  const cur = readChapterProgress(DAILY_CHAPTER_KEY, name);
  const answers = { ...(cur.answers || {}) };
  const answerTimestamps = { ...(cur.answerTimestamps || {}) };
  const sNum = Math.floor(stepNumber);
  const stepKey = `step-${sNum}`;

  const existingCode = Array.isArray(answers[stepKey]) ? answers[stepKey][0] : null;
  const existingStars = existingCode === 'C' ? 3 : existingCode === 'B' ? 2 : existingCode === 'A' ? 1 : 0;
  const bestStars = Math.max(existingStars, Math.min(3, Math.max(1, Math.round(stars || 1))));
  const nextCode = bestStars === 3 ? 'C' : bestStars === 2 ? 'B' : 'A';

  const { iso, compact } = formatLocalDay(new Date(now));
  const streakKey = `streak-${iso}`;
  const stepDoneTodayKey = `sd-${compact}-${sNum}`;

  if (existingStars === 0) {
    answers[stepDoneTodayKey] = [nextCode];
    answerTimestamps[stepDoneTodayKey] = now;
  } else if (answers[stepDoneTodayKey]) {
    answers[stepDoneTodayKey] = [nextCode];
    answerTimestamps[stepDoneTodayKey] = now;
  }

  answers[stepKey] = [nextCode];
  answerTimestamps[stepKey] = now;
  answers[streakKey] = ['A'];
  answerTimestamps[streakKey] = now;

  writeChapterProgress(
    DAILY_CHAPTER_KEY,
    { answers, answerTimestamps, sent: true, updatedAt: now },
    name
  );
}

if (typeof window !== 'undefined') {
  let lastAutoSync = 0;
  const autoSync = () => {
    const now = Date.now();
    if (now - lastAutoSync < 1500) return;
    lastAutoSync = now;
    const n = readName();
    if (n) syncProgressFromServer(n);
  };
  const flushPending = () => {
    const target = pendingPushName || readName();
    if (pushTimer && target) {
      pushProgressNow(target);
    }
  };
  window.addEventListener('focus', autoSync);
  window.addEventListener('online', autoSync);
  window.addEventListener('hashchange', autoSync);
  window.addEventListener('pagehide', flushPending);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      autoSync();
    } else {
      flushPending();
    }
  });
  // Periodic background sync when the tab is active so multi-device usage stays in real-time sync
  setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      const n = readName();
      if (n && !pushTimer) syncProgressFromServer(n);
    }
  }, 15000);
}
