import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icons.jsx';
import {
  readName,
  saveName,
  readChapterProgress,
  writeChapterProgress,
  clearChapterProgress,
  writeQuestionAnswer,
  recordQuizAttempt,
  readBookmarks,
  toggleQuestionBookmark,
  subscribePlayer,
  syncProgressFromServer,
} from '../data/player.js';
import { useQuestions, imageSrc, resolveDifficulty } from '../data/useQuestions.js';
import { submitQuestionReport } from '../data/reports.js';

// ---------- helpers ----------
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const seeded = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// Items are mixed, but always in the same order for a given question (stable across reloads).
const mixItems = (q) => {
  const items = [...q.items];
  const rnd = seeded(hash(q.id));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};
const isPerfect = (q, picked) => {
  const good = q.items.filter((i) => i.correct).map((i) => i.id).sort().join();
  return good === [...picked].sort().join();
};
const shuffleList = (list) => {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

// Loads the live questions (editable from the admin page), then plays them.
export default function ChapterQuiz({ chapter }) {
  const { key, data, initialIdx, randomCount } = chapter;
  const { byChapter, loading } = useQuestions();
  const [pseudo, setPseudo] = useState(readName);
  const [draft, setDraft] = useState('');
  const [drawSeed, setDrawSeed] = useState(0);
  const questions = byChapter[key] || [];
  const backHref = `#/${data.chapitre.theme || 'epaule'}`;

  useEffect(() => {
    syncProgressFromServer();
    return subscribePlayer(() => setPseudo(readName()));
  }, []);

  const activeQuestions = useMemo(() => {
    if (!randomCount || questions.length === 0) return questions;
    const progress = readChapterProgress(key);
    const ans = progress?.answers || {};
    const unanswered = shuffleList(questions.filter((q) => !ans[q.id]));
    const pool =
      unanswered.length > 0
        ? unanswered.slice(0, Math.min(randomCount, unanswered.length))
        : shuffleList(questions).slice(0, Math.min(randomCount, questions.length));
    return pool.map((q) => ({ ...q, _chapterKey: key, _meta: data.chapitre }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, randomCount, key, data.chapitre, drawSeed]);

  if (!pseudo) {
    const onSubmit = (e) => {
      e.preventDefault();
      const clean = draft.trim().replace(/\s+/g, ' ');
      if (!clean) return;
      saveName(clean);
      setPseudo(clean);
    };
    return (
      <div className="cq">
        <a href={backHref} className="cq-back">← Chapitres</a>
        <form className="cq-card name-step" onSubmit={onSubmit} style={{ marginTop: 14 }}>
          <label htmlFor="quiz-pseudo">Choisis un pseudo pour enregistrer ta progression</label>
          <input
            id="quiz-pseudo"
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
          <button className="btn" type="submit" disabled={!draft.trim()}>
            Commencer le quiz <Icon name="arrow" size={18} />
          </button>
        </form>
      </div>
    );
  }

  if (loading) {
    return <div className="cq"><p className="cq-loading" role="status">Chargement des questions…</p></div>;
  }
  if (questions.length === 0) {
    return (
      <div className="cq">
        <a href={backHref} className="cq-back">← Chapitres</a>
        <p className="cq-loading">Ce chapitre ne contient pas encore de questions pour le moment.</p>
      </div>
    );
  }
  return (
    <QuizPlayer
      key={`${pseudo}:${key}:${randomCount || 'all'}:${drawSeed}`}
      chapterKey={key}
      meta={data.chapitre}
      questions={activeQuestions}
      initialIdx={initialIdx}
      randomMode={Boolean(randomCount)}
      onRestart={
        randomCount
          ? () => {
              setDrawSeed((s) => s + 1);
              window.scrollTo(0, 0);
            }
          : null
      }
    />
  );
}

// `preview` (admin): no saved progress and no result sent to the database.
// `randomMode`: plays a custom random selection of questions across chapters.
export function QuizPlayer({
  chapterKey: key,
  meta,
  questions: rawQuestions,
  preview = false,
  randomMode = false,
  onRestart = null,
  backLabel = '← Chapitres',
  initialIdx = null,
  initialAnswers = null,
  onAnswersChange = null,
  onQuestionValidated = null,
  onQuizCompleted = null,
  dailyMode = null,
}) {
  const saved = useMemo(
    () =>
      preview || randomMode
        ? { answers: initialAnswers && typeof initialAnswers === 'object' ? initialAnswers : {}, sent: false, historyRecorded: false }
        : readChapterProgress(key),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, preview, randomMode]
  );

  const questions = useMemo(() => rawQuestions.map((q) => ({ ...q, shown: mixItems(q) })), [rawQuestions]);

  // If the quiz was already completed before this page load, do not record another entry on reload.
  const alreadyCompletedOnMount = useMemo(() => {
    if (preview) return false;
    const savedAns = saved.answers || {};
    const allAnswered =
      rawQuestions.length > 0 &&
      rawQuestions.every((q) => Array.isArray(savedAns[q.id]) && savedAns[q.id].length > 0);
    if (randomMode) return Boolean(dailyMode && allAnswered);
    if (saved.sent || saved.historyRecorded) return true;
    return allAnswered;
  }, [preview, randomMode, dailyMode, saved, rawQuestions]);

  const [answers, setAnswers] = useState(saved.answers || {}); // qid -> picked item ids
  const [sent, setSent] = useState(Boolean(alreadyCompletedOnMount));
  const [historyRecorded, setHistoryRecorded] = useState(Boolean(alreadyCompletedOnMount));
  const [bookmarks, setBookmarks] = useState(() => (preview ? {} : readBookmarks()));
  const [picked, setPicked] = useState([]);
  const [showCorrection, setShowCorrection] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [zoom, setZoom] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState('');
  const [reportStatus, setReportStatus] = useState('idle'); // idle | sending | sent
  const [reportError, setReportError] = useState('');
  const topRef = useRef(null);
  const recordedHistoryRef = useRef(Boolean(alreadyCompletedOnMount));
  const wasRestartedRef = useRef(false);

  const resetReportBox = () => {
    setReportOpen(false);
    setReportText('');
    setReportStatus('idle');
    setReportError('');
  };

  const firstOpen = (l, a) => { const i = l.findIndex((q) => !a[q.id]); return i === -1 ? l.length : i; };
  const [idx, setIdx] = useState(() => {
    if (Number.isInteger(initialIdx) && initialIdx >= 0 && initialIdx < questions.length) {
      return initialIdx;
    }
    return firstOpen(questions, answers);
  });

  // Sync from server on mount so answers from another device are merged in.
  useEffect(() => {
    if (preview || randomMode) return undefined;
    syncProgressFromServer();
    return subscribePlayer(() => {
      setBookmarks(readBookmarks());
      const latest = readChapterProgress(key);
      const latestAns = latest.answers || {};
      if (Object.keys(latestAns).length === 0 && !latest.sent) {
        setAnswers({});
        setSent(false);
        setHistoryRecorded(false);
        recordedHistoryRef.current = false;
      } else {
        setAnswers((prev) => ({ ...latestAns, ...prev }));
        if (latest.sent || latest.historyRecorded) {
          setSent(true);
          setHistoryRecorded(true);
          recordedHistoryRef.current = true;
        }
      }
    });
  }, [key, preview, randomMode]);

  useEffect(() => {
    if (!preview && !randomMode) {
      writeChapterProgress(key, { answers, sent, historyRecorded });
    }
  }, [key, preview, randomMode, answers, sent, historyRecorded]);

  const q = questions[idx];
  const qKey = q?._chapterKey || key;
  const qMeta = q?._meta || meta;
  const validated = q ? answers[q.id] : null;
  const finished = idx >= questions.length;

  const answeredAll = questions.filter((x) => answers[x.id]);
  const score = answeredAll.filter((x) => isPerfect(x, answers[x.id])).length;
  const total = questions.length;

  const goTo = (i) => {
    setIdx(i);
    setPicked([]);
    setShowCorrection(Boolean(reviewing && answers[questions[i]?.id]));
    resetReportBox();
  };

  const toggle = (id) => {
    if (validated) return;
    if (q.type === 'QCU') setPicked([id]);
    else setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const validate = () => {
    if (!picked.length) return;
    const wasAlreadyAnswered = Boolean(answers[q.id]);
    setShowCorrection(false);
    const nextAns = { ...answers, [q.id]: picked };
    setAnswers(nextAns);
    if (typeof onAnswersChange === 'function') {
      onAnswersChange(nextAns);
    }
    if (randomMode && !preview) {
      writeQuestionAnswer(qKey, q.id, picked);
    }
    if (!wasAlreadyAnswered && !preview && typeof onQuestionValidated === 'function') {
      onQuestionValidated(q, picked, isPerfect(q, picked));
    }
  };

  const retryQuestion = () => {
    if (!q) return;
    const copy = { ...answers };
    delete copy[q.id];
    setAnswers(copy);
    if (typeof onAnswersChange === 'function') {
      onAnswersChange(copy);
    }
    if (randomMode && !preview) {
      writeQuestionAnswer(qKey, q.id, null);
    }
    setPicked([]);
    setShowCorrection(false);
  };

  const next = () => {
    if (idx + 1 < questions.length) {
      const nextIdx = idx + 1;
      setIdx(nextIdx);
      setShowCorrection(Boolean(reviewing && answers[questions[nextIdx]?.id]));
    } else {
      setIdx(firstOpen(questions, answers));
      setShowCorrection(false);
    }
    setPicked([]);
    resetReportBox();
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  const reviewCorrections = () => {
    setReviewing(true);
    setPicked([]);
    setIdx(0);
    setShowCorrection(true);
    resetReportBox();
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  const restart = () => {
    if (onRestart) {
      onRestart();
      return;
    }
    if (randomMode && !preview) {
      for (const item of questions) {
        writeQuestionAnswer(item._chapterKey || key, item.id, null);
      }
    }
    recordedHistoryRef.current = false;
    wasRestartedRef.current = true;
    setHistoryRecorded(false);
    setReviewing(false);
    setAnswers({});
    setSent(false);
    setPicked([]);
    setShowCorrection(false);
    setIdx(0);
    setSaveState('idle');
    if (!preview && !randomMode) clearChapterProgress(key);
    resetReportBox();
  };

  const sendReport = async (e) => {
    e.preventDefault();
    if (!q || reportStatus === 'sending') return;
    setReportError('');
    setReportStatus('sending');
    try {
      await submitQuestionReport({
        name: readName() || 'Anonyme',
        chapter: qKey,
        questionId: q.id,
        message: reportText,
      });
      setReportStatus('sent');
      setReportText('');
    } catch (err) {
      setReportError(err.message || 'Impossible d’envoyer le retour.');
      setReportStatus('idle');
    }
  };

  const themeId = meta.theme || 'epaule';
  const backHref = meta.backHref || `#/${themeId}`;

  // Send the result once, when every question of the quiz has been answered.
  const sendResult = async () => {
    if (preview) return;
    const name = readName();
    if (!name) return;
    const passed = total > 0 && score / total >= 0.6;
    setSaveState('saving');
    if (!recordedHistoryRef.current) {
      recordedHistoryRef.current = true;
      setHistoryRecorded(true);
      recordQuizAttempt(
        { quiz: randomMode ? 'quiz-aleatoire' : key, score, total, restarted: wasRestartedRef.current },
        name
      );
    }
    try {
      const r = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, course: themeId, quiz: key, score, total, passed }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setSent(true); setSaveState('saved');
    } catch { setSaveState('error'); }
  };
  useEffect(() => {
    if (answeredAll.length === total && total > 0 && !preview) {
      const name = readName();
      if (name && !historyRecorded && !recordedHistoryRef.current) {
        recordedHistoryRef.current = true;
        setHistoryRecorded(true);
        if (!randomMode) {
          writeChapterProgress(key, { answers, sent: true, historyRecorded: true });
        }
        recordQuizAttempt(
          { quiz: randomMode ? 'quiz-aleatoire' : key, score, total, restarted: wasRestartedRef.current },
          name
        );
        if (typeof onQuizCompleted === 'function') {
          onQuizCompleted({ score, total, passed: score / total >= 0.6 });
        }
      }
      if (!sent && saveState === 'idle') sendResult();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answeredAll.length, total]);

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => e.key === 'Escape' && setZoom(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  const c = meta;
  const ref = (s, m = qMeta) =>
    `Chapitre ${m.numero} (${m.titre}, ${m.auteurs}), Page ${s.page}, ${s.element}${s.refs ? ` ${s.refs}` : ''}`;

  const state = (item) => {
    if (!validated) return picked.includes(item.id) ? 'sel' : '';
    if (!showCorrection) return validated.includes(item.id) ? 'sel' : '';
    const on = validated.includes(item.id);
    if (on && item.correct) return 'ok';
    if (on && !item.correct) return 'ko';
    if (!on && item.correct) return q.type === 'QRM' ? 'miss' : 'miss-qcu';
    return 'dim';
  };
  const mark = { ok: '✓', ko: '✗', miss: '!', 'miss-qcu': '✓' };

  const dotStatus = (question) => {
    const a = answers[question.id];
    if (!a) return { cls: 'pending', label: 'non validée' };
    return isPerfect(question, a)
      ? { cls: 'ok', label: 'bonne réponse' }
      : { cls: 'ko', label: 'erreur' };
  };

  return (
    <div className="cq" ref={topRef}>
      <header className="cq-head">
        <div className="cq-top-links">
          <a href={backHref} className="cq-back">{backLabel}</a>
        </div>
        <h1>{c.titre}</h1>
        <div className="cq-stats" aria-live="polite">
          <span>Score <b>{score}</b> / {answeredAll.length || 0}</span>
          <span>{answeredAll.length} / {total} questions</span>
        </div>
        <div className="cq-bar"><div style={{ width: `${(answeredAll.length / total) * 100}%` }} /></div>
        <div className="cq-dots" role="navigation" aria-label="Progression des questions">
          {questions.map((item, i) => {
            const { cls, label } = dotStatus(item);
            const active = !finished && idx === i;
            return (
              <button
                key={item.id}
                type="button"
                className={`cq-dot ${cls}${active ? ' on' : ''}`}
                onClick={() => goTo(i)}
                aria-label={`Question ${i + 1} (${label})`}
                aria-current={active ? 'step' : undefined}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </header>

      {finished ? (
        <section className="cq-card cq-end">
          {dailyMode ? (
            <>
              <div className="daily-end-stars" aria-label="Étoiles remportées">
                {[1, 2, 3].map((s) => {
                  const ratio = total > 0 ? score / total : 0;
                  const earnedStars = ratio > 0.9 ? 3 : ratio > 0.6 ? 2 : 1;
                  return (
                    <span key={s} className={`daily-end-star ${s <= earnedStars ? 'is-earned' : ''}`}>
                      ★
                    </span>
                  );
                })}
              </div>
              <h2>{dailyMode.isBossStep ? 'Défi Boss terminé !' : `Étape ${dailyMode.stepNumber} terminée !`}</h2>
            </>
          ) : (
            <h2>Quiz terminé !</h2>
          )}
          <p className="cq-big">{score} / {total}</p>
          {answeredAll.length === total && (
            <p className={`cq-save cq-save-${saveState}`} role="status">
              {sent && '✓ Résultat enregistré'}
              {saveState === 'saving' && 'Enregistrement du résultat…'}
              {saveState === 'error' && <>Impossible d’enregistrer. <button className="link-btn" onClick={sendResult}>Réessayer</button></>}
            </p>
          )}
          <div className="cq-end-actions">
            {dailyMode?.onContinuePath && (
              <button className="btn" onClick={dailyMode.onContinuePath}>
                Continuer sur le chemin <Icon name="arrow" size={18} />
              </button>
            )}
            <button className={dailyMode ? 'btn btn-ghost' : 'btn'} onClick={reviewCorrections}>
              Revoir les corrections
            </button>
            {!dailyMode && (
              <button className="btn btn-ghost" onClick={restart}>
                {randomMode ? 'Nouveau tirage aléatoire' : 'Recommencer'}
              </button>
            )}
            {!dailyMode && (
              <a className="btn btn-ghost" href={backHref}>
                {randomMode && key === 'quiz-aleatoire' ? 'Configurer un autre quiz' : 'Autres chapitres'}
              </a>
            )}
          </div>
          {!randomMode && (
            <p className="cq-restart-note">
              Attention : cliquer sur « Recommencer » réinitialise vos réponses pour ces questions et les repasse en orange (non faites).
            </p>
          )}
        </section>
      ) : (
        <section className={`cq-card ${q._isBoss ? 'cq-card-boss' : ''}`} key={q.id}>
          <div className="cq-meta">
            <span>
              Question {idx + 1} / {questions.length}
              {randomMode && qMeta?.titre ? ` · ${qMeta.titre}` : ''}
            </span>
            <div className="cq-meta-badges">
              {q._isBoss && (
                <span className="cq-boss-badge" title="Question Boss plus difficile">
                  🔥 Question Boss
                </span>
              )}
              {(() => {
                const diff = resolveDifficulty(q.id, q.difficulty);
                return (
                  <span className={`cq-diff cq-diff-${diff}`} title={`Niveau de difficulté ${diff} sur 3`}>
                    Difficulté : {diff}
                  </span>
                );
              })()}
              <span className={`cq-type cq-${q.type}`}>{q.type === 'QCU' ? 'Une seule réponse' : 'Plusieurs réponses possibles'}</span>
            </div>
          </div>
          {q.enonce_image && (
            <figure className="cq-fig cq-fig-top" onClick={() => setZoom({ src: imageSrc(qKey, q.enonce_image), caption: q.enonce_image.alt })}>
              <img src={imageSrc(qKey, q.enonce_image)} alt={q.enonce_image.alt || ''} />
            </figure>
          )}
          <h2 className="cq-q">{q.enonce}</h2>

          <div className="cq-items">
            {q.shown.map((it, i) => {
              const s = state(it);
              return (
                <button key={it.id} className={`cq-item ${s}`} onClick={() => toggle(it.id)} aria-pressed={(validated || picked).includes(it.id)} disabled={Boolean(validated)}>
                  <span className="cq-key">{String.fromCharCode(65 + i)}</span>
                  <span className="cq-text">{it.texte}</span>
                  {mark[s] && <span className="cq-mark" aria-hidden="true">{mark[s]}</span>}
                </button>
              );
            })}
          </div>

          {validated && (
            <div className="cq-correction">
              <p className={`cq-verdict ${isPerfect(q, validated) ? 'ok' : 'ko'}`}>
                {isPerfect(q, validated) ? '✓ Bonne réponse !' : '✗ Mauvaise réponse.'}
              </p>

              <div className={`cq-post-actions ${dailyMode ? 'is-daily' : ''}`}>
                <button
                  type="button"
                  className="btn btn-small btn-ghost cq-post-btn"
                  onClick={() => setShowCorrection((v) => !v)}
                  aria-expanded={showCorrection}
                >
                  {showCorrection
                    ? dailyMode
                      ? 'Masquer la correction'
                      : 'Masquer correction'
                    : 'Voir la correction'}
                </button>
                {!dailyMode && (
                  <button
                    type="button"
                    className="btn btn-small btn-ghost cq-post-btn"
                    onClick={retryQuestion}
                    title="Réessayer la question"
                  >
                    ↺ Réessayer
                  </button>
                )}
                {!preview && (
                  <button
                    type="button"
                    className={`btn btn-small btn-ghost cq-post-btn cq-bookmark-btn ${bookmarks[q.id] ? 'is-bookmarked' : ''}`}
                    onClick={() => {
                      toggleQuestionBookmark(q.id);
                      setBookmarks(readBookmarks());
                    }}
                    aria-pressed={Boolean(bookmarks[q.id])}
                    title={
                      bookmarks[q.id]
                        ? 'Retirer des questions enregistrées'
                        : 'Enregistrer cette question dans Ma progression'
                    }
                  >
                    <Icon name="bookmark" size={15} filled={Boolean(bookmarks[q.id])} />
                    {bookmarks[q.id] ? 'Enregistrée' : 'Enregistrer'}
                  </button>
                )}
              </div>

              {showCorrection && (
                <>
                  <p className="cq-legend">
                    <span className="lg ok">✓ Bonne réponse cochée</span>
                    <span className="lg ko">✗ Cochée à tort</span>
                    {q.type === 'QRM' && <span className="lg miss">! Oubliée</span>}
                  </p>
                  <p className="cq-expl">{q.explication}</p>
                  {q.correction_figures?.map((f, i) => (
                    <figure key={f.upload || f.file || i} className="cq-fig" onClick={() => setZoom({ src: imageSrc(qKey, f), caption: f.caption })}>
                      <img src={imageSrc(qKey, f)} alt={f.caption} loading="lazy" />
                      <figcaption>{f.caption}<span className="cq-zoom"> · toucher pour agrandir</span></figcaption>
                    </figure>
                  ))}
                  <p className="cq-ref"><strong>Référence</strong>{ref(q.source)}</p>
                  {q.reviewed_by && (
                    <p className="cq-reviewed-by">
                      ✓ Relu par <strong>{q.reviewed_by}</strong>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {!preview && (
            <div className="cq-report">
              {reportStatus === 'sent' ? (
                <p className="cq-report-sent" role="status">
                  ✓ Merci ! Votre retour a bien été transmis à l’administrateur.
                </p>
              ) : !reportOpen ? (
                <button
                  type="button"
                  className="cq-report-trigger"
                  onClick={() => setReportOpen(true)}
                >
                  ⚑ Signaler une erreur ou faire un retour sur cette question
                </button>
              ) : (
                <form className="cq-report-form" onSubmit={sendReport}>
                  <label htmlFor={`report-${q.id}`}>
                    Votre retour pour l’administrateur (coquille, remarque, question…)
                  </label>
                  <textarea
                    id={`report-${q.id}`}
                    className="admin-input"
                    rows={3}
                    maxLength={600}
                    placeholder="Écrivez quelques phrases pour décrire votre remarque…"
                    value={reportText}
                    onChange={(e) => setReportText(e.target.value)}
                    autoFocus
                    required
                  />
                  {reportError && <p className="admin-error" role="alert">{reportError}</p>}
                  <div className="cq-report-actions">
                    <button
                      type="submit"
                      className="btn btn-small"
                      disabled={reportStatus === 'sending' || reportText.trim().length < 2}
                    >
                      {reportStatus === 'sending' ? 'Envoi…' : 'Envoyer le retour'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-ghost"
                      onClick={resetReportBox}
                      disabled={reportStatus === 'sending'}
                    >
                      Annuler
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </section>
      )}

      {!finished && (
        <div className="cq-bottom">
          <div className="cq-bottom-inner">
            {!validated ? (
              <button className="btn cq-main" onClick={validate} disabled={!picked.length}>Valider</button>
            ) : answeredAll.length === total && idx + 1 < questions.length ? (
              <>
                <button
                  type="button"
                  className="btn btn-ghost cq-main"
                  onClick={() => {
                    setIdx(questions.length);
                    resetReportBox();
                    topRef.current?.scrollIntoView({ block: 'start' });
                  }}
                >
                  Voir les résultats
                </button>
                <button className="btn cq-main" onClick={next}>
                  Question suivante <Icon name="arrow" size={18} />
                </button>
              </>
            ) : (
              <button className="btn cq-main" onClick={next}>
                {idx + 1 >= questions.length && answeredAll.length === total ? 'Voir les résultats' : 'Question suivante'} <Icon name="arrow" size={18} />
              </button>
            )}
          </div>
        </div>
      )}

      {zoom && (
        <div className="cq-zoomed" onClick={() => setZoom(null)} role="dialog" aria-modal="true">
          <button className="cq-close" aria-label="Fermer">✕</button>
          <img src={zoom.src} alt={zoom.caption || ''} />
          {zoom.caption && <p>{zoom.caption}</p>}
        </div>
      )}
    </div>
  );
}
