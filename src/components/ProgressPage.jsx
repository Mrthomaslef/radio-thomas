import { useEffect, useMemo, useState } from 'react';
import { themes } from '../data/themes.js';
import { useQuestions } from '../data/useQuestions.js';
import {
  MAX_DAILY_STEPS,
  readName,
  saveName,
  readAllProgress,
  readDailyState,
  readQuizHistory,
  readBookmarks,
  toggleQuestionBookmark,
  clearChapterProgress,
  subscribePlayer,
  syncProgressFromServer,
} from '../data/player.js';
import {
  LOOPS_PER_THEME,
  STEP_SCHEDULE,
  THEME_RANGES,
  getStepScheduleInfo,
  getThemeProgressionInfo,
} from './DailyPathPage.jsx';
import Icon from './Icons.jsx';

const WEEKDAY_SHORT_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_SHORT_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function formatLocalDayIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const CHAPTER_COURSE_MAP = (() => {
  const map = {
    'quiz-aleatoire': 'Quiz aléatoire (Mixte)',
    aleatoire: 'Quiz aléatoire (Mixte)',
  };
  for (const t of themes) {
    for (const c of t.chapters) {
      map[c.id] = `${t.title} — ${c.title}`;
    }
  }
  return map;
})();

const formatHistoryDate = (iso) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
};

const isPerfect = (q, picked) => {
  if (!Array.isArray(picked)) return false;
  const good = q.items.filter((i) => i.correct).map((i) => i.id).sort().join();
  return good === [...picked].sort().join();
};

export default function ProgressPage() {
  const { byChapter, loading } = useQuestions();
  const [pseudo, setPseudo] = useState(readName);
  const [draft, setDraft] = useState(pseudo);
  const [editing, setEditing] = useState(!pseudo);
  const [progress, setProgress] = useState(() => readAllProgress(readName()));
  const [dailyState, setDailyState] = useState(() => readDailyState(readName()));
  const [bookmarks, setBookmarks] = useState(() => readBookmarks(readName()));
  const [modeTab, setModeTab] = useState('daily'); // 'daily' | 'chapters'
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [openThemes, setOpenThemes] = useState({});

  const toggleTheme = (themeId) => {
    setOpenThemes((prev) => ({ ...prev, [themeId]: !prev[themeId] }));
  };

  useEffect(() => {
    const refresh = () => {
      const n = readName();
      setPseudo(n);
      setProgress(readAllProgress(n));
      setDailyState(readDailyState(n));
      setBookmarks(readBookmarks(n));
    };
    if (readName()) syncProgressFromServer(readName());
    return subscribePlayer(refresh);
  }, []);

  const submitPseudo = (e) => {
    e.preventDefault();
    const clean = draft.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    saveName(clean);
    setPseudo(clean);
    setProgress(readAllProgress(clean));
    setDailyState(readDailyState(clean));
    setBookmarks(readBookmarks(clean));
    setEditing(false);
  };

  const resetChapter = (chapterId, title) => {
    if (!window.confirm(`Réinitialiser vos réponses pour le chapitre « ${title} » ?`)) return;
    clearChapterProgress(chapterId, pseudo);
    setProgress(readAllProgress(pseudo));
  };

  // Compute global statistics across all chapters that have questions
  const allChapters = themes.flatMap((t) => t.chapters);
  let totalQuestions = 0;
  let totalAnswered = 0;
  let totalCorrect = 0;
  let completedChapters = 0;
  let activeChapters = 0;

  for (const ch of allChapters) {
    const qs = byChapter[ch.id] || [];
    if (qs.length === 0) continue;
    activeChapters += 1;
    totalQuestions += qs.length;
    const ans = progress[ch.id]?.answers || {};
    const answered = qs.filter((q) => ans[q.id]);
    const correct = answered.filter((q) => isPerfect(q, ans[q.id]));
    totalAnswered += answered.length;
    totalCorrect += correct.length;
    if (answered.length === qs.length) completedChapters += 1;
  }

  const history = readQuizHistory(pseudo, byChapter);

  const rollingDays = useMemo(() => {
    const activeSet = new Set(dailyState.activeDays || []);
    const starsByDay = dailyState.starsByDay || {};
    const days = [];
    const base = new Date();
    base.setHours(12, 0, 0, 0);
    for (let offset = -6; offset <= 0; offset++) {
      const d = new Date(base);
      d.setDate(base.getDate() + offset);
      const iso = formatLocalDayIso(d);
      const stars = starsByDay[iso] || 0;
      const isStreak = activeSet.has(iso) || stars > 0;
      days.push({
        iso,
        dayName: offset === 0 ? 'Auj.' : WEEKDAY_SHORT_FR[d.getDay()],
        dayNum: d.getDate(),
        monthShort: MONTH_SHORT_FR[d.getMonth()],
        isToday: offset === 0,
        isStreak,
        stars,
      });
    }
    return days;
  }, [dailyState.activeDays, dailyState.starsByDay]);

  const todayIso = rollingDays[rollingDays.length - 1]?.iso || formatLocalDayIso(new Date());
  const starsToday = dailyState.starsByDay?.[todayIso] || 0;
  const stepsToday = Math.min(dailyState.todayStepsCount || 0, MAX_DAILY_STEPS);
  const completedStepsTotal = Object.values(dailyState.steps || {}).filter((s) => s > 0).length;
  const themeProg = useMemo(() => getThemeProgressionInfo(dailyState), [dailyState]);

  const bookmarkedList = [];
  for (const t of themes) {
    for (const c of t.chapters) {
      const qs = byChapter[c.id] || [];
      qs.forEach((q, idx) => {
        if (bookmarks[q.id]) {
          bookmarkedList.push({
            id: q.id,
            chapterId: c.id,
            chapterTitle: c.title,
            themeTitle: t.title,
            number: idx + 1,
            enonce: q.enonce,
            type: q.type,
          });
        }
      });
    }
  }

  return (
    <section className="prog">
      <header className="prog-head">
        <div className="cq-top-links">
          <a href="#/" className="cq-back">← Accueil</a>
        </div>
        <h1>Ma <span className="grad">progression</span></h1>

        {editing ? (
          <form className="home-panel name-step prog-name-form" onSubmit={submitPseudo}>
            <label htmlFor="prog-pseudo">Entre ton pseudo pour retrouver ta session</label>
            <input
              id="prog-pseudo"
              className="name-input"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ton pseudo"
              maxLength={80}
              autoComplete="nickname"
              autoFocus
              required
            />
            <button className="btn btn-small" type="submit" disabled={!draft.trim()}>
              Charger ma session <Icon name="arrow" size={16} />
            </button>
          </form>
        ) : (
          <div className="home-hello">
            <span>Session de <strong>{pseudo}</strong></span>
            <button
              type="button"
              className="pseudo-change-btn"
              onClick={() => { setDraft(pseudo); setEditing(true); }}
            >
              Changer de pseudo
            </button>
          </div>
        )}
      </header>

      {!editing && (
        <>
          <div className="cq-chips admin-tabs prog-mode-tabs" role="tablist" aria-label="Mode de progression">
            <button
              type="button"
              role="tab"
              aria-selected={modeTab === 'daily'}
              className={modeTab === 'daily' ? 'on' : ''}
              onClick={() => setModeTab('daily')}
            >
              🔥 Chemin Daily
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={modeTab === 'chapters'}
              className={modeTab === 'chapters' ? 'on' : ''}
              onClick={() => setModeTab('chapters')}
            >
              📚 Chapitres &amp; Favoris
            </button>
          </div>

          {modeTab === 'daily' ? (
            <div className="prog-daily-view">
              {/* Top KPI Summary Cards for Daily Mode */}
              <div className="admin-summary prog-summary prog-daily-summary">
                <div className="admin-stat prog-daily-stat">
                  <span className="prog-daily-stat-kicker">Série actuelle</span>
                  <strong>
                    🔥 {dailyState.streak} jour{dailyState.streak > 1 ? 's' : ''}
                  </strong>
                  <span>1 étape / jour maintient la série</span>
                </div>
                <div className="admin-stat prog-daily-stat is-highlight">
                  <span className="prog-daily-stat-kicker">Étoiles ce jour</span>
                  <strong>
                    ★ {starsToday} <small>/ {MAX_DAILY_STEPS * 3}</small>
                  </strong>
                  <span>
                    {stepsToday}/{MAX_DAILY_STEPS} étape{stepsToday > 1 ? 's' : ''} validée{stepsToday > 1 ? 's' : ''} aujourd’hui
                  </span>
                </div>
                <div className="admin-stat prog-daily-stat">
                  <span className="prog-daily-stat-kicker">Total sur le chemin</span>
                  <strong>★ {dailyState.totalStars}</strong>
                  <span>
                    {completedStepsTotal} étape{completedStepsTotal > 1 ? 's' : ''} terminée{completedStepsTotal > 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* 7-day Rolling Streak & Daily Stars Timeline */}
              <div className="cq-card prog-streak-card">
                <div className="prog-streak-head">
                  <div>
                    <span className="daily-goal-kicker">7 derniers jours glissants</span>
                    <h2>Frise de série &amp; étoiles du jour</h2>
                  </div>
                  <span className={`prog-today-pill ${stepsToday > 0 ? 'is-done' : ''}`}>
                    {stepsToday > 0 ? `✓ Série validée aujourd’hui (+${starsToday}★)` : '⏳ Série du jour à valider'}
                  </span>
                </div>

                <div className="prog-streak-strip" role="list" aria-label="Activité sur les 7 derniers jours">
                  {rollingDays.map((d) => (
                    <div
                      key={d.iso}
                      role="listitem"
                      className={`prog-streak-day ${d.isStreak ? 'is-streak' : ''} ${d.isToday ? 'is-today' : ''}`}
                      title={`${d.dayName} ${d.dayNum} ${d.monthShort} : ${
                        d.isStreak ? `${d.stars} étoile${d.stars > 1 ? 's' : ''} gagnée${d.stars > 1 ? 's' : ''}` : 'Aucune étape validée'
                      }`}
                    >
                      <span className="prog-streak-day-name">{d.dayName}</span>
                      <div className="prog-streak-day-circle">
                        {d.isStreak ? (
                          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                              fill="currentColor"
                              d="M12 2c1.8 3.2 5 5.6 5 10.2A5.5 5.5 0 0 1 11.5 18c2.2-1.2 2.4-3.8 1-5.5-1.2 1.4-2.5 2.4-2.5 4.3A4.2 4.2 0 0 1 6.5 12C6.5 8.2 9.8 5.2 12 2Z"
                            />
                          </svg>
                        ) : (
                          <span className="prog-streak-day-num">{d.dayNum}</span>
                        )}
                      </div>
                      <span className="prog-streak-day-date">
                        {d.dayNum} {d.monthShort}
                      </span>
                      <span className={`prog-streak-day-stars ${d.stars > 0 ? 'has-stars' : ''}`}>
                        {d.stars > 0 ? `★ ${d.stars}` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Current Category & Step on the Daily Path */}
              <div className="cq-card prog-daily-cat-card">
                <div className="daily-cal-theme-current">
                  <img
                    src={`/theme-logos/${themeProg.currentTheme.id}.png`}
                    alt=""
                    aria-hidden="true"
                    className="daily-cal-theme-logo"
                    draggable="false"
                  />
                  <div className="daily-cal-theme-body">
                    <div className="daily-cal-theme-top">
                      <div>
                        <span className="daily-cal-theme-kicker">Catégorie en cours sur le chemin</span>
                        <strong className="daily-cal-theme-title">{themeProg.currentTheme.title}</strong>
                      </div>
                      <span className="daily-cal-theme-badge">
                        {themeProg.completedSteps}/{themeProg.totalSteps} étapes · {themeProg.percent}%
                      </span>
                    </div>
                    <div className="daily-cal-theme-bar" aria-hidden="true">
                      <div style={{ width: `${themeProg.percent}%` }} />
                    </div>
                    <span className="daily-cal-theme-chap">
                      Étape actuelle #{dailyState.currentStep} : {themeProg.chapterTitle} (Boucle {themeProg.loopIndex}/{LOOPS_PER_THEME})
                    </span>
                  </div>
                </div>

                <div className="prog-daily-cat-footer">
                  <div className="daily-cal-theme-next" style={{ borderTop: 'none', paddingTop: 0 }}>
                    <span className="daily-cal-theme-next-label">Prochaine catégorie :</span>
                    <span className="daily-cal-theme-next-pill">
                      <img
                        src={`/theme-logos/${themeProg.nextTheme.id}.png`}
                        alt=""
                        aria-hidden="true"
                        className="daily-cal-theme-next-logo"
                        draggable="false"
                      />
                      <b>{themeProg.nextTheme.title}</b>
                    </span>
                  </div>
                  <a href="#/" className="btn btn-small">
                    Continuer sur le chemin <Icon name="arrow" size={15} />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="admin-summary prog-summary">
                <div className="admin-stat">
                  <strong>{totalAnswered} / {totalQuestions}</strong>
                  <span>questions répondues</span>
                </div>
                <div className="admin-stat">
                  <strong>{totalCorrect} / {totalAnswered || 0}</strong>
                  <span>bonnes réponses ({totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0} %)</span>
                </div>
                <div className="admin-stat">
                  <strong>{completedChapters} / {activeChapters}</strong>
                  <span>chapitres terminés</span>
                </div>
              </div>

          <div className="theme prog-collapse">
            <button
              type="button"
              className={`theme-head prog-collapse-btn ${historyOpen ? 'on' : ''}`}
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
            >
              <span>Historique des quiz réalisés</span>
              <span className="prog-collapse-meta">
                <span className="theme-count">
                  {history.length} {history.length > 1 ? 'quiz terminés' : 'quiz terminé'}
                </span>
                <span className={`prog-chevron ${historyOpen ? 'open' : ''}`} aria-hidden="true">▾</span>
              </span>
            </button>

            {historyOpen && (
              <div className="prog-collapse-body">
                {history.length === 0 ? (
                  <p className="prog-empty">Aucun quiz terminé pour le moment.</p>
                ) : (
                  <div className="admin-table-wrap table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Cours</th>
                          <th>Score</th>
                          <th>Résultat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((h) => (
                          <tr key={h.id}>
                            <td>{formatHistoryDate(h.created_at)}</td>
                            <td className="prog-history-course">{CHAPTER_COURSE_MAP[h.quiz] || h.quiz}</td>
                            <td>{h.score} / {h.total}</td>
                            <td>
                              <span className={`admin-badge ${h.passed ? 'admin-badge-pass' : 'admin-badge-fail'}`}>
                                {h.passed ? 'Réussi' : 'À revoir'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="theme prog-collapse">
            <button
              type="button"
              className={`theme-head prog-collapse-btn ${bookmarksOpen ? 'on' : ''}`}
              onClick={() => setBookmarksOpen((v) => !v)}
              aria-expanded={bookmarksOpen}
            >
              <span>Questions enregistrées (favoris)</span>
              <span className="prog-collapse-meta">
                <span className="theme-count">
                  {bookmarkedList.length}{' '}
                  {bookmarkedList.length > 1 ? 'questions enregistrées' : 'question enregistrée'}
                </span>
                <span className={`prog-chevron ${bookmarksOpen ? 'open' : ''}`} aria-hidden="true">▾</span>
              </span>
            </button>

            {bookmarksOpen && (
              <div className="prog-collapse-body">
                {bookmarkedList.length === 0 ? (
                  <p className="prog-empty">
                    Aucune question enregistrée pour le moment. Après avoir validé une réponse dans un quiz, cliquez sur le bouton « Enregistrer » pour la retrouver ici.
                  </p>
                ) : (
                  <div className="prog-bookmarks-list">
                    {bookmarkedList.map((b) => (
                      <article key={b.id} className="cq-card prog-bookmark-card">
                        <div className="prog-bookmark-top">
                          <span className="prog-ch-num">
                            {b.themeTitle} — {b.chapterTitle} · Question {b.number}
                          </span>
                          <button
                            type="button"
                            className="prog-reset-btn"
                            onClick={() => {
                              toggleQuestionBookmark(b.id, pseudo);
                              setBookmarks(readBookmarks(pseudo));
                            }}
                          >
                            Retirer
                          </button>
                        </div>
                        <p className="prog-bookmark-enonce">{b.enonce}</p>
                        <div className="prog-bookmark-actions">
                          <a href={`#/quiz/${b.chapterId}?q=${b.number}`} className="btn btn-small">
                            Revoir la question <Icon name="arrow" size={15} />
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="prog-legend">
            <span><i className="cq-dot pending">1</i> Non validée</span>
            <span><i className="cq-dot ok">1</i> Bonne réponse</span>
            <span><i className="cq-dot ko">1</i> Erreur</span>
            <span className="prog-legend-hint">Cliquez sur une catégorie pour l’ouvrir, puis sur un numéro pour accéder à la question.</span>
          </div>

          {loading ? (
            <p className="cq-loading">Chargement de la progression…</p>
          ) : (
            <div className="prog-themes">
              {themes.map((t) => {
                const isOpen = Boolean(openThemes[t.id]);
                let themeTotalQ = 0;
                let themeAnsweredQ = 0;
                for (const c of t.chapters) {
                  const qs = byChapter[c.id] || [];
                  const ans = progress[c.id]?.answers || {};
                  themeTotalQ += qs.length;
                  themeAnsweredQ += qs.filter((q) => ans[q.id]).length;
                }
                const themePassed =
                  t.chapters.length > 0 &&
                  t.chapters.every((c) => {
                    const qs = byChapter[c.id] || [];
                    if (qs.length === 0) return false;
                    const ans = progress[c.id]?.answers || {};
                    const answered = qs.filter((q) => ans[q.id]);
                    if (answered.length !== qs.length) return false;
                    const correct = answered.filter((q) => isPerfect(q, ans[q.id])).length;
                    return correct / qs.length >= 0.6;
                  });

                return (
                  <div key={t.id} className={`theme prog-collapse ${themePassed ? 'theme-passed' : ''}`}>
                    <button
                      type="button"
                      className={`theme-head prog-collapse-btn ${isOpen ? 'on' : ''}`}
                      onClick={() => toggleTheme(t.id)}
                      aria-expanded={isOpen}
                    >
                      <span>{t.title}</span>
                      <span className="prog-collapse-meta">
                        <span className="theme-count">
                          {themeTotalQ > 0 ? `${themeAnsweredQ}/${themeTotalQ} · ` : ''}
                          {t.chapters.length} chapitres
                        </span>
                        <span className={`prog-chevron ${isOpen ? 'open' : ''}`} aria-hidden="true">▾</span>
                      </span>
                    </button>

                    {isOpen && (
                      <div className="prog-collapse-body prog-chapters">
                        {t.chapters.map((c, idx) => {
                          const qs = byChapter[c.id] || [];
                          const ans = progress[c.id]?.answers || {};
                          const answered = qs.filter((q) => ans[q.id]);
                          const correct = answered.filter((q) => isPerfect(q, ans[q.id])).length;
                          const pct = qs.length ? (answered.length / qs.length) * 100 : 0;
                          const isCompleted = qs.length > 0 && answered.length === qs.length;
                          const passed = isCompleted && correct / qs.length >= 0.6;
                          const cardStatus = isCompleted
                            ? passed
                              ? 'prog-card-passed'
                              : 'prog-card-failed'
                            : '';

                          return (
                            <article key={c.id} className={`cq-card prog-card ${cardStatus}`}>
                              <div className="prog-card-head">
                                <div className="prog-card-title-wrap">
                                  <span className="prog-ch-num">Chapitre {idx + 1}</span>
                                  <h3>{c.title}</h3>
                                </div>
                                <div className="prog-card-actions">
                                  {answered.length > 0 && (
                                    <button
                                      type="button"
                                      className="prog-reset-btn"
                                      onClick={() => resetChapter(c.id, c.title)}
                                    >
                                      Réinitialiser
                                    </button>
                                  )}
                                  <a href={`#/quiz/${c.id}`} className="btn btn-small">
                                    {qs.length === 0
                                      ? 'Voir'
                                      : answered.length === 0
                                      ? 'Commencer'
                                      : answered.length < qs.length
                                      ? 'Continuer'
                                      : 'Revoir'} <Icon name="arrow" size={15} />
                                  </a>
                                </div>
                              </div>

                              {qs.length === 0 ? (
                                <p className="prog-empty">Aucune question dans ce chapitre pour le moment.</p>
                              ) : (
                                <>
                                  <div className="cq-stats">
                                    <span>Score <b>{correct}</b> / {answered.length || 0}</span>
                                    <span>{answered.length} / {qs.length} questions</span>
                                  </div>
                                  <div className="cq-bar"><div style={{ width: `${pct}%` }} /></div>
                                  <div className="cq-dots">
                                    {qs.map((q, i) => {
                                      const a = ans[q.id];
                                      const cls = !a ? 'pending' : isPerfect(q, a) ? 'ok' : 'ko';
                                      const label = !a ? 'non validée' : isPerfect(q, a) ? 'bonne réponse' : 'erreur';
                                      return (
                                        <a
                                          key={q.id}
                                          href={`#/quiz/${c.id}?q=${i + 1}`}
                                          className={`cq-dot ${cls}`}
                                          aria-label={`${c.title} — Question ${i + 1} (${label})`}
                                          title={`Question ${i + 1} (${label})`}
                                        >
                                          {i + 1}
                                        </a>
                                      );
                                    })}
                                  </div>
                                </>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
            </>
          )}
        </>
      )}
    </section>
  );
}
