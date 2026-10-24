import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { themes } from '../data/themes.js';
import { useQuestions } from '../data/useQuestions.js';
import {
  readName,
  saveName,
  readAllProgress,
  subscribePlayer,
  syncProgressFromServer,
} from '../data/player.js';
import Icon from './Icons.jsx';

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
  const [progress, setProgress] = useState(() => readAllProgress(readName()));
  const [isAppMode, setIsAppMode] = useState(isStandaloneMode);

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

  const submit = (e) => {
    e.preventDefault();
    const clean = draft.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    saveName(clean);
    setPseudo(clean);
    setProgress(readAllProgress(clean));
    setEditing(false);
  };

  return (
    <section className="home" id="top">
      {!isAppMode && (
        <div className="home-app-wrap">
          <a
            href="https://www.google.com/search?q=comment+ajouter+un+site+web+sur+l%27%C3%A9cran+d%27accueil+iPhone+et+Android+tutoriel"
            target="_blank"
            rel="noopener noreferrer"
            className="home-app-banner"
          >
            <span className="home-app-banner-text">
              Mode App <img src="/apple-touch-icon.png" alt="Logo QUIZ Cochin" className="home-app-logo" /> : Ajouter à ma page d’accueil
            </span>
            <Icon name="arrow" size={16} />
          </a>
        </div>
      )}

      <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        QUIZ <span className="grad">Cochin</span>
      </motion.h1>

      {editing ? (
        <motion.form className="home-panel name-step" onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <label htmlFor="pseudo">Choisis un pseudo pour commencer ou reprendre ta session</label>
          <input
            id="pseudo"
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
          <p className="privacy">
            Ton pseudo mémorise ta progression (questions déjà répondues et scores) pour que tu puisses reprendre à tout moment.
          </p>
          <button className="btn" type="submit" disabled={!draft.trim()}>
            Continuer <Icon name="arrow" size={18} />
          </button>
        </motion.form>
      ) : (
        <motion.div className="home-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="home-bar">
            <p className="home-hello">
              Salut <strong>{pseudo}</strong> !{' '}
              <button className="link-btn" onClick={() => { setDraft(pseudo); setEditing(true); }}>
                Changer de pseudo
              </button>
            </p>
            <div className="home-bar-actions">
              <a href="#/aleatoire" className="btn btn-small">
                Quiz aléatoire <Icon name="arrow" size={15} />
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
            return (
              <div key={t.id} className="theme">
                <a
                  href={open ? '#/' : `#/${t.id}`}
                  className={`theme-head ${open ? 'on' : ''}`}
                  aria-expanded={open}
                  onClick={(e) => {
                    e.preventDefault();
                    const nextHash = open ? '#/' : `#/${t.id}`;
                    window.history.replaceState(null, '', nextHash);
                    window.dispatchEvent(new HashChangeEvent('hashchange'));
                  }}
                >
                  <span>{t.title}</span>
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
                                <b>{i + 1}</b>{' '}
                                <span className="chapter-title">
                                  {c.title}
                                  {allReviewed && (
                                    <span
                                      className="chapter-reviewed-badge"
                                      title="Chapitre entièrement relu et validé"
                                      aria-label="Chapitre entièrement relu et validé"
                                    >
                                      <Icon name="check" size={12} />
                                    </span>
                                  )}
                                </span>
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
