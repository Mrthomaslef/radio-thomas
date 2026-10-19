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
