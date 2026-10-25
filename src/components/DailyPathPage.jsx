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

function PathDecoArt({ kind }) {
  // Simplified, 100% vector musculoskeletal radiology icons (zero white border, zero pixel aliasing)
  // Colors: Deep Navy (#0f3562), Medium Blue (#0e76bc), Sky Cyan (#30ace4), Warm Gold (#f8c616)
  switch (kind) {
    case 'shoulder-heart':
      return (
        <svg viewBox="0 0 120 110" width="100%" height="100%" fill="none" aria-hidden="true">
          <defs>
            <clipPath id="heartClipL">
              <rect x="0" y="0" width="60" height="110" />
            </clipPath>
            <clipPath id="heartClipR">
              <rect x="60" y="0" width="60" height="110" />
            </clipPath>
          </defs>
          <path
            d="M60 98 C60 98 10 68 10 34 C10 16 25 6 41 6 C51 6 57 12 60 18 C63 12 69 6 79 6 C95 6 110 16 110 34 C110 68 60 98 60 98 Z"
            fill="#0e76bc"
            clipPath="url(#heartClipL)"
          />
          <path
            d="M60 98 C60 98 10 68 10 34 C10 16 25 6 41 6 C51 6 57 12 60 18 C63 12 69 6 79 6 C95 6 110 16 110 34 C110 68 60 98 60 98 Z"
            fill="#0f3562"
            clipPath="url(#heartClipR)"
          />
          {/* Simplified clavicle */}
          <path
            d="M56 30 C70 25 88 26 107 30"
            stroke="#f8c616"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Simplified scapula */}
          <path
            d="M47 36 C52 33 60 36 66 40 C72 36 77 33 81 38 C86 45 84 68 78 76 C74 80 69 72 64 62 C60 55 55 52 50 48 C45 45 43 39 47 36 Z"
            fill="#f8c616"
          />
          {/* Simplified humerus head & shaft */}
          <circle cx="48" cy="51" r="10" fill="#f8c616" />
          <path d="M46 56 L42 86" stroke="#f8c616" strokeWidth="10" strokeLinecap="round" />
        </svg>
      );

    case 'ribcage':
      return (
        <svg viewBox="0 0 120 110" width="100%" height="100%" fill="none" aria-hidden="true">
          {/* Upper ribs (navy) */}
          <path d="M48 32 C32 32 30 16 46 14" stroke="#0f3562" strokeWidth="7" strokeLinecap="round" />
          <path d="M72 32 C88 32 90 16 74 14" stroke="#0f3562" strokeWidth="7" strokeLinecap="round" />
          {/* Middle ribs (cyan) */}
          <path d="M48 45 C24 47 22 28 32 25" stroke="#30ace4" strokeWidth="7.5" strokeLinecap="round" />
          <path d="M72 45 C96 47 98 28 88 25" stroke="#30ace4" strokeWidth="7.5" strokeLinecap="round" />
          {/* Lower ribs (navy) */}
          <path d="M49 58 C24 64 20 46 26 40" stroke="#0f3562" strokeWidth="7.5" strokeLinecap="round" />
          <path d="M71 58 C96 64 100 46 94 40" stroke="#0f3562" strokeWidth="7.5" strokeLinecap="round" />
          <path d="M52 68 C28 80 20 64 25 56" stroke="#0f3562" strokeWidth="7.5" strokeLinecap="round" />
          <path d="M68 68 C92 80 100 64 95 56" stroke="#0f3562" strokeWidth="7.5" strokeLinecap="round" />
          <path d="M54 74 C36 94 24 84 27 72" stroke="#0f3562" strokeWidth="7.5" strokeLinecap="round" />
          <path d="M66 74 C84 94 96 84 93 72" stroke="#0f3562" strokeWidth="7.5" strokeLinecap="round" />
          {/* Clavicles (cyan) */}
          <path d="M52 22 C40 16 28 14 18 17" stroke="#30ace4" strokeWidth="7" strokeLinecap="round" />
          <path d="M68 22 C80 16 92 14 102 17" stroke="#30ace4" strokeWidth="7" strokeLinecap="round" />
          {/* Sternum (gold) */}
          <path
            d="M52 18 H68 L66 32 L67 62 L60 76 L53 62 L54 32 Z"
            fill="#f8c616"
            stroke="#f8c616"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'knee-angle':
      return (
        <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" aria-hidden="true">
          {/* Blue leg contour */}
          <path
            d="M52 10 L88 32 L54 60 C48 65 48 72 52 80 L58 110 H24 L16 68 C13 55 16 44 26 35 L52 10 Z"
            fill="#0e76bc"
          />
          {/* Gold femur */}
          <path d="M66 20 L40 50" stroke="#f8c616" strokeWidth="14" strokeLinecap="round" />
          <circle cx="37" cy="52" r="11" fill="#f8c616" />
          {/* Gold patella */}
          <ellipse cx="19" cy="54" rx="4.5" ry="7.5" fill="#f8c616" />
          {/* Gold tibia & fibula */}
          <path d="M33 69 L38 106" stroke="#f8c616" strokeWidth="12" strokeLinecap="round" />
          <path d="M46 78 L49 106" stroke="#f8c616" strokeWidth="6" strokeLinecap="round" />
          {/* Simplified flexion angle lines */}
          <path d="M98 38 L58 66 L96 96" stroke="#f8c616" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M76 53 A24 24 0 0 1 76 81" stroke="#30ace4" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M62 66 H96" stroke="#30ace4" strokeWidth="4" strokeLinecap="round" strokeDasharray="8 6" />
        </svg>
      );

    case 'hand-xray':
      return (
        <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" aria-hidden="true">
          {/* Viewfinder frame corners */}
          <path d="M12 30 V16 C12 13 14 11 17 11 H31" stroke="#30ace4" strokeWidth="6" strokeLinecap="round" />
          <path d="M89 11 H103 C106 11 108 13 108 16 V30" stroke="#0f3562" strokeWidth="6" strokeLinecap="round" />
          <path d="M12 90 V104 C12 107 14 109 17 109 H31" stroke="#30ace4" strokeWidth="6" strokeLinecap="round" />
          <path d="M89 109 H103 C106 109 108 107 108 104 V90" stroke="#30ace4" strokeWidth="6" strokeLinecap="round" />
          {/* Simplified golden hand silhouette */}
          <path
            d="M48 108 V92 L35 74 L26 54 C24 49 29 45 33 49 L44 62 L42 26 C42 20 50 20 51 26 L55 52 L58 18 C58 12 67 12 67 18 L66 52 L73 24 C74 18 82 20 81 26 L77 56 L86 36 C88 31 95 34 93 40 L82 76 L76 92 V108 H48 Z"
            fill="#f8c616"
          />
          {/* Simplified blue carpal & metacarpal bones */}
          <ellipse cx="61" cy="86" rx="12" ry="7" fill="#0e76bc" />
          <path d="M33 54 L47 76" stroke="#0f3562" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M47 28 L53 74" stroke="#0e76bc" strokeWidth="5" strokeLinecap="round" />
          <path d="M62 20 L61 73" stroke="#0e76bc" strokeWidth="5" strokeLinecap="round" />
          <path d="M76 28 L68 74" stroke="#0e76bc" strokeWidth="5" strokeLinecap="round" />
          <path d="M88 40 L74 76" stroke="#0f3562" strokeWidth="4.5" strokeLinecap="round" />
        </svg>
      );

    case 'pelvis-emblem':
      return (
        <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" aria-hidden="true">
          <circle cx="60" cy="60" r="48" fill="#0f3562" stroke="#f8c616" strokeWidth="5" />
          {/* Iliac wings (cyan) */}
          <path
            d="M48 48 C36 32 20 38 24 56 C27 68 38 72 48 68 Z"
            fill="#30ace4"
          />
          <path
            d="M72 48 C84 32 100 38 96 56 C93 68 82 72 72 68 Z"
            fill="#30ace4"
          />
          {/* Sacrum & femoral heads (gold) */}
          <path d="M52 44 H68 L64 68 L60 76 L56 68 Z" fill="#f8c616" />
          <circle cx="42" cy="76" r="6" fill="#f8c616" />
          <circle cx="78" cy="76" r="6" fill="#f8c616" />
          <path d="M40 80 L34 94" stroke="#f8c616" strokeWidth="6" strokeLinecap="round" />
          <path d="M80 80 L86 94" stroke="#f8c616" strokeWidth="6" strokeLinecap="round" />
        </svg>
      );

    case 'knee-cross':
      return (
        <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" aria-hidden="true">
          {/* Medical cross background */}
          <path
            d="M42 14 H78 V42 H106 V78 H78 V106 H42 V78 H14 V42 H42 V14 Z"
            fill="#0e76bc"
            stroke="#0f3562"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          {/* Gold femur & tibia inside cross */}
          <path d="M60 22 V46" stroke="#f8c616" strokeWidth="14" strokeLinecap="round" />
          <circle cx="53" cy="50" r="8" fill="#f8c616" />
          <circle cx="67" cy="50" r="8" fill="#f8c616" />
          <path d="M48 62 H72" stroke="#30ace4" strokeWidth="4.5" strokeLinecap="round" />
          <path d="M58 68 V98" stroke="#f8c616" strokeWidth="13" strokeLinecap="round" />
          <path d="M70 72 V96" stroke="#f8c616" strokeWidth="5.5" strokeLinecap="round" />
        </svg>
      );

    case 'spine-emblem':
      return (
        <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" aria-hidden="true">
          <circle cx="60" cy="60" r="46" fill="#0f3562" stroke="#30ace4" strokeWidth="5" />
          <path d="M30 60 A30 30 0 0 1 90 60" stroke="#f8c616" strokeWidth="4" strokeLinecap="round" opacity="0.5" />
          {[28, 41, 54, 67, 80].map((cy, idx) => (
            <g key={cy}>
              <rect
                x={46 - (idx % 2) * 2}
                y={cy}
                width={28 + (idx % 2) * 4}
                height="8"
                rx="4"
                fill={idx % 2 === 0 ? '#f8c616' : '#30ace4'}
              />
            </g>
          ))}
        </svg>
      );

    default:
      return (
        <svg viewBox="0 0 120 120" width="100%" height="100%" fill="none" aria-hidden="true">
          {/* Viewfinder + crossed bones */}
          <path d="M16 34 V18 H32" stroke="#0f3562" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M88 18 H104 V34" stroke="#30ace4" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M16 86 V102 H32" stroke="#30ace4" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M88 102 H104 V86" stroke="#0f3562" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M34 34 L86 86" stroke="#0e76bc" strokeWidth="12" strokeLinecap="round" />
          <circle cx="31" cy="31" r="7" fill="#0e76bc" />
          <circle cx="89" cy="89" r="7" fill="#0e76bc" />
          <path d="M86 34 L34 86" stroke="#f8c616" strokeWidth="12" strokeLinecap="round" />
          <circle cx="89" cy="31" r="7" fill="#f8c616" />
          <circle cx="31" cy="89" r="7" fill="#f8c616" />
        </svg>
      );
  }
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

    // Balanced background decorations placed on the opposite side of the step nodes
    // so they visually balance the zig-zag page layout and stay far (>150px) from every step button.
    const kindSequence = [
      'shoulder-heart',
      'ribcage',
      'knee-angle',
      'hand-xray',
      'pelvis-emblem',
      'knee-cross',
      'spine-emblem',
      'bones-frame',
    ];
    const sizeCycle = [76, 64, 82, 68, 74, 62];
    const rotCycle = [-8, 7, -6, 9, -7, 6];

    const decorations = [];
    // 1) Bottom-left balance near the start (Step 1 is centered at x=176, Step 2 goes right to x=262, so bottom-left x=42 is wide open)
    if (nodes[0]) {
      decorations.push({
        id: 'deco-start',
        kind: kindSequence[0],
        x: 42,
        y: nodes[0].y - 36,
        size: 70,
        rotate: -7,
      });
    }

    // 2) For every off-center node (Steps 2, 4, 6, 8...), place a logo on the opposite side of the page
    //    (e.g. when node is at x=262 right, logo is at x=46 left -> 216px away from the button!)
    //    Plus an intermediate opposite-side logo between center/side transitions so left & right are evenly balanced.
    let decoIdx = 1;
    for (let i = 1; i < nodes.length; i++) {
      const curr = nodes[i];
      if (curr.x > 210) {
        // Node is on the right (x≈262) -> place background logo on the far left (x=46)
        decorations.push({
          id: `deco-node-${curr.step}`,
          kind: kindSequence[decoIdx % kindSequence.length],
          x: 46,
          y: curr.y + 8,
          size: sizeCycle[decoIdx % sizeCycle.length],
          rotate: rotCycle[decoIdx % rotCycle.length],
        });
        decoIdx++;
      } else if (curr.x < 150) {
        // Node is on the left (x≈94) -> place background logo on the far right (x=314)
        decorations.push({
          id: `deco-node-${curr.step}`,
          kind: kindSequence[decoIdx % kindSequence.length],
          x: 314,
          y: curr.y + 6,
          size: sizeCycle[decoIdx % sizeCycle.length],
          rotate: rotCycle[decoIdx % rotCycle.length],
        });
        decoIdx++;
      } else if (i < nodes.length - 1) {
        // Center node (Steps 3, 5, 7... at x≈178): place a smaller logo on the open side opposite the next step
        const next = nodes[i + 1];
        const openSideX = next.x < 180 ? 316 : 44;
        decorations.push({
          id: `deco-mid-${curr.step}`,
          kind: kindSequence[decoIdx % kindSequence.length],
          x: openSideX,
          y: curr.y - 34,
          size: 60,
          rotate: rotCycle[decoIdx % rotCycle.length],
        });
        decoIdx++;
      }
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
                  stroke="rgba(10, 14, 22, 0.9)"
                  strokeWidth="19"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pathLayout.lockedPathD}
                  fill="none"
                  stroke="rgba(250, 204, 21, 0.48)"
                  strokeWidth="7.5"
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
                  stroke="#080b11"
                  strokeWidth="23"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pathLayout.unlockedPathD}
                  fill="none"
                  stroke="url(#goldRoadGrad)"
                  strokeWidth="14.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d={pathLayout.unlockedPathD}
                  fill="none"
                  stroke="rgba(254, 249, 195, 0.78)"
                  strokeWidth="3.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}
          </svg>

          {/* Decorative musculoskeletal radiology logos in the background */}
          {pathLayout.decorations.map((deco) => (
            <div
              key={deco.id}
              className="daily-deco"
              style={{
                top: deco.y,
                left: `${(deco.x / pathLayout.width) * 100}%`,
                width: deco.size,
                height: deco.size,
                '--deco-rot': `${deco.rotate}deg`,
              }}
              aria-hidden="true"
            >
              <PathDecoArt kind={deco.kind} />
            </div>
          ))}

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
