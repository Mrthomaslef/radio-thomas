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

// Chapter metadata (title/authors feed the reference line of each correction).
export const CHAPTERS = {
  ch1, ch2, ch3, ch4, ch5, ch6, ch7, ch8, ch9, ch10, ch11, ch12, ch13, ch14, ch15, ch16, ch17, ch18, ch19, ch20, ch21, ch22,
  ch23, ch24, ch25, ch26, ch27, ch28, ch29, ch30,
};
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
