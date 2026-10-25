import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { themes } from '../data/themes.js';
import { useQuestions } from '../data/useQuestions.js';
import {
  readName,
  saveName,
  readAllProgress,
  subscribePlayer,
  checkPseudoExists,
  syncProgressFromServer,
} from '../data/player.js';
import Icon from './Icons.jsx';
import { AppModeTopPill } from './DailyPathPage.jsx';

function isStandaloneMode() {
  if (typeof window === 'undefined') return false;
  if (window.navigator?.standalone === true) return true;
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
  if (window.matchMedia?.('(display-mode: fullscreen)')?.matches) return true;
  if (typeof document !== 'undefined' && document.referrer.includes('android-app://')) return true;
  return false;
}

function isQuestionCorrect(q, picked) {
  if (!Array.isArray(picked) || picked.length === 0) return false;
  const good = (q.items || []).filter((i) => i.correct).map((i) => i.id).sort().join();
  return good === [...picked].sort().join();
}

// Home: ask a pseudo, then pick a theme and one of its chapters.
// `openTheme` comes from the URL (#/epaule) so "back" from a chapter lands on the chapter list.
export default function Home({ openTheme }) {
  const { byChapter } = useQuestions();
  const [pseudo, setPseudo] = useState(readName);
  const [draft, setDraft] = useState(pseudo);
  const [editing, setEditing] = useState(!pseudo);
  const [checking, setChecking] = useState(false);
  const [existingConfirm, setExistingConfirm] = useState(null);
  const [progress, setProgress] = useState(() => readAllProgress(readName()));
  const [isAppMode, setIsAppMode] = useState(isStandaloneMode);
  const inputRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia?.('(display-mode: standalone)');
    if (!mq) return undefined;
    const onChange = () => setIsAppMode(isStandaloneMode());
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const n = readName();
    if (n) syncProgressFromServer(n);
    return subscribePlayer(() => {
      const curr = readName();
      setPseudo(curr);
      setProgress(readAllProgress(curr));
    });
  }, []);

  const confirmLogin = async (clean) => {
    if (!clean) return;
    setChecking(true);
    setExistingConfirm(null);
    saveName(clean);
    await syncProgressFromServer(clean);
    setPseudo(clean);
    setProgress(readAllProgress(clean));
    setChecking(false);
    setEditing(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    const clean = draft.trim().replace(/\s+/g, ' ');
    if (!clean || checking) return;
    setChecking(true);
    const exists = await checkPseudoExists(clean);
    if (exists) {
      setChecking(false);
      setExistingConfirm(clean);
      return;
    }
    await confirmLogin(clean);
  };

  return (
    <section className="home" id="top">
      {!isAppMode && <AppModeTopPill className="daily-app-pill-quiz" />}

      <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        QUIZ <span className="grad">Cochin</span>
      </motion.h1>

      {editing ? (
        <motion.form className="home-panel name-step" onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <label htmlFor="pseudo">Choisis un pseudo pour commencer ou reprendre ta session</label>
          <input
            ref={inputRef}
            id="pseudo"
            className="name-input"
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (existingConfirm) setExistingConfirm(null);
            }}
            placeholder="Ton pseudo"
            maxLength={80}
            autoComplete="nickname"
            autoFocus
            required
          />
          <p className="privacy">
            Ton pseudo mémorise ta progression (questions déjà répondues et scores) pour que tu puisses reprendre à tout moment.
          </p>
          {existingConfirm ? (
            <div className="pseudo-taken-box" role="alert">
              <p className="pseudo-taken-text">
                Le pseudo <strong>« {existingConfirm} »</strong> est déjà pris. S’agit-il de ton compte ?
              </p>
              <div className="pseudo-taken-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={checking}
                  onClick={() => confirmLogin(existingConfirm)}
                >
                  {checking ? 'Synchronisation…' : 'C’est moi'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={checking}
                  onClick={() => {
                    setExistingConfirm(null);
                    setDraft('');
                    setTimeout(() => inputRef.current?.focus(), 20);
                  }}
                >
                  Changer de pseudo
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn" type="submit" disabled={!draft.trim() || checking}>
                {checking ? 'Vérification…' : <>Continuer <Icon name="arrow" size={18} /></>}
              </button>
              {pseudo && !checking && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setExistingConfirm(null);
                    setEditing(false);
                  }}
                >
                  Annuler
                </button>
              )}
            </div>
          )}
        </motion.form>
      ) : (
        <motion.div className="home-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="home-bar">
            <div className="home-hello">
              <span>Salut</span>
              <button
                type="button"
                className="daily-hud-pill daily-hud-pseudo prog-pseudo-pill"
                onClick={() => { setDraft(pseudo); setEditing(true); }}
                title="Changer de pseudo"
              >
                {pseudo}
              </button>
              <span>!</span>
            </div>
            <div className="home-bar-actions">
              <a href="#/aleatoire" className="btn btn-small">
                Quiz aléatoire
              </a>
              <a href="#/proposer" className="btn btn-ghost btn-small">
                Proposer une question
              </a>
            </div>
          </div>

          <p className="home-reviewed-legend">
            <span className="chapter-reviewed-badge" aria-hidden="true">
              <Icon name="check" size={12} />
            </span>
            <span>Chapitre relu et corrigé</span>
          </p>

          {themes.map((t) => {
            const open = openTheme === t.id;
            const themePassed =
              t.chapters.length > 0 &&
              t.chapters.every((c) => {
                const qs = byChapter[c.id] || [];
                if (qs.length === 0) return false;
                const ans = progress[c.id]?.answers || {};
                const answeredQs = qs.filter((q) => Array.isArray(ans[q.id]) && ans[q.id].length > 0);
                if (answeredQs.length !== qs.length) return false;
                const score = answeredQs.filter((q) => isQuestionCorrect(q, ans[q.id])).length;
                return score / qs.length >= 0.6;
              });
            return (
              <div key={t.id} className={`theme ${themePassed ? 'theme-passed' : ''}`}>
                <a
                  href={open ? '#/chapitres' : `#/${t.id}`}
                  className={`theme-head ${open ? 'on' : ''}`}
                  aria-expanded={open}
                  onClick={(e) => {
                    e.preventDefault();
                    const nextHash = open ? '#/chapitres' : `#/${t.id}`;
                    window.history.replaceState(null, '', nextHash);
                    window.dispatchEvent(new HashChangeEvent('hashchange'));
                  }}
                >
                  <span className="theme-head-title">
                    <img
                      src={t.logo || `/theme-logos/${t.id}.png`}
                      alt=""
                      aria-hidden="true"
                      className="theme-head-logo"
                      loading="lazy"
                      draggable="false"
                    />
                    <span>{t.title}</span>
                  </span>
                  <span className="theme-count">{t.chapters.length} chapitres</span>
                </a>
                {open && (
                  <motion.ol className="chapters" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    {t.chapters.map((c, i) => {
                      const qs = byChapter[c.id] || [];
                      const total = qs.length || c.fallbackCount;
                      const ans = progress[c.id]?.answers || {};
                      const answeredQs = qs.filter((q) => Array.isArray(ans[q.id]) && ans[q.id].length > 0);
                      const done = answeredQs.length;
                      const isCompleted = qs.length > 0 && done === qs.length;
                      const score = isCompleted
                        ? answeredQs.filter((q) => isQuestionCorrect(q, ans[q.id])).length
                        : 0;
                      const passed = isCompleted && score / total >= 0.6;
                      const statusClass = isCompleted ? (passed ? 'chapter-passed' : 'chapter-failed') : '';
                      const allReviewed = qs.length > 0 && qs.every((q) => q.reviewed);
                      return (
                        <li key={c.id} className="chapter-item">
                          {c.href ? (
                            <div className="chapter-row">
                              <a href={c.href} className={`chapter ${statusClass}`}>
                                <span className="chapter-num">
                                  <b>{i + 1}</b>
                                  {allReviewed && (
                                    <span
                                      className="chapter-reviewed-badge"
                                      title="Chapitre entièrement relu et validé"
                                      aria-label="Chapitre entièrement relu et validé"
                                    >
                                      <Icon name="check" size={11} />
                                    </span>
                                  )}
                                </span>
                                <span className="chapter-title">{c.title}</span>
                                <span className="chapter-go">
                                  {isCompleted ? `${score}/${total}` : `${done}/${total}`} <Icon name="arrow" size={16} />
                                </span>
                              </a>
                              {total > 0 && (
                                <a
                                  href={`${c.href}?random=5`}
                                  className="chapter-5q"
                                  title={`5 questions aléatoires — ${c.title}`}
                                  aria-label={`Faire 5 questions aléatoires du chapitre ${c.title}`}
                                >
                                  5Q
                                </a>
                              )}
                            </div>
                          ) : (
                            <div className="chapter chapter-soon">
                              <b>{i + 1}</b> <span className="chapter-title">{c.title}</span>
                              <span className="chapter-go">Bientôt</span>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </motion.ol>
                )}
              </div>
            );
          })}
        </motion.div>
      )}
    </section>
  );
}
