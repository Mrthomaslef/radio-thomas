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

export function mergeLocalAndServerRow(id, locRow, srvRow) {
  if (!locRow?.data) return { row: srvRow, changedLocal: false, shouldSyncToServer: false };
  if (!srvRow?.data) return { row: locRow, changedLocal: false, shouldSyncToServer: true };

  const loc = locRow.data;
  const srv = srvRow.data;
  const bundled = bundledById.get(id);

  const isDiffFromBundled = (d) =>
    !bundled ||
    d.type !== bundled.type ||
    resolveDifficulty(id, d.difficulty) !== resolveDifficulty(id, bundled.difficulty) ||
    d.enonce !== bundled.enonce ||
    d.theme !== bundled.theme ||
    JSON.stringify(d.items) !== JSON.stringify(bundled.items) ||
    cleanExplication(d.explication) !== cleanExplication(bundled.explication);

  const locDiffers = isDiffFromBundled(loc);
  const srvDiffers = isDiffFromBundled(srv);

  // Local browser edits always win when they contain customizations compared to the bundled question
  const preferLocalText =
    locDiffers ||
    !srvDiffers ||
    (locRow.updated_at && (!srvRow.updated_at || locRow.updated_at >= srvRow.updated_at));

  const baseText = preferLocalText ? loc : srv;

  // Upgrade any inline dataUrl images to lossless server { upload } IDs while keeping local captions/order
  const srvEnonceImg = srv.enonce_image;
  const locEnonceImg = loc.enonce_image;
  let mergedEnonceImg = preferLocalText ? locEnonceImg ?? srvEnonceImg ?? null : srvEnonceImg ?? locEnonceImg ?? null;
  if (mergedEnonceImg?.dataUrl && srvEnonceImg?.upload) {
    mergedEnonceImg = {
      upload: srvEnonceImg.upload,
      alt: locEnonceImg?.alt || srvEnonceImg.alt || '',
    };
  }

  const srvFigs = Array.isArray(srv.correction_figures) ? srv.correction_figures : [];
  const locFigs = Array.isArray(loc.correction_figures) ? loc.correction_figures : [];
  const locHasCustomFigs =
    locFigs.some((f) => f?.dataUrl || f?.upload) ||
    (bundled && JSON.stringify(locFigs) !== JSON.stringify(bundled.correction_figures || []));

  const rawFigs = locHasCustomFigs ? locFigs : srvFigs.length > 0 ? srvFigs : locFigs;
  const mergedFigs = rawFigs.map((f, idx) => {
    if (f?.dataUrl && srvFigs[idx]?.upload) {
      return {
        upload: srvFigs[idx].upload,
        caption: f.caption || srvFigs[idx].caption || 'Figure',
      };
    }
    return f;
  });

  const mergedData = {
    ...srv,
    ...baseText,
    reviewed: Boolean(loc.reviewed || srv.reviewed),
    reviewed_by: loc.reviewed_by || srv.reviewed_by || (loc.reviewed || srv.reviewed ? 'Thomas L.' : null),
    enonce_image: mergedEnonceImg,
    correction_figures: mergedFigs,
  };

  const srvFigsNorm = srvFigs.map((f) => ({
    upload: f?.upload || null,
    file: f?.file || null,
    caption: f?.caption || '',
  }));
  const mergedFigsNorm = mergedFigs.map((f) => ({
    upload: f?.upload || null,
    file: f?.file || null,
    caption: f?.caption || '',
  }));

  const shouldSyncToServer =
    mergedData.type !== srv.type ||
    resolveDifficulty(id, mergedData.difficulty) !== resolveDifficulty(id, srv.difficulty) ||
    mergedData.enonce !== srv.enonce ||
    mergedData.explication !== srv.explication ||
    mergedData.theme !== srv.theme ||
    Boolean(mergedData.reviewed) !== Boolean(srv.reviewed) ||
    (mergedData.reviewed_by || null) !== (srv.reviewed_by || null) ||
    JSON.stringify(mergedData.items) !== JSON.stringify(srv.items) ||
    Boolean(mergedData.enonce_image?.dataUrl) ||
    (mergedData.enonce_image?.upload || null) !== (srv.enonce_image?.upload || null) ||
    mergedFigs.some((f) => Boolean(f?.dataUrl)) ||
    JSON.stringify(mergedFigsNorm) !== JSON.stringify(srvFigsNorm);

  const hadDataUrlUpgraded =
    (Boolean(locEnonceImg?.dataUrl) && Boolean(mergedEnonceImg?.upload)) ||
    locFigs.some((f, idx) => Boolean(f?.dataUrl) && Boolean(mergedFigs[idx]?.upload));

  const mergedRow = {
    ...srvRow,
    ...locRow,
    chapter: locRow.chapter || srvRow.chapter,
    position: Number.isInteger(locRow.position) ? locRow.position : srvRow.position || 0,
    data: mergedData,
  };

  return {
    row: mergedRow,
    changedLocal: hadDataUrlUpgraded || (!preferLocalText && srvDiffers),
    shouldSyncToServer,
  };
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

  const serverById = new Map(rows.map((r) => [r.id, r]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const toSync = [];
  let localMapUpgraded = false;

  for (const [id, revRow] of Object.entries(localReviewerMap)) {
    if (revRow && revRow.id && revRow.chapter && revRow.data) {
      if (rows === bundledQuestions) {
        byId.set(id, revRow);
        continue;
      }
      const srv = serverById.get(id);
      const { row: mergedRow, changedLocal, shouldSyncToServer } = mergeLocalAndServerRow(id, revRow, srv);
      byId.set(id, mergedRow);
      if (changedLocal) {
        localReviewerMap[id] = mergedRow;
        localMapUpgraded = true;
      }
      if (shouldSyncToServer) {
        toSync.push(mergedRow);
      }
    }
  }
  if (localMapUpgraded && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem('quiz-cotten:reviewer-edits:v1', JSON.stringify(localReviewerMap));
    } catch {
      // ignore storage quota errors
    }
  }

  // Auto-sync any local reviewer edits or local 'reviewed' flags from this browser to the live database
  if (typeof window !== 'undefined' && rows !== bundledQuestions) {
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
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((out) => {
              if (out?.question) {
                try {
                  const currMap = JSON.parse(localStorage.getItem('quiz-cotten:reviewer-edits:v1') || '{}') || {};
                  if (currMap[item.id]) {
                    currMap[item.id] = {
                      ...currMap[item.id],
                      data: out.question,
                      updated_at: new Date().toISOString(),
                    };
                    localStorage.setItem('quiz-cotten:reviewer-edits:v1', JSON.stringify(currMap));
                  }
                } catch {
                  // ignore storage errors
                }
              }
            })
            .catch(() => {});
        }
      }, 100);
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

let cache = null; // shared by the home page and the quiz
let lastFetchAt = 0;
const listeners = new Set();

function fetchLiveQuestions() {
  lastFetchAt = Date.now();
  return fetch(`/api/questions?t=${lastFetchAt}`, { cache: 'no-store' })
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
    if (!cache || Date.now() - lastFetchAt > 3000) {
      fetchLiveQuestions();
    }
    const onRefresh = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (Date.now() - lastFetchAt > 2000) {
        fetchLiveQuestions();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onRefresh);
      window.addEventListener('hashchange', onRefresh);
      document.addEventListener('visibilitychange', onRefresh);
    }
    return () => {
      listeners.delete(setState);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onRefresh);
        window.removeEventListener('hashchange', onRefresh);
        document.removeEventListener('visibilitychange', onRefresh);
      }
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
