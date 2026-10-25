import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { themes } from '../data/themes.js';
import { CHAPTERS, useQuestions, resolveDifficulty } from '../data/useQuestions.js';
import {
  MAX_DAILY_STEPS,
  readName,
  saveName,
  readAllProgress,
  readDailyState,
  readDailyStepSession,
  saveDailyStepSession,
  clearDailyStepAnswers,
  markDailyOnboarded,
  saveDailyGoal,
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
    text: 'Choisis ton rythme (1, 3 ou 5 questions par étape) et réalise jusqu’à 3 étapes par jour. Tu commences par des questions faciles et chaque étape se termine par une question Boss plus corsée !',
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
    highlight: '📈 Retrouve à tout moment tes chapitres validés et tes questions enregistrées dans « Ma progression ».',
    icon: 'progress',
  },
];

const GOAL_OPTIONS = [
  {
    count: 1,
    label: '1 question / étape',
    badge: 'Express',
    desc: '1 question ciblée par étape · Jusqu’à 3 étapes par jour',
  },
  {
    count: 3,
    label: '3 questions / étape',
    badge: 'Recommandé',
    desc: '2 questions + 1 question Boss · Jusqu’à 3 étapes par jour',
  },
  {
    count: 5,
    label: '5 questions / étape',
    badge: 'Complet',
    desc: '4 questions + 1 question Boss · Jusqu’à 3 étapes par jour',
  },
];

const NODE_PALETTES = [
  { bg: '#f08c1a', border: '#111318', shadow: '#8c4d06', badgeBg: '#f9a8d4' },
  { bg: '#38b27c', border: '#111318', shadow: '#1b6545', badgeBg: '#a7f3d0' },
  { bg: '#f28b66', border: '#111318', shadow: '#8f4428', badgeBg: '#fed7aa' },
  { bg: '#8b5cf6', border: '#111318', shadow: '#4c1d95', badgeBg: '#ddd6fe' },
  { bg: '#38bdf8', border: '#111318', shadow: '#0369a1', badgeBg: '#bae6fd' },
  { bg: '#ec4899', border: '#111318', shadow: '#831843', badgeBg: '#fbcfe8' },
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
  if (fullPool.length === 0) return { questions: [], answers: {} };

  const savedSession = readDailyStepSession(stepNumber, pseudo);
  // If questions were already assigned to this step, keep the exact same questions!
  if (Array.isArray(savedSession.questionIds) && savedSession.questionIds.length > 0) {
    const restored = savedSession.questionIds
      .map((qid) => byId.get(qid))
      .filter(Boolean);
    if (restored.length > 0) {
      const withBossFlag = restored.map((q, idx) => ({
        ...q,
        _isBoss: restored.length > 1 ? idx === restored.length - 1 : stepNumber % 4 === 0,
      }));
      return {
        questions: withBossFlag,
        answers: savedSession.answers || {},
      };
    }
  }

  // Otherwise, deterministically select questions for this (pseudo, stepNumber) and persist them immediately
  const seedBase = `${(pseudo || '').trim().toLowerCase()}:step-${stepNumber}`;
  const isBossStep = stepNumber % 4 === 0;
  const usedIds = new Set();

  // Exclude questions already assigned to previous steps so steps don't repeat
  for (let prev = 1; prev < stepNumber; prev++) {
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

  if (count === 1) {
    let candidates;
    if (isBossStep) {
      candidates = fullPool.filter((q) => q.difficulty >= 2);
    } else if (stepNumber <= 3) {
      candidates = fullPool.filter((q) => q.difficulty === 1);
    } else {
      candidates = fullPool.filter((q) => q.difficulty <= 2);
    }
    if (candidates.length === 0) candidates = fullPool;
    const picked = pickFrom(candidates, 1, 'single');
    const finalQuestions = picked.map((q) => ({ ...q, _isBoss: isBossStep }));
    const questionIds = finalQuestions.map((q) => q.id);
    saveDailyStepSession(stepNumber, { questionIds, answers: savedSession.answers || {} }, pseudo);
    return { questions: finalQuestions, answers: savedSession.answers || {} };
  }

  const regularNeeded = Math.max(1, count - 1);
  let regularCandidates;
  let bossCandidates;

  if (isBossStep) {
    regularCandidates = fullPool.filter((q) => q.difficulty >= 2);
    if (regularCandidates.length < regularNeeded) regularCandidates = fullPool;
    bossCandidates = fullPool.filter((q) => q.difficulty === 3);
    if (bossCandidates.length === 0) bossCandidates = fullPool.filter((q) => q.difficulty >= 2);
  } else if (stepNumber <= 3) {
    regularCandidates = fullPool.filter((q) => q.difficulty === 1);
    if (regularCandidates.length < regularNeeded) {
      regularCandidates = [
        ...regularCandidates,
        ...fullPool.filter((q) => q.difficulty === 2),
      ];
    }
    bossCandidates = fullPool.filter((q) => q.difficulty >= 2);
  } else if (stepNumber <= 7) {
    regularCandidates = fullPool.filter((q) => q.difficulty <= 2);
    bossCandidates = fullPool.filter((q) => q.difficulty === 3);
    if (bossCandidates.length === 0) bossCandidates = fullPool.filter((q) => q.difficulty >= 2);
  } else {
    regularCandidates = fullPool.filter((q) => q.difficulty === 2);
    if (regularCandidates.length < regularNeeded) {
      regularCandidates = fullPool.filter((q) => q.difficulty <= 2);
    }
    bossCandidates = fullPool.filter((q) => q.difficulty === 3);
    if (bossCandidates.length === 0) bossCandidates = fullPool.filter((q) => q.difficulty >= 2);
  }

  let regulars = pickFrom(regularCandidates, regularNeeded, 'reg');
  for (const q of regulars) usedIds.add(q.id);
  if (regulars.length < regularNeeded) {
    const extra = pickFrom(fullPool, regularNeeded - regulars.length, 'extra');
    for (const q of extra) usedIds.add(q.id);
    regulars = [...regulars, ...extra];
  }

  let bossArr = pickFrom(bossCandidates, 1, 'boss');
  if (bossArr.length === 0) {
    bossArr = pickFrom(fullPool, 1, 'boss-fallback');
  }

  const finalQuestions = [
    ...regulars.map((q) => ({ ...q, _isBoss: false })),
    ...bossArr.map((q) => ({ ...q, _isBoss: true })),
  ];
  const questionIds = finalQuestions.map((q) => q.id);
  saveDailyStepSession(stepNumber, { questionIds, answers: savedSession.answers || {} }, pseudo);

  return {
    questions: finalQuestions,
    answers: savedSession.answers || {},
  };
}

function StepNodeArt({ step, isBossNode }) {
  if (isBossNode) {
    return <span className="daily-node-quiz-text">Quiz</span>;
  }
  const mod = (step - 1) % 5;
  if (mod === 0) {
    return (
      <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <rect x="6" y="7" width="24" height="20" rx="4" fill="#1e2430" stroke="#0d1017" strokeWidth="2" />
        <circle cx="14" cy="17" r="4.5" fill="#4b5563" stroke="#9ca3af" strokeWidth="1.5" />
        <circle cx="23" cy="15" r="3" fill="#60a5fa" />
        <path d="M12 27l-2 4h16l-2-4" stroke="#1e2430" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (mod === 1) {
    return (
      <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <rect x="8" y="8" width="20" height="14" rx="2" fill="#111827" stroke="#374151" strokeWidth="1.8" />
        <path d="M13 15h4l2-3 2 6 2-3h3" stroke="#34d399" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 22h26l-2 5H7l-2-5Z" fill="#9ca3af" stroke="#1f2937" strokeWidth="1.5" />
      </svg>
    );
  }
  if (mod === 2) {
    return (
      <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path d="M18 6L6 13h24L18 6Z" fill="#e5e7eb" stroke="#374151" strokeWidth="1.6" />
        <rect x="9" y="13" width="3.5" height="12" fill="#d1d5db" stroke="#374151" strokeWidth="1.2" />
        <rect x="16.25" y="13" width="3.5" height="12" fill="#d1d5db" stroke="#374151" strokeWidth="1.2" />
        <rect x="23.5" y="13" width="3.5" height="12" fill="#d1d5db" stroke="#374151" strokeWidth="1.2" />
        <rect x="6" y="25" width="24" height="3.5" rx="1" fill="#9ca3af" stroke="#374151" strokeWidth="1.4" />
      </svg>
    );
  }
  if (mod === 3) {
    return (
      <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
        <path
          d="M11 9a3.5 3.5 0 0 0-3.2 4.8A3.5 3.5 0 0 0 10 20l6 6a3.5 3.5 0 0 0 6.2 2A3.5 3.5 0 0 0 27 23a3.5 3.5 0 0 0-2-6.2l-6-6A3.5 3.5 0 0 0 11 9Z"
          fill="#fef3c7"
          stroke="#1f2937"
          strokeWidth="2"
        />
      </svg>
    );
  }
  return (
    <svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="10" fill="#1e293b" stroke="#f8fafc" strokeWidth="2" />
      <circle cx="18" cy="18" r="4.5" fill="#38bdf8" />
    </svg>
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
  const [pickingGoal, setPickingGoal] = useState(false);
  const [selectedGoalDraft, setSelectedGoalDraft] = useState(3);
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
      if (nextDaily.goal) setSelectedGoalDraft(nextDaily.goal);
    });
  }, []);

  // Automatically scroll to the active step node when the path is displayed
  useEffect(() => {
    if (!editingPseudo && !showingSlides && dailyState.goal && !pickingGoal && !activeSession) {
      const t = setTimeout(() => {
        currentStepNodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [editingPseudo, showingSlides, dailyState.goal, dailyState.currentStep, pickingGoal, activeSession]);

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
    if (!st.goal) {
      setSelectedGoalDraft(3);
    }
  };

  const finishOnboardingSlides = () => {
    markDailyOnboarded(pseudo);
    const st = readDailyState(pseudo);
    setDailyState(st);
    setShowingSlides(false);
    if (!st.goal) {
      setSelectedGoalDraft(3);
      setPickingGoal(true);
    }
  };

  const handleGoalSubmit = (goalVal) => {
    const chosen = Number(goalVal) || selectedGoalDraft || 3;
    saveDailyGoal(chosen, pseudo);
    setDailyState(readDailyState(pseudo));
    setPickingGoal(false);
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
    const goalCount = dailyState.goal || 3;
    const isBossStep = stepNumber % 4 === 0;
    const { questions, answers } = resolveStepQuestionsAndAnswers(
      stepNumber,
      goalCount,
      pseudo,
      byChapter,
      allProgress
    );
    if (questions.length === 0) return;
    setActiveSession({
      id: Date.now(),
      stepNumber,
      isBossStep,
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

    return { width, height, nodes, unlockedPathD, lockedPathD };
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
                {dailyState.goal ? 'Accéder à mon parcours' : 'Choisir mon rythme'}{' '}
                <Icon name="arrow" size={18} />
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

  // 2) Daily Goal selection (1, 3 or 5 questions per step)
  if (!dailyState.goal || pickingGoal) {
    return (
      <section className="home daily-onboarding">
        <motion.div
          className="home-panel daily-goal-card"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="daily-goal-kicker">Rythme par étape · {pseudo}</span>
          <h2>Combien de questions veux-tu par étape ?</h2>
          <p className="daily-goal-sub">
            Tu peux réaliser jusqu’à <strong>3 étapes par jour</strong>. À la fin de chaque étape, tu obtiens <strong>1★</strong> de base, <strong>2★</strong> si &gt; 60 % de bonnes réponses et <strong>3★</strong> si &gt; 90 % !
          </p>

          <div className="daily-goal-options" role="radiogroup" aria-label="Nombre de questions par étape">
            {GOAL_OPTIONS.map((opt) => {
              const active = (selectedGoalDraft || dailyState.goal || 3) === opt.count;
              return (
                <button
                  key={opt.count}
                  type="button"
                  className={`daily-goal-option ${active ? 'is-selected' : ''}`}
                  onClick={() => {
                    setSelectedGoalDraft(opt.count);
                    handleGoalSubmit(opt.count);
                  }}
                >
                  <div className="daily-goal-option-top">
                    <span className="daily-goal-option-title">{opt.label}</span>
                    <span className="daily-goal-option-badge">{opt.badge}</span>
                  </div>
                  <span className="daily-goal-option-desc">{opt.desc}</span>
                </button>
              );
            })}
          </div>

          {dailyState.goal && (
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setPickingGoal(false)}
              >
                Retour au parcours
              </button>
            </div>
          )}
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
    const { stepNumber, isBossStep, questions, initialAnswers } = activeSession;
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
            numero: `Étape ${stepNumber}`,
            theme: 'mixte',
            backHref: '#/',
            titre: isBossStep
              ? `Défi Boss — Étape ${stepNumber}`
              : `Parcours du jour — Étape ${stepNumber}`,
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
        <div className="daily-hud-pill daily-hud-left">
          <span className="daily-hud-item" title="Jours d’activité consécutifs">
            <svg className="daily-flame-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <defs>
                <linearGradient id="flameGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ff8fab" />
                  <stop offset="100%" stopColor="#fb5607" />
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

          <button
            type="button"
            className={`daily-hud-item daily-hud-flag-btn ${dailyStepsReached ? 'is-done' : ''}`}
            onClick={() => {
              setSelectedGoalDraft(goal);
              setPickingGoal(true);
            }}
            title={`Étapes du jour (${stepsToday}/${MAX_DAILY_STEPS}) · Rythme : ${goal} question${goal > 1 ? 's' : ''}/étape (cliquer pour modifier)`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 21V4" />
              <path d="M5 4h13l-2.5 4.5L18 13H5" />
            </svg>
            <b>{stepsToday}/{MAX_DAILY_STEPS}</b>
            <span className="daily-hud-q-tag">{goal}Q</span>
          </button>
        </div>

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
                fill="#facc15"
                stroke="#fef08a"
                strokeWidth="1.2"
                d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z"
              />
            </svg>
            <b>{dailyState.totalStars}</b>
          </div>
        </div>
      </div>

      {limitNotice && (
        <div className="daily-limit-banner" role="status">
          <span>
            🎉 Tu as terminé tes <strong>{MAX_DAILY_STEPS} étapes du jour</strong> ! Reviens demain pour débloquer la suite, ou clique sur une étape déjà validée pour améliorer tes étoiles (★★ / ★★★).
          </span>
          <button type="button" className="pseudo-change-btn" onClick={() => setLimitNotice(false)}>
            Fermer
          </button>
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
              <linearGradient id="goldRoadGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fde047" />
                <stop offset="50%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#ca8a04" />
              </linearGradient>
              <filter id="roadGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000000" floodOpacity="0.55" />
              </filter>
            </defs>

            {/* Locked future trail (smooth dark track + golden pebbles) */}
            {pathLayout.lockedPathD && (
              <g>
                <path
                  d={pathLayout.lockedPathD}
                  fill="none"
                  stroke="rgba(15, 20, 30, 0.78)"
                  strokeWidth="16"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pathLayout.lockedPathD}
                  fill="none"
                  stroke="rgba(250, 204, 21, 0.34)"
                  strokeWidth="6.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1 18"
                />
              </g>
            )}

            {/* Unlocked golden ribbon trail (casing + gradient road + glossy center line) */}
            {pathLayout.unlockedPathD && (
              <g filter="url(#roadGlow)">
                <path
                  d={pathLayout.unlockedPathD}
                  fill="none"
                  stroke="#0b0e15"
                  strokeWidth="20"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pathLayout.unlockedPathD}
                  fill="none"
                  stroke="url(#goldRoadGrad)"
                  strokeWidth="12.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pathLayout.unlockedPathD}
                  fill="none"
                  stroke="rgba(254, 249, 195, 0.65)"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}
          </svg>

          {/* Decorative floating illustrations along the path */}
          {pathLayout.nodes[1] && (
            <div
              className="daily-deco daily-deco-book"
              style={{ top: pathLayout.nodes[1].y + 8, left: '3%' }}
              aria-hidden="true"
            >
              <svg width="92" height="72" viewBox="0 0 110 86" fill="none">
                <path d="M18 14l3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" fill="#f8fafc" />
                <path d="M35 4l2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z" fill="#e2e8f0" />
                <path d="M14 50L50 32l38 14-36 22L14 50Z" fill="#2563eb" stroke="#0f172a" strokeWidth="3" />
                <path d="M16 46C28 36 40 34 52 38L88 26c-10 12-22 22-36 30-12-4-24-2-36-10Z" fill="#ffffff" stroke="#0f172a" strokeWidth="2.6" />
                <path d="M52 38v20" stroke="#94a3b8" strokeWidth="2" />
              </svg>
            </div>
          )}

          {pathLayout.nodes[2] && (
            <div
              className="daily-deco daily-deco-pencil"
              style={{ top: pathLayout.nodes[2].y - 80, right: '1%' }}
              aria-hidden="true"
            >
              <svg width="98" height="90" viewBox="0 0 110 100" fill="none">
                <circle cx="80" cy="22" r="7" fill="#eab308" stroke="#0f172a" strokeWidth="2" />
                <g transform="rotate(-25 56 42)">
                  <rect x="46" y="18" width="16" height="42" rx="2" fill="#facc15" stroke="#0f172a" strokeWidth="2.5" />
                  <line x1="51" y1="18" x2="51" y2="60" stroke="#0f172a" strokeWidth="1.8" />
                  <line x1="57" y1="18" x2="57" y2="60" stroke="#0f172a" strokeWidth="1.8" />
                  <path d="M46 18l8-14 8 14H46Z" fill="#fed7aa" stroke="#0f172a" strokeWidth="2.5" />
                  <path d="M51 9l3-5 3 5h-6Z" fill="#0f172a" />
                  <rect x="46" y="60" width="16" height="9" rx="2" fill="#ef4444" stroke="#0f172a" strokeWidth="2.5" />
                </g>
                <path
                  d="M36 82h64c0-10-8-17-18-16-4-9-16-13-25-7-8-3-17 3-17 12-4 1-6 5-4 11Z"
                  fill="#ffffff"
                  stroke="#0f172a"
                  strokeWidth="2.5"
                />
              </svg>
            </div>
          )}

          {/* Path Step Nodes */}
          {pathLayout.nodes.map((node) => {
            const { step, x, y, isBoss } = node;
            const stars = dailyState.steps[step] || 0;
            const isCompleted = stars > 0;
            const isCurrent = step === dailyState.currentStep;
            const isUnlocked = step <= dailyState.currentStep;
            const palette = NODE_PALETTES[(step - 1) % NODE_PALETTES.length];
            const leftPct = `${(x / pathLayout.width) * 100}%`;

            return (
              <div
                key={step}
                ref={isCurrent ? currentStepNodeRef : undefined}
                className={`daily-node-wrap ${isUnlocked ? 'is-unlocked' : 'is-locked'} ${isCurrent ? 'is-current' : ''} ${isBoss ? 'is-boss' : ''}`}
                style={{ left: leftPct, top: y }}
              >
                {/* 3-star arch above every step node (empty slots before completion, gold when earned) */}
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
                          fill={lit ? '#facc15' : 'rgba(18, 22, 31, 0.88)'}
                          stroke={lit ? '#111318' : 'rgba(255, 255, 255, 0.52)'}
                          strokeWidth="2.1"
                          strokeLinejoin="round"
                        />
                      </svg>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className={`daily-node-btn ${isBoss ? 'daily-node-boss' : ''} ${!isUnlocked ? 'daily-node-locked' : ''}`}
                  style={
                    isUnlocked && !isBoss
                      ? {
                          '--node-bg': palette.bg,
                          '--node-shadow': palette.shadow,
                        }
                      : undefined
                  }
                  disabled={!isUnlocked}
                  onClick={() => launchStep(step)}
                  aria-label={
                    isUnlocked
                      ? `${isBoss ? 'Défi Boss' : 'Étape'} ${step}${isCompleted ? ` (${stars} étoiles)` : ' — Lancer'}`
                      : `Étape ${step} verrouillée`
                  }
                >
                  {isUnlocked ? (
                    <>
                      <StepNodeArt step={step} isBossNode={isBoss} />
                      {!isBoss && <span className="daily-node-num">{step}</span>}
                    </>
                  ) : (
                    <span className="daily-node-locked-num">{step}</span>
                  )}
                </button>

                {/* Side badges */}
                {isUnlocked && !isBoss && (
                  <div
                    className={`daily-side-badges ${x > 180 ? 'on-left' : 'on-right'}`}
                    aria-hidden="true"
                  >
                    <span
                      className="daily-side-badge"
                      style={{ '--badge-tint': palette.badgeBg }}
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
