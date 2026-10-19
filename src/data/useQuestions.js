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

// Chapter metadata (title/authors feed the reference line of each correction).
export const CHAPTERS = { ch1, ch2, ch3, ch4, ch5, ch6, ch7, ch8, ch9 };
export const CHAPTER_KEYS = Object.keys(CHAPTERS);

// Questions bundled with the site, in the same shape as the database rows.
export const bundledQuestions = CHAPTER_KEYS.flatMap((key) =>
  CHAPTERS[key].questions.map(({ id, ...data }, position) => ({ id, chapter: key, position, data }))
);

const toQuestion = (row) => ({ id: row.id, ...row.data });

// Address of an image: an upload from the admin ({upload}) or a bundled figure ({file}).
export const imageSrc = (chapter, img) =>
  img.upload ? `/api/image?id=${img.upload}` : encodeURI(`/figures/${chapter}/${img.file}`);

// Group database rows by chapter; keeps only known chapters and includes any new bundled questions not yet in DB.
function groupByChapter(rows) {
  const seen = new Set(rows.map((r) => r.id));
  const merged = [...rows, ...bundledQuestions.filter((b) => !seen.has(b.id))];
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

export function useQuestions() {
  const [state, setState] = useState(() => ({
    byChapter: cache || fallback(),
    loading: !cache,
    live: Boolean(cache),
  }));

  useEffect(() => {
    if (cache) return undefined;
    let cancelled = false;
    fetch('/api/questions')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json) => {
        // An empty database (before the first import) keeps the bundled questions.
        if (!Array.isArray(json.questions) || json.questions.length === 0) throw new Error('empty');
        cache = groupByChapter(json.questions);
        if (!cancelled) setState({ byChapter: cache, loading: false, live: true });
      })
      .catch(() => {
        if (!cancelled) setState({ byChapter: fallback(), loading: false, live: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

// Used by the admin page after a save/delete/import so the public pages refetch.
export function resetQuestionsCache() {
  cache = null;
}
