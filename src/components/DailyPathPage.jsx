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
    badge: 'Parcours quotidien',
    title: 'Réalise tes questions journalières',
    text: 'Chaque étape comporte 3 questions (2 questions + 1 question Boss plus corsée). Tu peux réaliser jusqu’à 3 étapes par jour, et valider une seule étape suffit pour maintenir ta série (streak) !',
    highlight: '⭐ Gagne 1★ en finissant l’étape, 2★ si > 60 % de bonnes réponses et 3★ si > 90 % !',
    icon: 'daily',
  },
  {
    step: '2 / 3',
    badge: 'Révision avec le livre',
    title: 'Révise les notions dans le bouquin',
    text: 'Après chaque réponse, consulte l’explication complète et les figures commentées. Pour approfondir ou revoir un point dans le livre, la référence exacte est toujours écrite tout en bas de la correction.',
    highlight: '📖 Exemple en bas de chaque correction : Chapitre, titre, numéro de page et paragraphe.',
    icon: 'book',
  },
  {
    step: '3 / 3',
    badge: 'Sauvegarde automatique',
    title: 'Ta progression est sauvegardée',
    text: 'Ta progression au sein de chaque étape est conservée sans changement des questions. Tout est mémorisé automatiquement avec ton pseudo, sur ton téléphone comme sur ton ordinateur.',
    highlight: '📈 Retrouve à tout moment ton calendrier de série en haut à gauche et tes chapitres dans « Ma progression ».',
    icon: 'progress',
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

function resolveStepQuestionsAndAnswers(stepNumber, goalCount, pseudo, byChapter, allProgress) {
  const count = Math.max(1, Number(goalCount) || 3);
  const { fullPool, byId } = buildFlatQuestionMap(byChapter, allProgress);
  if (fullPool.length === 0) return { questions: [], answers: {}, stepInfo: getStepScheduleInfo(stepNumber) };

  const stepInfo = getStepScheduleInfo(stepNumber);
  const chapterPool = fullPool.filter((q) => q._chapterKey === stepInfo.chapterKey);
  const targetPool = chapterPool.length > 0 ? chapterPool : fullPool;

  const savedSession = readDailyStepSession(stepNumber, pseudo);
  // Restore saved session if its questions belong to this step's assigned chapter
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

  // Otherwise, deterministically select 3 questions from this step's single chapter (stepInfo.chapterKey)
  const seedBase = `${(pseudo || '').trim().toLowerCase()}:step-${stepNumber}:${stepInfo.chapterKey}`;
  const isBossStep = stepNumber % 4 === 0;
  const usedIds = new Set();

  // Exclude questions already assigned in previous loops of this same chapter so the 3 loops don't repeat
  for (let prev = 1; prev < stepNumber; prev++) {
    const prevInfo = getStepScheduleInfo(prev);
    if (prevInfo.chapterKey !== stepInfo.chapterKey) continue;
    const prevSaved = readDailyStepSession(prev, pseudo);
    for (const qid of prevSaved.questionIds || []) {
      usedIds.add(qid);
    }
  }

  const pickFrom = (candidates, needed, tag) => {
    const filtered = candidates.filter((q) => !usedIds.has(q.id));
    const poolToUse = filtered.length >= needed ? filtered : candidates;
    const fresh = seededShuffle(
      poolToUse.filter((q) => q._unanswered),
      `${seedBase}:${tag}:fresh`
    );
    const seen = seededShuffle(
      poolToUse.filter((q) => !q._unanswered),
      `${seedBase}:${tag}:seen`
    );
    return [...fresh, ...seen].slice(0, needed);
  };

  const regularNeeded = Math.max(1, count - 1);
  let regularCandidates;
  let bossCandidates;

  if (stepInfo.loopIndex === 1 && !isBossStep) {
    regularCandidates = targetPool.filter((q) => q.difficulty === 1);
    if (regularCandidates.length < regularNeeded) {
      regularCandidates = [
        ...regularCandidates,
        ...targetPool.filter((q) => q.difficulty === 2),
      ];
    }
    if (regularCandidates.length < regularNeeded) regularCandidates = targetPool;
    bossCandidates = targetPool.filter((q) => q.difficulty >= 2);
    if (bossCandidates.length === 0) bossCandidates = targetPool;
  } else if (stepInfo.loopIndex === 2 && !isBossStep) {
    regularCandidates = targetPool.filter((q) => q.difficulty <= 2);
    if (regularCandidates.length < regularNeeded) regularCandidates = targetPool;
    bossCandidates = targetPool.filter((q) => q.difficulty === 3);
    if (bossCandidates.length === 0) bossCandidates = targetPool.filter((q) => q.difficulty >= 2);
    if (bossCandidates.length === 0) bossCandidates = targetPool;
  } else {
    regularCandidates = targetPool.filter((q) => q.difficulty >= 2);
    if (regularCandidates.length < regularNeeded) regularCandidates = targetPool;
    bossCandidates = targetPool.filter((q) => q.difficulty === 3);
    if (bossCandidates.length === 0) bossCandidates = targetPool.filter((q) => q.difficulty >= 2);
    if (bossCandidates.length === 0) bossCandidates = targetPool;
  }

  let regulars = pickFrom(regularCandidates, regularNeeded, 'reg');
  for (const q of regulars) usedIds.add(q.id);
  if (regulars.length < regularNeeded) {
    const extra = pickFrom(targetPool, regularNeeded - regulars.length, 'extra');
    for (const q of extra) usedIds.add(q.id);
    regulars = [...regulars, ...extra];
  }

  let bossArr = pickFrom(bossCandidates, 1, 'boss');
  if (bossArr.length === 0) {
    bossArr = pickFrom(targetPool, 1, 'boss-fallback');
  }

  const finalQuestions = [
    ...regulars.map((q) => ({ ...q, _isBoss: false })),
    ...bossArr.map((q) => ({ ...q, _isBoss: true })),
  ];
  const questionIds = finalQuestions.map((q) => q.id);
  saveDailyStepSession(stepNumber, { questionIds, answers: {} }, pseudo);

  return {
    questions: finalQuestions,
    answers: {},
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
            <span className="daily-goal-kicker">Série quotidienne</span>
            <h3>Calendrier de streak</h3>
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
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#38e1ff"
                d="M12 2c1.8 3.2 5 5.6 5 10.2A5.5 5.5 0 0 1 11.5 18c2.2-1.2 2.4-3.8 1-5.5-1.2 1.4-2.5 2.4-2.5 4.3A4.2 4.2 0 0 1 6.5 12C6.5 8.2 9.8 5.2 12 2Z"
              />
            </svg>
            <div>
              <strong>{dailyState.streak} jour{dailyState.streak > 1 ? 's' : ''}</strong>
              <span>Série en cours</span>
            </div>
          </div>

          <div className="daily-cal-stat">
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#38e1ff"
                stroke="#05090f"
                strokeWidth="1.2"
                d="M12 2.2l2.95 5.98 6.6.96-4.77 4.65 1.12 6.57L12 17.26l-5.9 3.1 1.12-6.57-4.77-4.65 6.6-.96L12 2.2Z"
              />
            </svg>
            <div>
              <strong>{dailyState.totalStars} ★</strong>
              <span>Étoiles gagnées au total</span>
            </div>
          </div>
        </div>

        <p className="daily-cal-rule">
          💡 Réaliser <strong>une seule étape</strong> (3 questions) dans la journée suffit pour continuer ta série !
        </p>

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
                {/* Star logo with stars count displayed right above the day */}
                <div className="daily-cal-day-top" aria-hidden="true">
                  {showStarLogo && (
                    <span className="daily-cal-star-badge">
                      <svg width="13" height="13" viewBox="0 0 24 24">
                        <path
                          fill="#38e1ff"
                          d="M12 2.2l2.95 5.98 6.6.96-4.77 4.65 1.12 6.57L12 17.26l-5.9 3.1 1.12-6.57-4.77-4.65 6.6-.96L12 2.2Z"
                        />
                      </svg>
                      <b>{starValue}</b>
                    </span>
                  )}
                </div>
                <span className="daily-cal-day-num">{cell.day}</span>
              </div>
            );
          })}
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
    return Boolean(n && !readDailyState(n).onboarded);
  });
  const [slideIdx, setSlideIdx] = useState(0);
  const [showingCalendar, setShowingCalendar] = useState(false);
  const [activeSession, setActiveSession] = useState(null); // { stepNumber, isBossStep, questions, initialAnswers, id }
  const [limitNotice, setLimitNotice] = useState(false);
  const currentStepNodeRef = useRef(null);
  const touchStartXRef = useRef(null);

  useEffect(() => {
    const n = readName();
    if (n) syncProgressFromServer(n);
    return subscribePlayer(() => {
      const curr = readName();
      setPseudo(curr);
      setAllProgress(readAllProgress(curr));
      const nextDaily = readDailyState(curr);
      setDailyState(nextDaily);
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

  const handlePseudoSubmit = (e) => {
    e.preventDefault();
    const clean = draftPseudo.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    saveName(clean);
    setPseudo(clean);
    setEditingPseudo(false);
    const st = readDailyState(clean);
    setDailyState(st);
    setAllProgress(readAllProgress(clean));
    setSlideIdx(0);
    setShowingSlides(true);
  };

  const finishOnboardingSlides = () => {
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
            <button className="btn" type="submit" disabled={!draftPseudo.trim()}>
              Continuer <Icon name="arrow" size={18} />
            </button>
            {pseudo && (
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
            <span className="daily-goal-kicker">
              Bienvenue {pseudo} · {slide.step}
            </span>
            <button
              type="button"
              className="pseudo-change-btn"
              onClick={finishOnboardingSlides}
            >
              Passer
            </button>
          </div>

          <div className="daily-slide-art" aria-hidden="true">
            {slide.icon === 'daily' && (
              <svg width="120" height="96" viewBox="0 0 120 96" fill="none">
                <path
                  d="M22 76 C 42 76, 44 48, 62 48 C 80 48, 82 22, 100 22"
                  stroke="#eab308"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
                <circle cx="24" cy="76" r="14" fill="#f08c1a" stroke="#111318" strokeWidth="2.5" />
                <text x="24" y="81" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="900">1</text>
                <circle cx="62" cy="48" r="14" fill="#38b27c" stroke="#111318" strokeWidth="2.5" />
                <text x="62" y="53" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="900">2</text>
                <circle cx="98" cy="22" r="17" fill="#8b5cf6" stroke="#111318" strokeWidth="2.5" />
                <text x="98" y="26" textAnchor="middle" fill="#fff" fontSize="10" fontWeight="900">Boss</text>
              </svg>
            )}
            {slide.icon === 'book' && (
              <svg width="126" height="96" viewBox="0 0 126 96" fill="none">
                <rect x="14" y="10" width="98" height="76" rx="12" fill="#131b26" stroke="rgba(56,225,255,0.45)" strokeWidth="2" />
                <rect x="24" y="20" width="54" height="7" rx="3.5" fill="#34d399" />
                <rect x="24" y="33" width="78" height="5" rx="2.5" fill="rgba(255,255,255,0.28)" />
                <rect x="24" y="43" width="66" height="5" rx="2.5" fill="rgba(255,255,255,0.22)" />
                <rect x="22" y="56" width="82" height="22" rx="7" fill="rgba(56,225,255,0.12)" stroke="#38e1ff" strokeWidth="1.5" />
                <text x="30" y="70" fill="#38e1ff" fontSize="9.5" fontWeight="700">Référence : Chapitre · Page</text>
              </svg>
            )}
            {slide.icon === 'progress' && (
              <svg width="120" height="96" viewBox="0 0 120 96" fill="none">
                <path
                  d="M32 34l4.5 9 10 1.4-7.2 7 1.7 10-9-4.7-9 4.7 1.7-10-7.2-7 10-1.4L32 34Z"
                  fill="#facc15"
                  stroke="#111318"
                  strokeWidth="2"
                />
                <path
                  d="M60 20l5.5 11.2 12.3 1.8-8.9 8.6 2.1 12.3L60 48l-11 5.9 2.1-12.3-8.9-8.6 12.3-1.8L60 20Z"
                  fill="#facc15"
                  stroke="#111318"
                  strokeWidth="2"
                />
                <path
                  d="M88 34l4.5 9 10 1.4-7.2 7 1.7 10-9-4.7-9 4.7 1.7-10-7.2-7 10-1.4L88 34Z"
                  fill="#facc15"
                  stroke="#111318"
                  strokeWidth="2"
                />
                <rect x="24" y="68" width="72" height="12" rx="6" fill="rgba(52,211,153,0.2)" stroke="#34d399" strokeWidth="1.6" />
                <rect x="26" y="70" width="52" height="8" rx="4" fill="#34d399" />
              </svg>
            )}
          </div>

          <span className="daily-slide-badge">{slide.badge}</span>
          <h2>{slide.title}</h2>
          <p className="daily-slide-text">{slide.text}</p>
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
          onRestart={() => launchStep(stepNumber, true)}
        />
      </div>
    );
  }

  const goal = dailyState.goal || 3;
  const stepsToday = Math.min(dailyState.todayStepsCount, MAX_DAILY_STEPS);
  const dailyStepsReached = stepsToday >= MAX_DAILY_STEPS;

  // Check if currentStep has in-progress answers saved
  const currentStepSession = readDailyStepSession(dailyState.currentStep, pseudo);
  const currentStepAnsweredCount = Object.keys(currentStepSession.answers || {}).length;
  const currentStepTotalCount = currentStepSession.questionIds?.length || goal;

  // 4) Winding Daily Progression Path View
  return (
    <section className="daily-page" aria-label="Parcours de progression journalière">
      {/* Top Floating HUD */}
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
                    className="daily-current-cta"
                    onClick={() => launchStep(step)}
                  >
                    {currentStepAnsweredCount > 0 && currentStepAnsweredCount < currentStepTotalCount
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
