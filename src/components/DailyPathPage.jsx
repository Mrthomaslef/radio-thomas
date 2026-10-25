import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { themes } from '../data/themes.js';
import { CHAPTERS, useQuestions, resolveDifficulty } from '../data/useQuestions.js';
import {
  MAX_DAILY_STEPS,
  QUESTIONS_PER_STEP,
  readName,
  saveName,
  readAllProgress,
  readDailyState,
  readDailyStepSession,
  saveDailyStepSession,
  clearDailyStepAnswers,
  markDailyOnboarded,
  recordDailyQuestionAnswered,
  recordDailyStepCompleted,
  subscribePlayer,
  syncProgressFromServer,
} from '../data/player.js';
import { QuizPlayer } from './ChapterQuiz.jsx';
import Icon from './Icons.jsx';

const ONBOARDING_SLIDES = [
  {
    step: '1 / 3',
    badge: 'Rythme quotidien & Série',
    title: 'Ton parcours en 3 étapes par jour',
    lead: 'Avance chaque jour sur le chemin à ton rythme tout en construisant ta série quotidienne.',
    points: [
      {
        icon: '🎯',
        title: '3 questions par étape',
        desc: '2 questions ciblées suivies d’une question Boss finale sur le chapitre de l’étape.',
      },
      {
        icon: '🔥',
        title: 'Jusqu’à 3 étapes par jour',
        desc: 'Valider 1 seule étape dans la journée suffit pour maintenir ta série (streak) !',
      },
      {
        icon: '⭐',
        title: '1 à 3 étoiles par étape',
        desc: '1★ en terminant l’étape · 2★ dès > 60 % de réussite · 3★ dès > 90 %.',
      },
    ],
    highlight: '📚 Envie de continuer après tes 3 étapes du jour ? L’espace « Quiz » reste accessible en illimité !',
    icon: 'daily',
  },
  {
    step: '2 / 3',
    badge: 'Cycles & Difficulté évolutive',
    title: '3 boucles progressives par catégorie',
    lead: 'Chaque catégorie anatomique est approfondie en 3 cycles avant de passer à la suivante.',
    points: [
      {
        icon: '🔄',
        title: '1 chapitre par étape, 3 boucles par catégorie',
        desc: 'Tu parcours tous les chapitres d’une catégorie (ex. L’épaule) 3 fois avant d’ouvrir la suivante (Le coude).',
      },
      {
        icon: '📈',
        title: 'Difficulté croissante à chaque boucle',
        desc: 'Questions simples au 1er tour, puis la part de questions intermédiaires et difficiles augmente aux boucles 2 et 3.',
      },
      {
        icon: '🧭',
        title: 'Suivi en direct en haut de l’écran',
        desc: 'Visualise à tout moment ta catégorie actuelle, ton avancement et la prochaine catégorie.',
      },
    ],
    highlight: '💡 Aucune question ne se répète d’une boucle à l’autre sur un même chapitre.',
    icon: 'cycles',
  },
  {
    step: '3 / 3',
    badge: 'Livre & Multi-appareils',
    title: 'Corrections sourcées & Synchronisation',
    lead: 'Révise efficacement avec les références officielles et retrouve ta progression partout.',
    points: [
      {
        icon: '📖',
        title: 'Référence exacte du livre sous chaque question',
        desc: 'Explication détaillée, figures d’imagerie commentées et numéro de page exact pour réviser dans le bouquin.',
      },
      {
        icon: '🔖',
        title: 'Questions enregistrées',
        desc: 'Mets de côté les questions clés en un clic pour les retrouver dans « Ma progression ».',
      },
      {
        icon: '☁️',
        title: 'Synchronisé sur tous tes appareils',
        desc: 'Avec ton pseudo, tes étapes, tes étoiles et ton calendrier te suivent sur téléphone, tablette et ordinateur.',
      },
    ],
    highlight: '📅 Astuce : touche ta série en haut à gauche pour ouvrir ton calendrier et voir tes étoiles gagnées par jour.',
    icon: 'sync',
  },
];

function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededShuffle(list, seedStr) {
  const arr = [...list];
  let seed = hashSeed(seedStr || 'quiz-cochin');
  const nextRand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const LOOPS_PER_THEME = 3;

const STEP_SCHEDULE = (() => {
  const list = [];
  for (const theme of themes) {
    for (let loopIndex = 1; loopIndex <= LOOPS_PER_THEME; loopIndex++) {
      for (const ch of theme.chapters) {
        list.push({
          themeId: theme.id,
          themeTitle: theme.title,
          chapterKey: ch.id,
          chapterTitle: ch.title,
          loopIndex,
        });
      }
    }
  }
  return list;
})();

const THEME_RANGES = (() => {
  const ranges = [];
  let cursor = 1;
  for (let i = 0; i < themes.length; i++) {
    const t = themes[i];
    const nextT = themes[(i + 1) % themes.length];
    const totalSteps = t.chapters.length * LOOPS_PER_THEME;
    ranges.push({
      theme: t,
      nextTheme: nextT,
      startStep: cursor,
      endStep: cursor + totalSteps - 1,
      totalSteps,
      nextTotalSteps: nextT.chapters.length * LOOPS_PER_THEME,
    });
    cursor += totalSteps;
  }
  return ranges;
})();

function getStepScheduleInfo(stepNumber) {
  if (STEP_SCHEDULE.length === 0) {
    return {
      themeId: 'epaule',
      themeTitle: 'L’épaule',
      chapterKey: 'ch1',
      chapterTitle: 'Pathologies de la coiffe',
      loopIndex: 1,
    };
  }
  const idx = Math.max(0, Math.floor(Number(stepNumber) || 1) - 1) % STEP_SCHEDULE.length;
  return STEP_SCHEDULE[idx];
}

function getThemeProgressionInfo(dailyState) {
  const currentStep = Math.max(1, Number(dailyState?.currentStep) || 1);
  const stepsMap = dailyState?.steps || {};
  const cycleLen = Math.max(1, STEP_SCHEDULE.length);
  const cycleOffset = Math.floor((currentStep - 1) / cycleLen) * cycleLen;
  const stepInCycle = ((currentStep - 1) % cycleLen) + 1;

  const range =
    THEME_RANGES.find((r) => stepInCycle >= r.startStep && stepInCycle <= r.endStep) ||
    THEME_RANGES[0];

  const absStart = cycleOffset + range.startStep;
  const absEnd = cycleOffset + range.endStep;
  let completedSteps = 0;
  for (let s = absStart; s <= absEnd; s++) {
    if (stepsMap[s] > 0) completedSteps += 1;
  }

  const totalSteps = Math.max(1, range.totalSteps);
  const percent = Math.min(100, Math.round((completedSteps / totalSteps) * 100));
  const stepInfo = getStepScheduleInfo(currentStep);

  return {
    currentTheme: range.theme,
    nextTheme: range.nextTheme,
    completedSteps,
    totalSteps,
    nextTotalSteps: range.nextTotalSteps,
    percent,
    chapterTitle: stepInfo.chapterTitle,
    loopIndex: stepInfo.loopIndex,
  };
}

function buildFlatQuestionMap(byChapter, allProgress) {
  const allChapters = themes.flatMap((t) => t.chapters.map((c) => c.id));
  const fullPool = [];
  const byId = new Map();

  for (const chKey of allChapters) {
    const qs = byChapter[chKey] || [];
    const meta = CHAPTERS[chKey]?.chapitre;
    for (const q of qs) {
      const diff = resolveDifficulty(q.id, q.difficulty);
      const ans = allProgress?.[chKey]?.answers?.[q.id];
      const isAnswered = Array.isArray(ans) && ans.length > 0;
      const enriched = {
        ...q,
        difficulty: diff,
        _chapterKey: chKey,
        _meta: meta,
        _unanswered: !isAnswered,
      };
      fullPool.push(enriched);
      byId.set(q.id, enriched);
    }
  }
  return { fullPool, byId };
}

function getSlotPrioritiesForLoop(loopIndex) {
  if (loopIndex === 1) {
    // Cycle 1: Simple questions at the start (Facile, Facile, Facile/Moyen)
    return [
      [1, 2, 3],
      [1, 2, 3],
      [2, 1, 3],
    ];
  }
  if (loopIndex === 2) {
    // Cycle 2: % of harder questions increases (Facile, Moyen, Difficile)
    return [
      [1, 2, 3],
      [2, 3, 1],
      [3, 2, 1],
    ];
  }
  // Cycle 3+: High % of harder questions (Moyen, Difficile, Difficile)
  return [
    [2, 3, 1],
    [3, 2, 1],
    [3, 2, 1],
  ];
}

function pickLoopQuestionsDeterministically(targetPool, count, pseudo, chapterKey, loopIndex, usedIds) {
  const seedBase = `${(pseudo || '').trim().toLowerCase()}:ch-${chapterKey}:loop-${loopIndex}`;
  const slotPriorities = getSlotPrioritiesForLoop(loopIndex);

  const pickFrom = (candidates, needed, tag) => {
    const filtered = candidates.filter((q) => !usedIds.has(q.id));
    const poolToUse = filtered.length >= needed ? filtered : candidates;
    return seededShuffle(poolToUse, `${seedBase}:${tag}`).slice(0, needed);
  };

  const pickOneWithPriority = (diffPriorityList, tag) => {
    for (const targetDiff of diffPriorityList) {
      const matching = targetPool.filter((q) => q.difficulty === targetDiff && !usedIds.has(q.id));
      if (matching.length > 0) {
        const picked = pickFrom(matching, 1, `${tag}:d${targetDiff}`);
        if (picked.length > 0) {
          usedIds.add(picked[0].id);
          return picked[0];
        }
      }
    }
    const fallback = pickFrom(targetPool, 1, `${tag}:any`);
    if (fallback.length > 0) {
      usedIds.add(fallback[0].id);
      return fallback[0];
    }
    return null;
  };

  const pickedQuestions = [];
  for (let sIdx = 0; sIdx < count; sIdx++) {
    const prio = slotPriorities[Math.min(sIdx, slotPriorities.length - 1)];
    const q = pickOneWithPriority(prio, `slot-${sIdx}`);
    if (q) pickedQuestions.push(q);
  }
  return pickedQuestions;
}

function resolveStepQuestionsAndAnswers(stepNumber, goalCount, pseudo, byChapter, allProgress) {
  const count = Math.max(1, Number(goalCount) || 3);
  const { fullPool, byId } = buildFlatQuestionMap(byChapter, allProgress);
  if (fullPool.length === 0) return { questions: [], answers: {}, stepInfo: getStepScheduleInfo(stepNumber) };

  const stepInfo = getStepScheduleInfo(stepNumber);
  const chapterPool = fullPool.filter((q) => q._chapterKey === stepInfo.chapterKey);
  const targetPool = chapterPool.length > 0 ? chapterPool : fullPool;

  const savedSession = readDailyStepSession(stepNumber, pseudo);
  // Restore saved session whenever its questionIds are already assigned for this step and match its chapter
  if (Array.isArray(savedSession.questionIds) && savedSession.questionIds.length > 0) {
    const restored = savedSession.questionIds
      .map((qid) => byId.get(qid))
      .filter(Boolean);
    const matchesChapter =
      restored.length === count &&
      restored.every((q) => q._chapterKey === stepInfo.chapterKey);
    if (matchesChapter) {
      const withBossFlag = restored.map((q, idx) => ({
        ...q,
        _isBoss: restored.length > 1 ? idx === restored.length - 1 : stepNumber % 4 === 0,
      }));
      return {
        questions: withBossFlag,
        answers: savedSession.answers || {},
        stepInfo,
      };
    }
  }

  // Deterministically select 3 questions from this step's single chapter across all devices
  const isBossStep = stepNumber % 4 === 0;
  const usedIds = new Set();

  // Exclude questions from previous loops of this same chapter (using saved or deterministic loop picks)
  for (let prev = 1; prev < stepNumber; prev++) {
    const prevInfo = getStepScheduleInfo(prev);
    if (prevInfo.chapterKey !== stepInfo.chapterKey) continue;
    const prevSaved = readDailyStepSession(prev, pseudo);
    if (Array.isArray(prevSaved.questionIds) && prevSaved.questionIds.length === count) {
      for (const qid of prevSaved.questionIds) {
        usedIds.add(qid);
      }
    } else {
      pickLoopQuestionsDeterministically(
        targetPool,
        count,
        pseudo,
        stepInfo.chapterKey,
        prevInfo.loopIndex,
        usedIds
      );
    }
  }

  const pickedQuestions = pickLoopQuestionsDeterministically(
    targetPool,
    count,
    pseudo,
    stepInfo.chapterKey,
    stepInfo.loopIndex,
    usedIds
  );

  const finalQuestions = pickedQuestions.map((q, idx) => ({
    ...q,
    _isBoss: pickedQuestions.length > 1 ? idx === pickedQuestions.length - 1 : isBossStep,
  }));
  const questionIds = finalQuestions.map((q) => q.id);
  saveDailyStepSession(stepNumber, { questionIds, answers: savedSession.answers || {} }, pseudo);

  return {
    questions: finalQuestions,
    answers: savedSession.answers || {},
    stepInfo,
  };
}

function LockIcon({ isBoss }) {
  const size = isBoss ? 32 : 28;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="daily-node-lock-svg"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2.5" fill="rgba(143, 166, 184, 0.12)" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      <circle cx="12" cy="16" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

const MONTH_NAMES_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];
const WEEKDAYS_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function StreakCalendarModal({ dailyState, onClose }) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0..11

  const activeSet = useMemo(() => new Set(dailyState.activeDays || []), [dailyState.activeDays]);
  const starsByDay = dailyState.starsByDay || {};
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const themeProg = useMemo(() => getThemeProgressionInfo(dailyState), [dailyState]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // Convert Sunday=0..Saturday=6 to Monday=0..Sunday=6
    const startOffset = (firstDay.getDay() + 6) % 7;
    const cells = [];
    for (let i = 0; i < startOffset; i++) {
      cells.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isStreak = activeSet.has(iso);
      const dayStars = starsByDay[iso] || 0;
      cells.push({
        day: d,
        iso,
        isToday: iso === todayIso,
        isStreak,
        stars: dayStars,
      });
    }
    return cells;
  }, [viewYear, viewMonth, activeSet, starsByDay, todayIso]);

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  return (
    <div
      className="daily-cal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Calendrier des jours de série"
      onClick={onClose}
    >
      <motion.div
        className="daily-cal-modal"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="daily-cal-head">
          <div>
            <span className="daily-goal-kicker">Série & avancement</span>
            <h3>Calendrier de streak</h3>
            <p className="daily-cal-sub">1 étape validée par jour suffit pour maintenir ta série</p>
          </div>
          <button
            type="button"
            className="daily-cal-close"
            onClick={onClose}
            aria-label="Fermer le calendrier"
          >
            ✕
          </button>
        </div>

        <div className="daily-cal-summary">
          <div className="daily-cal-stat">
            <span className="daily-cal-stat-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  fill="#38e1ff"
                  d="M12 2c1.8 3.2 5 5.6 5 10.2A5.5 5.5 0 0 1 11.5 18c2.2-1.2 2.4-3.8 1-5.5-1.2 1.4-2.5 2.4-2.5 4.3A4.2 4.2 0 0 1 6.5 12C6.5 8.2 9.8 5.2 12 2Z"
                />
              </svg>
            </span>
            <div>
              <strong>{dailyState.streak} jour{dailyState.streak > 1 ? 's' : ''}</strong>
              <span>Série en cours</span>
            </div>
          </div>

          <div className="daily-cal-stat">
            <span className="daily-cal-stat-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  fill="#38e1ff"
                  stroke="#05090f"
                  strokeWidth="1.2"
                  d="M12 2.2l2.95 5.98 6.6.96-4.77 4.65 1.12 6.57L12 17.26l-5.9 3.1 1.12-6.57-4.77-4.65 6.6-.96L12 2.2Z"
                />
              </svg>
            </span>
            <div>
              <strong>{dailyState.totalStars} ★</strong>
              <span>Étoiles gagnées</span>
            </div>
          </div>
        </div>

        {/* Current category progress + Next category to study */}
        <div className="daily-cal-theme-card">
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
                  <span className="daily-cal-theme-kicker">Catégorie en cours</span>
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
                {themeProg.chapterTitle} · Boucle {themeProg.loopIndex}/{LOOPS_PER_THEME}
              </span>
            </div>
          </div>

          <div className="daily-cal-theme-next">
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
        </div>

        {/* Clean Calendar Board */}
        <div className="daily-cal-board">
          <div className="daily-cal-nav">
            <button type="button" className="daily-cal-nav-btn" onClick={prevMonth} aria-label="Mois précédent">
              ‹
            </button>
            <strong className="daily-cal-month-label">
              {MONTH_NAMES_FR[viewMonth]} {viewYear}
            </strong>
            <button type="button" className="daily-cal-nav-btn" onClick={nextMonth} aria-label="Mois suivant">
              ›
            </button>
          </div>

          <div className="daily-cal-weekdays">
            {WEEKDAYS_FR.map((w) => (
              <span key={w} className="daily-cal-weekday">
                {w}
              </span>
            ))}
          </div>

          <div className="daily-cal-grid">
            {calendarCells.map((cell, idx) => {
              if (!cell) {
                return <div key={`empty-${idx}`} className="daily-cal-cell is-empty" />;
              }
              const showStarLogo = cell.isStreak || cell.stars > 0;
              const starValue = cell.stars > 0 ? cell.stars : dailyState.totalStars || 1;
              return (
                <div
                  key={cell.iso}
                  className={`daily-cal-cell ${cell.isStreak ? 'is-streak' : ''} ${cell.isToday ? 'is-today' : ''}`}
                  title={
                    cell.isStreak
                      ? `${cell.iso} · Série validée (${starValue} ★)`
                      : cell.iso
                  }
                >
                  {showStarLogo && (
                    <span className="daily-cal-star-badge" aria-hidden="true">
                      <svg width="11" height="11" viewBox="0 0 24 24">
                        <path
                          fill="#38e1ff"
                          d="M12 2.2l2.95 5.98 6.6.96-4.77 4.65 1.12 6.57L12 17.26l-5.9 3.1 1.12-6.57-4.77-4.65 6.6-.96L12 2.2Z"
                        />
                      </svg>
                      <b>{starValue}</b>
                    </span>
                  )}
                  <span className="daily-cal-day-num">{cell.day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default function DailyPathPage() {
  const { byChapter, loading } = useQuestions();
  const [pseudo, setPseudo] = useState(readName);
  const [draftPseudo, setDraftPseudo] = useState(pseudo);
  const [editingPseudo, setEditingPseudo] = useState(!pseudo);
  const [dailyState, setDailyState] = useState(() => readDailyState(readName()));
  const [allProgress, setAllProgress] = useState(() => readAllProgress(readName()));
  const [showingSlides, setShowingSlides] = useState(() => {
    const n = readName();
    if (!n) return false;
    const st = readDailyState(n);
    return Boolean(!st.onboarded && Object.keys(st.steps).length === 0);
  });
  const [slideIdx, setSlideIdx] = useState(0);
  const [syncingPseudo, setSyncingPseudo] = useState(false);
  const [showingCalendar, setShowingCalendar] = useState(false);
  const [activeSession, setActiveSession] = useState(null); // { stepNumber, isBossStep, questions, initialAnswers, id }
  const [limitNotice, setLimitNotice] = useState(false);
  const currentStepNodeRef = useRef(null);
  const touchStartXRef = useRef(null);
  const manualSlidesRef = useRef(false);

  useEffect(() => {
    const n = readName();
    if (n) syncProgressFromServer(n);
    return subscribePlayer(() => {
      const curr = readName();
      setPseudo(curr);
      setAllProgress(readAllProgress(curr));
      const nextDaily = readDailyState(curr);
      setDailyState(nextDaily);
      if (
        (nextDaily.onboarded || Object.keys(nextDaily.steps).length > 0) &&
        !manualSlidesRef.current
      ) {
        setShowingSlides(false);
      }
    });
  }, []);

  // Automatically scroll to the active step node when the path is displayed
  useEffect(() => {
    if (!editingPseudo && !showingSlides && !activeSession) {
      const t = setTimeout(() => {
        currentStepNodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [editingPseudo, showingSlides, dailyState.currentStep, activeSession]);

  const handlePseudoSubmit = async (e) => {
    e.preventDefault();
    const clean = draftPseudo.trim().replace(/\s+/g, ' ');
    if (!clean || syncingPseudo) return;
    setSyncingPseudo(true);
    saveName(clean);
    await syncProgressFromServer(clean);
    setPseudo(clean);
    setEditingPseudo(false);
    setSyncingPseudo(false);
    const st = readDailyState(clean);
    setDailyState(st);
    setAllProgress(readAllProgress(clean));
    const alreadyActive = st.onboarded || Object.keys(st.steps).length > 0 || st.todayCount > 0;
    manualSlidesRef.current = false;
    setSlideIdx(0);
    setShowingSlides(!alreadyActive);
  };

  const finishOnboardingSlides = () => {
    manualSlidesRef.current = false;
    markDailyOnboarded(pseudo);
    const st = readDailyState(pseudo);
    setDailyState(st);
    setShowingSlides(false);
  };

  const launchStep = (stepNumber, forceReplay = false) => {
    const isAlreadyCompleted = Boolean(dailyState.steps[stepNumber]);
    if (!isAlreadyCompleted && dailyState.todayStepsCount >= MAX_DAILY_STEPS) {
      setLimitNotice(true);
      return;
    }
    setLimitNotice(false);
    if (forceReplay) {
      clearDailyStepAnswers(stepNumber, pseudo);
    }
    const isBossStep = stepNumber % 4 === 0;
    const { questions, answers, stepInfo } = resolveStepQuestionsAndAnswers(
      stepNumber,
      QUESTIONS_PER_STEP,
      pseudo,
      byChapter,
      allProgress
    );
    if (questions.length === 0) return;
    setActiveSession({
      id: Date.now(),
      stepNumber,
      isBossStep,
      stepInfo,
      questions,
      initialAnswers: forceReplay ? {} : answers,
    });
    window.scrollTo(0, 0);
  };

  // Smooth C1/C2 meandering spline geometry with generous horizontal loops + top continuation
  const totalStepsToShow = Math.max(8, dailyState.currentStep + 3);
  const pathLayout = useMemo(() => {
    const width = 360;
    const rowHeight = 172;
    const topPad = 128;
    const bottomPad = 115;
    const height = topPad + (totalStepsToShow - 1) * rowHeight + bottomPad;

    // Node horizontal positions + intermediate wide loop apexes between consecutive nodes
    // so the path curves generously left and right like the reference screenshot.
    const xWave = [176, 262, 178, 94, 180, 264, 176, 94];
    const loopXWave = [98, 322, 28, 276, 88, 320, 32, 276];

    const nodes = [];
    for (let s = 1; s <= totalStepsToShow; s++) {
      const idxFromTop = totalStepsToShow - s;
      const y = topPad + idxFromTop * rowHeight;
      const x = xWave[(s - 1) % xWave.length];
      nodes.push({ step: s, x, y, isBoss: s % 4 === 0 });
    }

    // Build a smooth sequence of waypoints: Node_1 -> Loop_1 -> Node_2 -> Loop_2 -> ... -> TopExit
    const waypoints = [];
    for (let i = 0; i < nodes.length; i++) {
      const curr = nodes[i];
      waypoints.push({ x: curr.x, y: curr.y, step: curr.step, isNode: true });
      if (i < nodes.length - 1) {
        const next = nodes[i + 1];
        const loopX = loopXWave[i % loopXWave.length];
        const loopY = Math.round((curr.y + next.y) / 2);
        waypoints.push({ x: loopX, y: loopY, step: next.step, isNode: false });
      }
    }
    // Add a continuation waypoint above the highest node so the road disappears into the top fade
    if (nodes.length > 0) {
      const topNode = nodes[nodes.length - 1];
      const exitLoopX = loopXWave[(nodes.length - 1) % loopXWave.length];
      waypoints.push({ x: exitLoopX, y: Math.max(42, topNode.y - 68), step: topNode.step + 1, isNode: false });
      waypoints.push({ x: 180, y: 4, step: topNode.step + 1, isNode: false });
    }

    // Convert Catmull-Rom waypoints into a smooth continuous cubic Bézier SVG path string
    const catmullRomToBezier = (pts, startIdx, endIdx) => {
      if (endIdx <= startIdx || pts.length < 2) return '';
      const tension = 0.34;
      let d = `M ${pts[startIdx].x} ${pts[startIdx].y}`;
      for (let i = startIdx; i < endIdx; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];

        const cp1x = Math.round((p1.x + (p2.x - p0.x) * tension) * 10) / 10;
        const cp1y = Math.round((p1.y + (p2.y - p0.y) * tension) * 10) / 10;
        const cp2x = Math.round((p2.x - (p3.x - p1.x) * tension) * 10) / 10;
        const cp2y = Math.round((p2.y - (p3.y - p1.y) * tension) * 10) / 10;

        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
      }
      return d;
    };

    const unlockedNodeCount = Math.min(dailyState.currentStep, nodes.length);
    // Each node i is at waypoint index i * 2
    const unlockedWaypointIdx = Math.max(0, (unlockedNodeCount - 1) * 2);

    const unlockedPathD =
      unlockedWaypointIdx > 0 ? catmullRomToBezier(waypoints, 0, unlockedWaypointIdx) : '';
    const lockedPathD =
      unlockedWaypointIdx < waypoints.length - 1
        ? catmullRomToBezier(waypoints, unlockedWaypointIdx, waypoints.length - 1)
        : '';

    // Maximum 3 large background anatomical schemas visible along the 8-step path
    // Placed in the wide-open opposite margins (>200px away from the step buttons):
    // - Step 2 is on the right (x=262) -> Large Shoulder schema on the left (x=54)
    // - Step 4 is on the left (x=94)   -> Large Ribcage/Thorax schema on the right (x=306)
    // - Step 6 is on the right (x=264) -> Large Pelvis/Knee schema on the left (x=54)
    // (And if the user unlocks further steps >8, only 1 every 2.5-3 steps)
    const sparseSlots = [
      { nodeIndex: 1, x: 54, yOffset: 10, size: 126, rotate: -7, logoNum: 5 },  // Shoulder anatomy (left, opposite Step 2)
      { nodeIndex: 3, x: 306, yOffset: -6, size: 132, rotate: 6, logoNum: 10 }, // Ribcage anatomy (right, opposite Step 4)
      { nodeIndex: 5, x: 54, yOffset: 8, size: 124, rotate: -6, logoNum: 4 },   // Pelvis anatomy (left, opposite Step 6)
    ];
    const extraLogos = [2, 6, 7, 1, 8, 9];

    const decorations = [];
    for (const slot of sparseSlots) {
      const node = nodes[slot.nodeIndex];
      if (node) {
        decorations.push({
          id: `deco-${slot.nodeIndex}`,
          step: node.step,
          src: `/path-deco/logo-${slot.logoNum}.png`,
          x: slot.x,
          y: node.y + slot.yOffset,
          size: slot.size,
          rotate: slot.rotate,
        });
      }
    }
    for (let i = 7; i < nodes.length; i += 3) {
      const curr = nodes[i];
      const onLeft = curr.x > 180;
      const logoNum = extraLogos[Math.floor((i - 7) / 3) % extraLogos.length];
      decorations.push({
        id: `deco-${i}`,
        step: curr.step,
        src: `/path-deco/logo-${logoNum}.png`,
        x: onLeft ? 54 : 306,
        y: curr.y,
        size: 124,
        rotate: onLeft ? -6 : 6,
      });
    }

    return { width, height, nodes, unlockedPathD, lockedPathD, decorations };
  }, [totalStepsToShow, dailyState.currentStep]);

  // 1) Pseudo onboarding step
  if (!pseudo || editingPseudo) {
    return (
      <section className="home daily-onboarding">
        <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }}>
          QUIZ <span className="grad">Cochin</span>
        </motion.h1>
        <motion.form
          className="home-panel name-step"
          onSubmit={handlePseudoSubmit}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <label htmlFor="daily-pseudo">Choisis un pseudo pour commencer ton parcours quotidien</label>
          <input
            id="daily-pseudo"
            className="name-input"
            type="text"
            value={draftPseudo}
            onChange={(e) => setDraftPseudo(e.target.value)}
            placeholder="Ton pseudo"
            maxLength={80}
            autoComplete="nickname"
            autoFocus
            required
          />
          <p className="privacy">
            Ton pseudo sauvegarde ton objectif du jour, tes étoiles et ta progression sur tous tes appareils.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn" type="submit" disabled={!draftPseudo.trim() || syncingPseudo}>
              {syncingPseudo ? 'Synchronisation…' : <>Continuer <Icon name="arrow" size={18} /></>}
            </button>
            {pseudo && !syncingPseudo && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setEditingPseudo(false)}
              >
                Annuler
              </button>
            )}
          </div>
        </motion.form>
      </section>
    );
  }

  // 1b) Onboarding explanatory slides (3 simple & clear slides on login)
  if (showingSlides) {
    const slide = ONBOARDING_SLIDES[slideIdx] || ONBOARDING_SLIDES[0];
    const isLastSlide = slideIdx === ONBOARDING_SLIDES.length - 1;

    const onTouchStart = (e) => {
      touchStartXRef.current = e.touches?.[0]?.clientX ?? null;
    };
    const onTouchEnd = (e) => {
      if (touchStartXRef.current === null) return;
      const endX = e.changedTouches?.[0]?.clientX ?? touchStartXRef.current;
      const dx = endX - touchStartXRef.current;
      touchStartXRef.current = null;
      if (dx < -45) {
        if (isLastSlide) finishOnboardingSlides();
        else setSlideIdx((i) => Math.min(ONBOARDING_SLIDES.length - 1, i + 1));
      } else if (dx > 45 && slideIdx > 0) {
        setSlideIdx((i) => Math.max(0, i - 1));
      }
    };

    return (
      <section className="home daily-onboarding">
        <motion.div
          key={slideIdx}
          className="home-panel daily-slide-card"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="daily-slide-top">
            <span className="daily-slide-step-pill">
              Guide de bienvenue · {slide.step}
            </span>
            <button
              type="button"
              className="daily-slide-skip"
              onClick={finishOnboardingSlides}
            >
              Passer ✕
            </button>
          </div>

          <div className="daily-slide-art" aria-hidden="true">
            {slide.icon === 'daily' && (
              <svg width="220" height="84" viewBox="0 0 220 84" fill="none">
                <defs>
                  <linearGradient id="tutoRoad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#38e1ff" />
                    <stop offset="55%" stopColor="#6aa8ff" />
                    <stop offset="100%" stopColor="#7c8cff" />
                  </linearGradient>
                </defs>
                {/* Accomplished cyan-violet road + locked dotted road */}
                <path
                  d="M28 52 C 62 52, 76 34, 110 34"
                  stroke="url(#tutoRoad)"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                <path
                  d="M110 34 C 144 34, 158 52, 192 52"
                  stroke="rgba(143, 166, 184, 0.35)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray="1 12"
                />
                {/* Node 1 (completed with 3 stars) */}
                <g transform="translate(28, 52)">
                  <path d="M-11 -22l2 -4 2 4 4 .6-3 3 .7 4-3.7-2-3.7 2 .7-4-3-3 4-.6Z" fill="#38e1ff" />
                  <path d="M0 -25l2.3 -4.6 5 .7-3.6 3.5.8 5L0 -22.8l-4.5 2.4.8-5-3.6-3.5 5-.7L0 -25Z" fill="#38e1ff" />
                  <path d="M11 -22l2 -4 2 4 4 .6-3 3 .7 4-3.7-2-3.7 2 .7-4-3-3 4-.6Z" fill="#38e1ff" />
                  <circle r="16" fill="#0d2138" stroke="#38e1ff" strokeWidth="2.5" />
                  <text y="5" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="800">1</text>
                </g>
                {/* Node 2 (current active step) */}
                <g transform="translate(110, 34)">
                  <circle r="21" fill="rgba(56, 225, 255, 0.14)" />
                  <circle r="16" fill="#10243d" stroke="#38e1ff" strokeWidth="2.5" />
                  <text y="5" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="800">2</text>
                </g>
                {/* Node 3 (locked padlock) */}
                <g transform="translate(192, 52)">
                  <circle r="16" fill="#0e1622" stroke="rgba(143, 166, 184, 0.35)" strokeWidth="2" />
                  <rect x="-5" y="-2" width="10" height="8" rx="2" stroke="#8fa6b8" strokeWidth="1.6" />
                  <path d="M-3 -2V-5a3 3 0 0 1 6 0v3" stroke="#8fa6b8" strokeWidth="1.6" />
                </g>
              </svg>
            )}
            {slide.icon === 'cycles' && (
              <div className="daily-slide-art-cycles">
                <div className="daily-slide-cycle-pill is-active">
                  <img src="/theme-logos/epaule.png" alt="" draggable="false" />
                  <div>
                    <strong>L’épaule</strong>
                    <span>Boucle 1 → 2 → 3</span>
                  </div>
                </div>
                <span className="daily-slide-cycle-arrow">→</span>
                <div className="daily-slide-cycle-pill is-next">
                  <img src="/theme-logos/coude.png" alt="" draggable="false" />
                  <div>
                    <strong>Le coude</strong>
                    <span>Catégorie suivante</span>
                  </div>
                </div>
              </div>
            )}
            {slide.icon === 'sync' && (
              <svg width="210" height="82" viewBox="0 0 210 82" fill="none">
                {/* Book reference card */}
                <rect x="14" y="10" width="104" height="62" rx="11" fill="#0d1826" stroke="rgba(56,225,255,0.45)" strokeWidth="1.8" />
                <rect x="24" y="20" width="48" height="6" rx="3" fill="#34d399" />
                <rect x="24" y="31" width="76" height="4.5" rx="2.2" fill="rgba(255,255,255,0.28)" />
                <rect x="22" y="44" width="88" height="19" rx="6" fill="rgba(56,225,255,0.12)" stroke="#38e1ff" strokeWidth="1.2" />
                <text x="30" y="56" fill="#38e1ff" fontSize="8.5" fontWeight="700">Réf. Livre : Chapitre · Page</text>
                {/* Sync link */}
                <path d="M126 41 H146" stroke="#38e1ff" strokeWidth="2" strokeDasharray="3 3" />
                {/* Mobile device synced */}
                <rect x="152" y="12" width="42" height="58" rx="9" fill="#0d1826" stroke="#7c8cff" strokeWidth="1.8" />
                <circle cx="173" cy="36" r="9" fill="rgba(56,225,255,0.15)" stroke="#38e1ff" strokeWidth="1.5" />
                <path d="M169.5 36l2.3 2.4 4.8-4.8" stroke="#38e1ff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="163" y="53" width="20" height="4" rx="2" fill="rgba(255,255,255,0.3)" />
              </svg>
            )}
          </div>

          <div className="daily-slide-head">
            <span className="daily-slide-badge">{slide.badge}</span>
            <h2>{slide.title}</h2>
            <p className="daily-slide-lead">{slide.lead}</p>
          </div>

          <div className="daily-slide-points">
            {slide.points.map((pt) => (
              <div key={pt.title} className="daily-slide-point">
                <span className="daily-slide-point-icon" aria-hidden="true">{pt.icon}</span>
                <div className="daily-slide-point-body">
                  <strong>{pt.title}</strong>
                  <span>{pt.desc}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="daily-slide-highlight">{slide.highlight}</div>

          <div className="daily-slide-dots" role="tablist" aria-label="Étapes de présentation">
            {ONBOARDING_SLIDES.map((s, idx) => (
              <button
                key={s.step}
                type="button"
                role="tab"
                aria-selected={idx === slideIdx}
                aria-label={`Diapositive ${idx + 1}`}
                className={`daily-slide-dot ${idx === slideIdx ? 'is-active' : ''}`}
                onClick={() => setSlideIdx(idx)}
              />
            ))}
          </div>

          <div className="daily-slide-actions">
            {slideIdx > 0 ? (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setSlideIdx((i) => i - 1)}
              >
                ← Précédent
              </button>
            ) : (
              <span />
            )}

            {isLastSlide ? (
              <button
                type="button"
                className="btn"
                onClick={finishOnboardingSlides}
              >
                Accéder à mon parcours <Icon name="arrow" size={18} />
              </button>
            ) : (
              <button
                type="button"
                className="btn"
                onClick={() => setSlideIdx((i) => i + 1)}
              >
                Suivant <Icon name="arrow" size={18} />
              </button>
            )}
          </div>
        </motion.div>
      </section>
    );
  }

  if (loading) {
    return (
      <div className="cq">
        <p className="cq-loading" role="status">Chargement de ton parcours…</p>
      </div>
    );
  }

  // 3) Active Daily Step Quiz Player
  if (activeSession) {
    const { stepNumber, isBossStep, stepInfo, questions, initialAnswers } = activeSession;
    const info = stepInfo || getStepScheduleInfo(stepNumber);
    const qIds = questions.map((q) => q.id);
    return (
      <div className="rnd-play daily-play">
        <div className="rnd-play-top">
          <button
            type="button"
            className="rnd-action-btn"
            onClick={() => {
              setDailyState(readDailyState(pseudo));
              setActiveSession(null);
            }}
          >
            ← Retour au chemin
          </button>
          <span className="daily-session-pill">
            🚩 {Math.min(dailyState.todayStepsCount, MAX_DAILY_STEPS)}/{MAX_DAILY_STEPS} étapes aujourd’hui
          </span>
        </div>
        <QuizPlayer
          key={activeSession.id}
          chapterKey="quiz-aleatoire"
          meta={{
            numero: `Étape ${stepNumber} · ${info.themeTitle} (Boucle ${info.loopIndex}/${LOOPS_PER_THEME})`,
            theme: info.themeId,
            backHref: '#/',
            titre: info.chapterTitle,
            auteurs: 'A. Cotten',
          }}
          questions={questions}
          initialAnswers={initialAnswers}
          onAnswersChange={(nextAns) => {
            saveDailyStepSession(stepNumber, { questionIds: qIds, answers: nextAns }, pseudo);
          }}
          randomMode
          backLabel="← Chemin"
          onQuestionValidated={() => {
            recordDailyQuestionAnswered(pseudo);
            setDailyState(readDailyState(pseudo));
          }}
          onQuizCompleted={({ score, total }) => {
            const ratio = total > 0 ? score / total : 0;
            const stars = ratio > 0.9 ? 3 : ratio > 0.6 ? 2 : 1;
            recordDailyStepCompleted(stepNumber, stars, pseudo);
            setDailyState(readDailyState(pseudo));
          }}
          dailyMode={{
            stepNumber,
            isBossStep,
            onContinuePath: () => {
              setDailyState(readDailyState(pseudo));
              setActiveSession(null);
            },
          }}
        />
      </div>
    );
  }

  const goal = dailyState.goal || 3;
  const stepsToday = Math.min(dailyState.todayStepsCount, MAX_DAILY_STEPS);
  const dailyStepsReached = stepsToday >= MAX_DAILY_STEPS;
  const themeProg = getThemeProgressionInfo(dailyState);

  // Check if currentStep has in-progress answers saved
  const currentStepSession = readDailyStepSession(dailyState.currentStep, pseudo);
  const currentStepAnsweredCount = Object.keys(currentStepSession.answers || {}).length;
  const currentStepTotalCount = currentStepSession.questionIds?.length || goal;

  // 4) Winding Daily Progression Path View
  return (
    <section className="daily-page" aria-label="Parcours de progression journalière">
      {/* Top Floating HUD */}
      <div className="daily-hud-stack">
        <div className="daily-hud">
          <button
            type="button"
            className="daily-hud-pill daily-hud-left daily-hud-streak-btn"
            onClick={() => setShowingCalendar(true)}
            title="Voir mon calendrier de série (1 étape validée par jour suffit pour continuer la série)"
          >
            <span className="daily-hud-item">
              <svg className="daily-flame-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <defs>
                  <linearGradient id="flameGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38e1ff" />
                    <stop offset="100%" stopColor="#7c8cff" />
                  </linearGradient>
                </defs>
                <path
                  fill="url(#flameGrad)"
                  d="M12 2c1.8 3.2 5 5.6 5 10.2A5.5 5.5 0 0 1 11.5 18c2.2-1.2 2.4-3.8 1-5.5-1.2 1.4-2.5 2.4-2.5 4.3A4.2 4.2 0 0 1 6.5 12C6.5 8.2 9.8 5.2 12 2Z"
                />
                <circle cx="12" cy="16.5" r="2.3" fill="#fff" opacity="0.85" />
              </svg>
              <b>{dailyState.streak}</b>
            </span>

            <span className={`daily-hud-item daily-hud-flag-btn ${dailyStepsReached ? 'is-done' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="4" width="18" height="17" rx="3" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <b>{stepsToday}/{MAX_DAILY_STEPS}</b>
            </span>
          </button>

          <div className="daily-hud-right-group">
            <button
              type="button"
              className="daily-hud-pill daily-hud-help"
              onClick={() => {
                manualSlidesRef.current = true;
                setSlideIdx(0);
                setShowingSlides(true);
              }}
              title="Revoir comment fonctionne le parcours"
              aria-label="Comment fonctionne le parcours"
            >
              ?
            </button>

            <button
              type="button"
              className="daily-hud-pill daily-hud-pseudo"
              onClick={() => {
                setDraftPseudo(pseudo);
                setEditingPseudo(true);
              }}
              title="Changer de pseudo"
            >
              {pseudo}
            </button>

            <div className="daily-hud-pill daily-hud-stars" title="Total d’étoiles gagnées sur le parcours">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#38e1ff"
                  stroke="#05090f"
                  strokeWidth="1.2"
                  d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z"
                />
              </svg>
              <b>{dailyState.totalStars}</b>
            </div>
          </div>
        </div>

        {/* Category currently studied + progression + next category */}
        <button
          type="button"
          className="daily-theme-strip"
          onClick={() => setShowingCalendar(true)}
          title="Voir les détails de ma catégorie et mon calendrier de série"
        >
          <div className="daily-theme-strip-cur">
            <img
              src={`/theme-logos/${themeProg.currentTheme.id}.png`}
              alt=""
              aria-hidden="true"
              className="daily-theme-strip-logo"
              draggable="false"
            />
            <div className="daily-theme-strip-info">
              <div className="daily-theme-strip-row">
                <span className="daily-theme-strip-name">{themeProg.currentTheme.title}</span>
                <span className="daily-theme-strip-count">
                  {themeProg.completedSteps}/{themeProg.totalSteps} ({themeProg.percent}%)
                </span>
              </div>
              <div className="daily-theme-strip-bar" aria-hidden="true">
                <div style={{ width: `${themeProg.percent}%` }} />
              </div>
            </div>
          </div>

          <div className="daily-theme-strip-next">
            <span className="daily-theme-strip-next-kicker">Suivant</span>
            <span className="daily-theme-strip-next-val">
              <img
                src={`/theme-logos/${themeProg.nextTheme.id}.png`}
                alt=""
                aria-hidden="true"
                className="daily-theme-strip-next-logo"
                draggable="false"
              />
              <b>{themeProg.nextTheme.title}</b>
            </span>
          </div>
        </button>
      </div>

      {showingCalendar && (
        <StreakCalendarModal
          dailyState={dailyState}
          onClose={() => setShowingCalendar(false)}
        />
      )}

      {limitNotice && (
        <div
          className="daily-cal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Avancement quotidien terminé"
          onClick={() => setLimitNotice(false)}
        >
          <motion.div
            className="daily-cal-modal daily-limit-modal"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="daily-cal-head">
              <div>
                <span className="daily-goal-kicker">Objectif du jour atteint · 3/3</span>
                <h3>Avancement quotidien terminé !</h3>
              </div>
              <button
                type="button"
                className="daily-cal-close"
                onClick={() => setLimitNotice(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <p className="daily-limit-modal-text">
              Bravo, tu as réalisé tes <strong>{MAX_DAILY_STEPS} étapes de la journée</strong> ! Reviens demain pour débloquer et poursuivre la suite de ton parcours quotidien.
            </p>
            <div className="daily-cal-rule">
              📚 En attendant, tu peux accéder à la page <strong>Quiz</strong> pour t’entraîner librement et faire autant de quiz que tu le souhaites !
            </div>

            <div className="daily-limit-modal-actions">
              <a
                href="#/chapitres"
                className="btn"
                onClick={() => setLimitNotice(false)}
              >
                Aller à la page Quiz <Icon name="arrow" size={18} />
              </a>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setLimitNotice(false)}
              >
                Fermer
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Smooth Winding Path Canvas */}
      <div className="daily-map-scroll">
        <div
          className="daily-map-canvas"
          style={{ height: pathLayout.height }}
        >
          <svg
            className="daily-map-svg"
            viewBox={`0 0 ${pathLayout.width} ${pathLayout.height}`}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="cochinRoadGrad" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#38e1ff" />
                <stop offset="52%" stopColor="#6aa8ff" />
                <stop offset="100%" stopColor="#7c8cff" />
              </linearGradient>
              <filter id="roadGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#38e1ff" floodOpacity="0.32" />
              </filter>
            </defs>

            {/* Unaccomplished / locked trail (monochrome slate-grey, not colored) */}
            {pathLayout.lockedPathD && (
              <g>
                <path
                  d={pathLayout.lockedPathD}
                  fill="none"
                  stroke="rgba(12, 18, 28, 0.92)"
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pathLayout.lockedPathD}
                  fill="none"
                  stroke="rgba(143, 166, 184, 0.28)"
                  strokeWidth="6.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1 18"
                />
              </g>
            )}

            {/* Accomplished / unlocked trail in Quiz Cochin DA (cyan -> violet gradient) */}
            {pathLayout.unlockedPathD && (
              <g filter="url(#roadGlow)">
                <path
                  d={pathLayout.unlockedPathD}
                  fill="none"
                  stroke="#060c14"
                  strokeWidth="22"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pathLayout.unlockedPathD}
                  fill="none"
                  stroke="url(#cochinRoadGrad)"
                  strokeWidth="13.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pathLayout.unlockedPathD}
                  fill="none"
                  stroke="rgba(232, 244, 251, 0.72)"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}
          </svg>

          {/* Decorative musculoskeletal radiology schemas in the background (uncolored until reached) */}
          {pathLayout.decorations.map((deco) => {
            const isColored = Boolean(dailyState.steps[deco.step]) || dailyState.currentStep > deco.step;
            return (
              <div
                key={deco.id}
                className={`daily-deco ${isColored ? 'is-colored' : 'is-uncolored'}`}
                style={{
                  top: deco.y,
                  left: `${(deco.x / pathLayout.width) * 100}%`,
                  width: deco.size,
                  height: deco.size,
                  '--deco-rot': `${deco.rotate}deg`,
                }}
                aria-hidden="true"
              >
                <img
                  src={deco.src}
                  alt=""
                  className="daily-deco-img"
                  loading="lazy"
                  draggable="false"
                />
              </div>
            );
          })}

          {/* Path Step Nodes */}
          {pathLayout.nodes.map((node) => {
            const { step, x, y, isBoss } = node;
            const stars = dailyState.steps[step] || 0;
            const isCompleted = stars > 0;
            const isCurrent = step === dailyState.currentStep;
            const isUnlocked = step <= dailyState.currentStep;
            const nodeInfo = getStepScheduleInfo(step);
            const leftPct = `${(x / pathLayout.width) * 100}%`;

            return (
              <div
                key={step}
                ref={isCurrent ? currentStepNodeRef : undefined}
                className={`daily-node-wrap ${isUnlocked ? 'is-unlocked' : 'is-locked'} ${isCompleted ? 'is-completed' : ''} ${isCurrent ? 'is-current' : ''} ${isBoss ? 'is-boss' : ''}`}
                style={{ left: leftPct, top: y }}
              >
                {/* 3-star arch above every step node (empty slots before completion, lit when earned) */}
                <div
                  className={`daily-boss-stars ${!isBoss ? 'daily-step-stars' : ''} ${!isUnlocked ? 'is-locked-stars' : ''}`}
                  aria-hidden="true"
                >
                  {[1, 2, 3].map((sIdx) => {
                    const lit = stars >= sIdx;
                    return (
                      <svg
                        key={sIdx}
                        className={`daily-star-svg s-${sIdx} ${lit ? 'is-lit' : 'is-empty'}`}
                        width={isBoss ? (sIdx === 2 ? 30 : 25) : sIdx === 2 ? 25 : 21}
                        height={isBoss ? (sIdx === 2 ? 30 : 25) : sIdx === 2 ? 25 : 21}
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M12 2.2l2.95 5.98 6.6.96-4.77 4.65 1.12 6.57L12 17.26l-5.9 3.1 1.12-6.57-4.77-4.65 6.6-.96L12 2.2Z"
                          fill={lit ? '#38e1ff' : 'rgba(15, 22, 34, 0.88)'}
                          stroke={lit ? '#05090f' : 'rgba(143, 166, 184, 0.45)'}
                          strokeWidth="2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className={`daily-node-btn ${isBoss ? 'daily-node-boss' : ''} ${!isUnlocked ? 'daily-node-locked' : ''} ${isCompleted ? 'daily-node-done' : ''}`}
                  disabled={!isUnlocked && !dailyStepsReached}
                  onClick={() => {
                    if (!isUnlocked && dailyStepsReached) {
                      setLimitNotice(true);
                      return;
                    }
                    if (isUnlocked) launchStep(step);
                  }}
                  title={`${nodeInfo.themeTitle} — ${nodeInfo.chapterTitle} (Boucle ${nodeInfo.loopIndex}/${LOOPS_PER_THEME})`}
                  aria-label={
                    isUnlocked
                      ? `Étape ${step} : ${nodeInfo.themeTitle} — ${nodeInfo.chapterTitle}${isCompleted ? ` (${stars} étoiles)` : ' — Lancer'}`
                      : `Étape ${step} verrouillée (${nodeInfo.themeTitle} — ${nodeInfo.chapterTitle})`
                  }
                >
                  <img
                    src={`/theme-logos/${nodeInfo.themeId}.png`}
                    alt=""
                    aria-hidden="true"
                    className="daily-node-bg-logo"
                    draggable="false"
                  />
                  {isUnlocked ? (
                    <span className="daily-node-center-num">{step}</span>
                  ) : (
                    <LockIcon isBoss={isBoss} />
                  )}
                </button>

                {/* Side badges */}
                {isUnlocked && (
                  <div
                    className={`daily-side-badges ${x > 180 ? 'on-left' : 'on-right'}`}
                    aria-hidden="true"
                  >
                    <span
                      className="daily-side-badge"
                      title={isCompleted ? `${stars} étoile${stars > 1 ? 's' : ''}` : `${goal} question${goal > 1 ? 's' : ''}`}
                    >
                      <b>{isCompleted ? `${stars}★` : `${goal}Q`}</b>
                    </span>
                  </div>
                )}

                {isCurrent && (
                  <button
                    type="button"
                    className={`daily-current-cta ${dailyStepsReached ? 'is-daily-limit' : ''}`}
                    onClick={() => launchStep(step)}
                  >
                    {dailyStepsReached
                      ? '⏳ Reviens demain pour continuer'
                      : currentStepAnsweredCount > 0 && currentStepAnsweredCount < currentStepTotalCount
                        ? `Continuer (${currentStepAnsweredCount}/${currentStepTotalCount})`
                        : isBoss
                          ? '🔥 Lancer le Boss'
                          : 'Commencer'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
