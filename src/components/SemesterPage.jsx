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
      map[c.id] = { title: c.title, themeTitle: t.title, logo: t.logo || `/theme-logos/${t.id}.png` };
    }
  }
  return map;
})();

const STATUS_LABEL = { current: 'Cette semaine', past: 'Terminée', upcoming: 'À venir' };

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

function ChapterTile({ chapterKey, stats, unlock, continued }) {
  const info = CHAPTER_INFO[chapterKey] || { title: chapterKey, themeTitle: '' };
  const prevTitle = unlock?.prevKey ? CHAPTER_INFO[unlock.prevKey]?.title : null;

  if (unlock && !unlock.unlocked) {
    return (
      <div className="chapter sem-chapter sem-locked" aria-disabled="true">
        <span className="sem-lock" aria-hidden="true">🔒</span>
        <span className="sem-chapter-text">
          <span className="chapter-title">{info.title}</span>
          <span className="sem-chapter-hint">
            Ouvre le {formatOpenDate(unlock.opensOn)}
            {prevTitle ? <> · ou dès que tu termines « {prevTitle} »</> : null}
          </span>
        </span>
      </div>
    );
  }

  const statusClass = stats.completed ? (stats.passed ? 'chapter-passed' : 'chapter-failed') : '';
  return (
    <a href={`#/quiz/${chapterKey}?from=semestre`} className={`chapter sem-chapter ${statusClass}`}>
      <span className="sem-lock" aria-hidden="true">{stats.completed ? '✅' : unlock?.early ? '⚡' : '📖'}</span>
      <span className="sem-chapter-text">
        <span className="chapter-title">
          {info.title}
          {continued ? ' (suite)' : ''}
        </span>
        <span className="sem-chapter-hint">
          {info.themeTitle}
          {unlock?.early ? ' · débloqué en avance' : ''}
        </span>
      </span>
      <span className="chapter-go">
        {stats.completed ? `${stats.score}/${stats.total}` : `${stats.done}/${stats.total || '…'}`}{' '}
        <Icon name="arrow" size={16} />
      </span>
    </a>
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

  // Bring the current week into view (after the router's own scroll-to-top).
  useEffect(() => {
    const t = setTimeout(() => {
      if (currentRef.current && currentRef.current.dataset.index > 1) {
        currentRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const currentWeek = SEMESTER.weeks.find((w) => weekStatus(w, today) === 'current');
  const before = today < SEMESTER.weeks[0].start;
  const after = today > SEMESTER.weeks[SEMESTER.weeks.length - 1].end;
  const seenChapters = new Set();

  return (
    <section className="home sem-page" aria-label={SEMESTER.title}>
      <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
        Parcours <span className="grad">semestre</span>
      </motion.h1>

      <div className="home-panel">
        <div className="sem-summary">
          <p className="sem-kicker">Cochin – HEGP · Hiver 2026–2027</p>
          <p className="sem-now">
            {currentWeek ? (
              <>
                <strong>{currentWeek.label}</strong> : {currentWeek.topics.join(' · ')}
              </>
            ) : before ? (
              'Le parcours commence le lundi 2 novembre 2026.'
            ) : after ? (
              'Le semestre est terminé : tous les chapitres restent ouverts pour réviser.'
            ) : null}
          </p>
          <div className="sem-progress" aria-label={`${completedCount} chapitres terminés sur ${SEMESTER_PATH.length}`}>
            <div className="sem-progress-bar">
              <span style={{ width: `${Math.round((completedCount / SEMESTER_PATH.length) * 100)}%` }} />
            </div>
            <span className="sem-progress-label">
              {completedCount}/{SEMESTER_PATH.length} chapitres terminés
            </span>
          </div>
          <ul className="sem-rules">
            <li>📅 Chaque chapitre s’ouvre le lundi de sa semaine de révision.</li>
            <li>⚡ Tu as terminé un chapitre ? Le suivant s’ouvre tout de suite.</li>
            <li>🔒 Les autres restent fermés jusqu’à leur semaine.</li>
          </ul>
          {!pseudo && (
            <p className="sem-pseudo-hint">
              Choisis un pseudo (onglet <a href="#/chapitres">Quiz</a>) pour enregistrer ta progression et débloquer
              les chapitres en avance.
            </p>
          )}
        </div>

        <ol className="sem-weeks">
          {SEMESTER.weeks.map((w, i) => {
            const status = weekStatus(w, today);
            const isCurrent = status === 'current';
            return (
              <li
                key={w.start}
                ref={isCurrent ? currentRef : undefined}
                data-index={i}
                className={`sem-week sem-week-${status} ${w.break ? 'sem-week-break' : ''}`}
              >
                <div className="sem-week-head">
                  <span className="sem-week-label">{w.label}</span>
                  <span className={`sem-pill sem-pill-${status}`}>{STATUS_LABEL[status]}</span>
                </div>
                <ul className="sem-topics">
                  {w.topics.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                {w.chapters.length > 0 && (
                  <div className="sem-chapters">
                    {w.chapters.map((key) => {
                      const continued = seenChapters.has(key);
                      seenChapters.add(key);
                      return (
                        <ChapterTile
                          key={key}
                          chapterKey={key}
                          stats={stats[key]}
                          unlock={unlocks[key]}
                          continued={continued}
                        />
                      );
                    })}
                  </div>
                )}
                {w.exam && (
                  <p className="sem-exam">
                    <span aria-hidden="true">📝</span> {w.exam}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        {SEMESTER.sideQuests.map((s) => (
          <div key={s.id} className="sem-week sem-side">
            <div className="sem-week-head">
              <span className="sem-week-label">Quête annexe : {s.title}</span>
              <span className="sem-pill sem-pill-side">Libre</span>
            </div>
            <p className="sem-side-note">{s.note}</p>
            <div className="sem-chapters">
              {s.chapters.map((key) => (
                <ChapterTile key={key} chapterKey={key} stats={stats[key]} unlock={null} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
