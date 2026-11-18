import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { themes } from '../data/themes.js';
import { useQuestions } from '../data/useQuestions.js';
import { readName, readAllProgress, subscribePlayer, syncProgressFromServer } from '../data/player.js';
import {
  SEMESTER,
  SEMESTER_PATH,
  computeSemesterUnlocks,
  formatOpenDate,
  localIsoDay,
  weekStatus,
} from '../data/semester.js';
import Icon from './Icons.jsx';

const CHAPTER_INFO = (() => {
  const map = {};
  for (const t of themes) {
    for (const c of t.chapters) {
      map[c.id] = { title: c.title, themeId: t.id, themeTitle: t.title, logo: t.logo || `/theme-logos/${t.id}.png` };
    }
  }
  return map;
})();

const SHORT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return SHORT_DATE.format(new Date(y, m - 1, d, 12)).replace('.', '');
}
function daysBetween(a, b) {
  const toDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toDate(b) - toDate(a)) / 86400000);
}

// Flatten the weeks into one timeline: one row per chapter (merged when it spans
// several weeks), plus exam and break milestones, grouped by body region.
const TIMELINE = (() => {
  const rows = [];
  const byKey = {};
  for (const w of SEMESTER.weeks) {
    if (w.break) rows.push({ type: 'break', start: w.start, end: w.end });
    for (const key of w.chapters) {
      if (byKey[key]) byKey[key].end = w.end;
      else rows.push((byKey[key] = { type: 'chapter', key, start: w.start, end: w.end }));
    }
    if (w.exam) rows.push({ type: 'exam', label: w.exam, start: w.start, end: w.end });
  }
  const groups = [];
  for (const r of rows) {
    const theme = r.type === 'chapter' ? CHAPTER_INFO[r.key]?.themeId : null;
    const last = groups[groups.length - 1];
    if (theme && (!last || last.themeId !== theme)) {
      const info = CHAPTER_INFO[r.key];
      groups.push({ themeId: theme, title: info.themeTitle, logo: info.logo, rows: [] });
    }
    const prevChapter = [...rows.slice(0, rows.indexOf(r))].reverse().find((x) => x.type === 'chapter');
    r.sameDate = r.type === 'chapter' && prevChapter?.start === r.start;
    groups[groups.length - 1].rows.push(r);
  }
  return groups;
})();

const EXAMS = SEMESTER.weeks.filter((w) => w.exam).map((w) => ({ label: w.exam, start: w.start, end: w.end }));

function isQuestionCorrect(q, picked) {
  if (!Array.isArray(picked) || picked.length === 0) return false;
  const good = (q.items || []).filter((i) => i.correct).map((i) => i.id).sort().join();
  return good === [...picked].sort().join();
}

function chapterStats(qs, ans) {
  const answered = qs.filter((q) => Array.isArray(ans[q.id]) && ans[q.id].length > 0);
  const completed = qs.length > 0 && answered.length === qs.length;
  const score = completed ? answered.filter((q) => isQuestionCorrect(q, ans[q.id])).length : 0;
  return { total: qs.length, done: answered.length, completed, score, passed: completed && score / qs.length >= 0.6 };
}

function ChapterCard({ chapterKey, stats, unlock, showUnlockHint }) {
  const title = CHAPTER_INFO[chapterKey]?.title || chapterKey;
  if (unlock && !unlock.unlocked) {
    return (
      <div className="sem-card sem-card-locked" aria-disabled="true">
        <span className="sem-card-icon" aria-hidden="true">🔒</span>
        <span className="sem-card-text">
          <span className="sem-card-title">{title}</span>
          {showUnlockHint && <span className="sem-card-hint">⚡ Termine le précédent pour l’ouvrir</span>}
        </span>
      </div>
    );
  }
  const state = stats.completed ? (stats.passed ? 'sem-card-passed' : 'sem-card-failed') : '';
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  return (
    <a href={`#/quiz/${chapterKey}?from=semestre`} className={`sem-card ${state}`}>
      <span className="sem-card-icon" aria-hidden="true">{stats.completed ? '✅' : unlock?.early ? '⚡' : '📖'}</span>
      <span className="sem-card-text">
        <span className="sem-card-title">{title}</span>
        {!stats.completed && stats.done > 0 && (
          <span className="sem-card-bar"><span style={{ width: `${pct}%` }} /></span>
        )}
      </span>
      <span className="sem-card-score">
        {stats.completed ? `${stats.score}/${stats.total}` : stats.done > 0 ? `${stats.done}/${stats.total}` : <Icon name="arrow" size={16} />}
      </span>
    </a>
  );
}

function ProgressRing({ value, total }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const ratio = total ? value / total : 0;
  return (
    <svg className="sem-ring" viewBox="0 0 76 76" aria-hidden="true">
      <defs>
        <linearGradient id="semRingGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#38e1ff" />
          <stop offset="100%" stopColor="#34d399" />
        </linearGradient>
      </defs>
      <circle cx="38" cy="38" r={r} className="sem-ring-bg" />
      <circle
        cx="38" cy="38" r={r} className="sem-ring-fg"
        strokeDasharray={c} strokeDashoffset={c * (1 - ratio)}
        transform="rotate(-90 38 38)"
      />
      <text x="38" y="36" textAnchor="middle" className="sem-ring-num">{value}</text>
      <text x="38" y="50" textAnchor="middle" className="sem-ring-total">/ {total}</text>
    </svg>
  );
}

export default function SemesterPage() {
  const { byChapter } = useQuestions();
  const [pseudo, setPseudo] = useState(readName);
  const [progress, setProgress] = useState(() => readAllProgress(readName()));
  const today = localIsoDay();
  const currentRef = useRef(null);

  useEffect(() => {
    const n = readName();
    if (n) syncProgressFromServer(n);
    return subscribePlayer(() => {
      const curr = readName();
      setPseudo(curr);
      setProgress(readAllProgress(curr));
    });
  }, []);

  // Bring this week's chapter into view if it is below the fold (after the router's scroll-to-top).
  useEffect(() => {
    const t = setTimeout(() => {
      const el = currentRef.current;
      if (el && el.getBoundingClientRect().bottom > window.innerHeight - 90) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 250);
    return () => clearTimeout(t);
  }, []);

  const stats = useMemo(() => {
    const out = {};
    const keys = [...SEMESTER_PATH.map((p) => p.key), ...SEMESTER.sideQuests.flatMap((s) => s.chapters)];
    for (const key of keys) out[key] = chapterStats(byChapter[key] || [], progress[key]?.answers || {});
    return out;
  }, [byChapter, progress]);

  const unlocks = useMemo(
    () => computeSemesterUnlocks((key) => (byChapter[key] || []).length === 0 || stats[key]?.completed, today),
    [byChapter, stats, today]
  );

  const completedCount = SEMESTER_PATH.filter((p) => stats[p.key]?.completed).length;
  const nextExam = EXAMS.find((e) => e.end >= today);
  const examIn = nextExam ? daysBetween(today, nextExam.start) : null;
  const before = today < SEMESTER.weeks[0].start;
  // The only locked chapter that can open early is the first locked one.
  const firstLocked = SEMESTER_PATH.find((p) => !unlocks[p.key]?.unlocked)?.key;
  let currentAssigned = false;

  return (
    <section className="home sem-page" aria-label={SEMESTER.title}>
      <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        Parcours <span className="grad">semestre</span>
      </motion.h1>

      <div className="home-panel">
        <div className="sem-hero">
          <ProgressRing value={completedCount} total={SEMESTER_PATH.length} />
          <div className="sem-hero-text">
            <p className="sem-kicker">Cochin – HEGP · Hiver 26–27</p>
            <p className="sem-hero-main">
              {before
                ? `Début le ${formatOpenDate(SEMESTER.weeks[0].start)}`
                : nextExam
                  ? examIn <= 0
                    ? `📝 ${nextExam.label} cette semaine`
                    : `📝 ${nextExam.label} dans ${examIn} jour${examIn > 1 ? 's' : ''}`
                  : 'Semestre terminé : tout est ouvert 🎉'}
            </p>
            <p className="sem-hero-rule">Un chapitre par semaine · ⚡ termine-le pour ouvrir le suivant</p>
          </div>
        </div>
        {!pseudo && (
          <p className="sem-pseudo-hint">
            Choisis un pseudo (onglet <a href="#/chapitres">Quiz</a>) pour garder ta progression.
          </p>
        )}

        {TIMELINE.map((g) => {
          const keys = g.rows.filter((r) => r.type === 'chapter').map((r) => r.key);
          const done = keys.filter((k) => stats[k]?.completed).length;
          return (
            <div key={g.themeId + g.rows[0].start} className="sem-group">
              <div className="sem-group-head">
                <img src={g.logo} alt="" className="sem-group-logo" />
                <span className="sem-group-title">{g.title}</span>
                <span className={`sem-group-count ${done === keys.length ? 'is-done' : ''}`}>
                  {done}/{keys.length}
                </span>
              </div>
              <ol className="sem-line">
                {g.rows.map((r) => {
                  const status = weekStatus(r, today);
                  const isCurrent = status === 'current' && !currentAssigned && r.type === 'chapter';
                  if (isCurrent) currentAssigned = true;
                  if (r.type === 'exam') {
                    return (
                      <li key={`exam-${r.label}`} className={`sem-row sem-row-milestone sem-row-${status}`}>
                        <span className="sem-row-date" />
                        <span className="sem-row-dot" aria-hidden="true" />
                        <span className="sem-exam">📝 {r.label}</span>
                      </li>
                    );
                  }
                  if (r.type === 'break') {
                    return (
                      <li key="break" className={`sem-row sem-row-milestone sem-row-${status}`}>
                        <span className="sem-row-date">{shortDate(r.start)}</span>
                        <span className="sem-row-dot" aria-hidden="true" />
                        <span className="sem-break">🌴 Vacances · révisions libres</span>
                      </li>
                    );
                  }
                  return (
                    <li
                      key={r.key}
                      ref={isCurrent ? currentRef : undefined}
                      className={`sem-row sem-row-${status} ${isCurrent ? 'sem-row-now' : ''}`}
                    >
                      <span className="sem-row-date">
                        {isCurrent ? <span className="sem-now-tag">Cette semaine</span> : r.sameDate ? '' : shortDate(r.start)}
                      </span>
                      <span className="sem-row-dot" aria-hidden="true" />
                      <ChapterCard
                        chapterKey={r.key}
                        stats={stats[r.key]}
                        unlock={unlocks[r.key]}
                        showUnlockHint={r.key === firstLocked && Boolean(unlocks[r.key]?.prevKey)}
                      />
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}

        {SEMESTER.sideQuests.map((s) => {
          const t = themes.find((th) => th.id === s.id);
          return (
            <div key={s.id} className="sem-group sem-group-side">
              <div className="sem-group-head">
                <img src={t?.logo || `/theme-logos/${s.id}.png`} alt="" className="sem-group-logo" />
                <span className="sem-group-title">{s.title}</span>
                <span className="sem-group-free">Bonus · libre</span>
              </div>
              <div className="sem-side-cards">
                {s.chapters.map((key) => (
                  <ChapterCard key={key} chapterKey={key} stats={stats[key]} unlock={null} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
