// Loads the live quiz questions from /api/questions (editable from the admin page).
// The JSON files bundled with the site are the fallback when the API is unreachable or empty.
import { useEffect, useState } from 'react';
import ch1 from './quiz/ch1.json';
import ch2 from './quiz/ch2.json';
import ch3 from './quiz/ch3.json';
import ch4 from './quiz/ch4.json';
import ch5 from './quiz/ch5.json';
import ch6 from './quiz/ch6.json';
import ch7 from './quiz/ch7.json';
import ch8 from './quiz/ch8.json';
import ch9 from './quiz/ch9.json';
import ch10 from './quiz/ch10.json';
import ch11 from './quiz/ch11.json';
import ch12 from './quiz/ch12.json';
import ch13 from './quiz/ch13.json';
import ch14 from './quiz/ch14.json';
import ch15 from './quiz/ch15.json';
import ch16 from './quiz/ch16.json';
import ch17 from './quiz/ch17.json';
import ch18 from './quiz/ch18.json';
import ch19 from './quiz/ch19.json';
import ch20 from './quiz/ch20.json';
import ch21 from './quiz/ch21.json';
import ch22 from './quiz/ch22.json';
import ch23 from './quiz/ch23.json';
import ch24 from './quiz/ch24.json';
import ch25 from './quiz/ch25.json';
import ch26 from './quiz/ch26.json';
import ch27 from './quiz/ch27.json';
import ch28 from './quiz/ch28.json';
import ch29 from './quiz/ch29.json';
import ch30 from './quiz/ch30.json';
import ch31 from './quiz/ch31.json';
import ch32 from './quiz/ch32.json';
import ch33 from './quiz/ch33.json';
import ch34 from './quiz/ch34.json';
import ch35 from './quiz/ch35.json';
import ch36 from './quiz/ch36.json';

// Chapter metadata (title/authors feed the reference line of each correction).
export const CHAPTERS = {
  ch1, ch2, ch3, ch4, ch5, ch6, ch7, ch8, ch9, ch10, ch11, ch12, ch13, ch14, ch15, ch16, ch17, ch18, ch19, ch20, ch21, ch22,
  ch23, ch24, ch25, ch26, ch27, ch28, ch29, ch30, ch31, ch32, ch33, ch34, ch35, ch36,
};
export const CHAPTER_KEYS = Object.keys(CHAPTERS);

// Questions bundled with the site, in the same shape as the database rows.
export const bundledQuestions = CHAPTER_KEYS.flatMap((key) =>
  CHAPTERS[key].questions.map(({ id, ...data }, position) => ({ id, chapter: key, position, data }))
);

export const bundledById = new Map(bundledQuestions.map((b) => [b.id, b.data]));

export function resolveDifficulty(id, rawDiff) {
  const n = Number(rawDiff ?? bundledById.get(id)?.difficulty);
  return n === 1 || n === 2 || n === 3 ? n : 2;
}

// Strips hardcoded option-letter references ("La réponse correcte est A.", "(B faux)", etc.)
// because answer options are shuffled when displayed.
export function cleanExplication(text) {
  if (!text || typeof text !== 'string') return text;
  let s = text;
  s = s.replace(/^\s*(?:La réponse(?: correcte)? est|Les réponses(?: correctes)? sont)\s+[A-F](?:\s*,\s*[A-F])*(?:\s+et\s+[A-F])?\s*\.\s*/i, '');
  s = s.replace(/^\s*Toutes ces affirmations sont exactes\.\s*/i, '');
  s = s.replace(/\s*\((?:(?:la )?(?:réponse|proposition|affirmation|item)s?\s+)?[A-F](?:\s*(?:,|et)\s*[A-F])*\s*(?:(?:est|sont)\s+)?(?:donc\s+)?(?:vrai(?:e|s|es)?|faux|fausse(?:s)?|exact(?:e|s|es)?|incorrect(?:e|s|es)?)?(?:\s*,\s*[A-F]\s*(?:est|sont)?\s*(?:vrai(?:e|s|es)?|faux|fausse(?:s)?))?\)/g, '');
  s = s.replace(/\b[A-F](?:\s+et\s+[A-F])?\s+(?:est|sont)\s+(?:donc\s+)?(?:faux|fausse|fausses|vrai|vraie|vrais|vraies)\s*:\s*/g, '');
  s = s.replace(/(\.\s+)([a-zàâäéèêëîïôöùûüçœ])/g, (_, sep, ch) => sep + ch.toUpperCase());
  s = s
    .split('\n')
    .map((line) => {
      let l = line.replace(/[ \t]+/g, ' ').replace(/ +\./g, '.').replace(/ +,/g, ',').trim();
      if (l.length > 0) l = l[0].toUpperCase() + l.slice(1);
      return l;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}

const toQuestion = (row) => {
  let localReviewed = {};
  let localReviewedBy = {};
  try {
    localReviewed = JSON.parse(localStorage.getItem('radio-thomas:reviewed-questions') || '{}') || {};
    localReviewedBy = JSON.parse(localStorage.getItem('radio-thomas:reviewed-by-questions') || '{}') || {};
  } catch {
    // Ignore storage errors
  }
  const isReviewed =
    localReviewed[row.id] !== undefined
      ? Boolean(localReviewed[row.id])
      : Boolean(row.data?.reviewed || row.data?.reviewed_by);
  const reviewedBy = isReviewed
    ? row.data?.reviewed_by || localReviewedBy[row.id] || 'Thomas L.'
    : null;

  return {
    id: row.id,
    ...row.data,
    reviewed: isReviewed,
    reviewed_by: reviewedBy,
    difficulty: resolveDifficulty(row.id, row.data?.difficulty),
    explication: cleanExplication(row.data?.explication),
  };
};

// Address of an image: an inline dataUrl, an upload from the admin ({upload}) or a bundled figure ({file}).
export const imageSrc = (chapter, img) =>
  !img
    ? ''
    : img.dataUrl
    ? img.dataUrl
    : img.upload
    ? `/api/image?id=${img.upload}`
    : encodeURI(`/figures/${chapter}/${img.file}`);

// Read any locally accepted question proposals so they appear immediately even before cache expiry.
function readLocallyAcceptedRows() {
  try {
    const subs = JSON.parse(localStorage.getItem('quiz-cotten:local-submissions:v1') || '[]');
    const decisions = JSON.parse(localStorage.getItem('quiz-cotten:submission-decisions:v1') || '{}');
    if (!Array.isArray(subs)) return [];
    const out = [];
    for (const s of subs) {
      if (!s || !s.question || !s.chapter) continue;
      const dec = decisions[s.id]?.decision || s.decision || s.status;
      const isResolved = Boolean(s.resolved_at || decisions[s.id]?.resolved_at);
      if (dec === 'accepted' || (isResolved && dec !== 'refused')) {
        out.push({
          id: `local-${s.id}`,
          chapter: s.chapter,
          position: 900,
          data: { ...s.question, reviewed: true },
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

// Group database rows by chapter; keeps only known chapters and includes any new bundled questions not yet in DB.
function groupByChapter(rows) {
  let localReviewerMap = {};
  let localReviewed = {};
  let localReviewedBy = {};
  try {
    localReviewerMap = JSON.parse(localStorage.getItem('quiz-cotten:reviewer-edits:v1') || '{}') || {};
    localReviewed = JSON.parse(localStorage.getItem('radio-thomas:reviewed-questions') || '{}') || {};
    localReviewedBy = JSON.parse(localStorage.getItem('radio-thomas:reviewed-by-questions') || '{}') || {};
  } catch {
    localReviewerMap = {};
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const [id, revRow] of Object.entries(localReviewerMap)) {
    if (revRow && revRow.id && revRow.chapter && revRow.data) {
      byId.set(id, revRow);
    }
  }

  // Auto-sync any local reviewer edits or local 'reviewed' flags from this browser to the live database
  if (typeof window !== 'undefined' && rows !== bundledQuestions) {
    const serverById = new Map(rows.map((r) => [r.id, r]));
    const toSync = [];
    for (const [id, revRow] of Object.entries(localReviewerMap)) {
      if (!revRow?.id || !revRow?.chapter || !revRow?.data) continue;
      const srv = serverById.get(id);
      const srvData = srv?.data;
      const locData = revRow.data;
      if (
        !srvData ||
        srvData.enonce !== locData.enonce ||
        srvData.explication !== locData.explication ||
        srvData.theme !== locData.theme ||
        Boolean(srvData.reviewed) !== Boolean(locData.reviewed) ||
        JSON.stringify(srvData.items) !== JSON.stringify(locData.items) ||
        JSON.stringify(srvData.correction_figures) !== JSON.stringify(locData.correction_figures)
      ) {
        toSync.push(revRow);
      }
    }
    for (const [id, isRev] of Object.entries(localReviewed)) {
      if (!isRev || localReviewerMap[id]) continue;
      const srv = serverById.get(id) || bundledQuestions.find((b) => b.id === id);
      if (srv && !srv.data?.reviewed) {
        toSync.push({
          id: srv.id,
          chapter: srv.chapter,
          position: srv.position || 0,
          data: {
            ...srv.data,
            reviewed: true,
            reviewed_by: localReviewedBy[id] || srv.data?.reviewed_by || 'Thomas L.',
          },
        });
      }
    }
    if (toSync.length > 0) {
      setTimeout(() => {
        for (const item of toSync) {
          fetch('/api/admin-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              password: 'cocochin',
              action: 'save',
              id: item.id,
              chapter: item.chapter,
              position: item.position || 0,
              question: item.data,
            }),
          }).catch(() => {});
        }
      }, 200);
    }
  }
  const merged = [];

  for (const r of byId.values()) {
    const bundled = bundledById.get(r.id);
    // If a user-proposed question was saved when a chapter was empty, its ID (e.g. c5-q01)
    // may collide with a bundled book question added later. Keep both!
    if (
      bundled &&
      r.data?.source?.element === 'Proposition utilisateur' &&
      r.data?.enonce?.trim() !== bundled.enonce?.trim()
    ) {
      merged.push({
        ...r,
        id: `${r.id}-prop`,
        position: Math.max(r.position || 0, 500),
      });
      merged.push({
        id: r.id,
        chapter: r.chapter,
        position: r.position,
        data: bundled,
      });
    } else {
      merged.push(r);
    }
  }

  for (const b of bundledQuestions) {
    if (!byId.has(b.id)) {
      merged.push(b);
    }
  }

  // Also include any locally accepted proposals not yet present in merged
  const existingEnonces = new Set(
    merged.map((m) => `${m.chapter}::${(m.data?.enonce || '').trim().toLowerCase()}`)
  );
  for (const localRow of readLocallyAcceptedRows()) {
    const key = `${localRow.chapter}::${(localRow.data?.enonce || '').trim().toLowerCase()}`;
    if (!existingEnonces.has(key)) {
      existingEnonces.add(key);
      merged.push(localRow);
    }
  }

  const out = {};
  for (const key of CHAPTER_KEYS) out[key] = [];
  for (const row of merged) if (out[row.chapter]) out[row.chapter].push(row);
  for (const key of CHAPTER_KEYS) {
    out[key].sort((a, b) => a.position - b.position);
    out[key] = out[key].map(toQuestion);
  }
  return out;
}

const fallback = () => groupByChapter(bundledQuestions);

let cache = null; // one request per page load, shared by the home page and the quiz
const listeners = new Set();

function fetchLiveQuestions() {
  return fetch(`/api/questions?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((json) => {
      if (!Array.isArray(json.questions) || json.questions.length === 0) throw new Error('empty');
      cache = groupByChapter(json.questions);
      const nextState = { byChapter: cache, loading: false, live: true };
      for (const fn of listeners) fn(nextState);
      return nextState;
    })
    .catch(() => {
      const nextState = { byChapter: fallback(), loading: false, live: false };
      for (const fn of listeners) fn(nextState);
      return nextState;
    });
}

export function useQuestions() {
  const [state, setState] = useState(() => ({
    byChapter: cache || fallback(),
    loading: !cache,
    live: Boolean(cache),
  }));

  useEffect(() => {
    listeners.add(setState);
    if (!cache) {
      fetchLiveQuestions();
    }
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return {
    ...state,
    reload: fetchLiveQuestions,
  };
}

// Used by the admin page after a save/delete/import so the public pages refetch.
export function resetQuestionsCache() {
  cache = null;
  if (listeners.size > 0) {
    fetchLiveQuestions();
  }
}
