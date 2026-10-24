import { useEffect, useMemo, useState } from 'react';
import { themes } from '../data/themes.js';
import { CHAPTERS, useQuestions, resolveDifficulty } from '../data/useQuestions.js';
import {
  readName,
  saveName,
  readChapterProgress,
  subscribePlayer,
  syncProgressFromServer,
} from '../data/player.js';
import { QuizPlayer } from './ChapterQuiz.jsx';
import Icon from './Icons.jsx';

const PRESET_COUNTS = [5, 10, 15, 20, 30];

function pickRandom(pool, count) {
  const arr = [...pool];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.min(count, arr.length));
}

export default function RandomQuiz() {
  const { byChapter, loading } = useQuestions();
  const [pseudo, setPseudo] = useState(readName);
  const [draft, setDraft] = useState('');

  // Chapters that actually contain at least 1 question
  const availableChapters = useMemo(() => {
    const all = themes.flatMap((t) => t.chapters.map((c) => c.id));
    return all.filter((id) => (byChapter[id] || []).length > 0);
  }, [byChapter]);

  const [selected, setSelected] = useState([]);
  const [difficulties, setDifficulties] = useState([1, 2, 3]);
  const [count, setCount] = useState(10);
  const [session, setSession] = useState(null); // { id, questions }
  const [openThemes, setOpenThemes] = useState({});

  const toggleOpenTheme = (themeId) => {
    setOpenThemes((prev) => ({ ...prev, [themeId]: !prev[themeId] }));
  };

  // Initialize selection with all available chapters once questions are loaded
  useEffect(() => {
    if (availableChapters.length > 0 && selected.length === 0) {
      setSelected(availableChapters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableChapters]);

  useEffect(() => {
    syncProgressFromServer();
    return subscribePlayer(() => setPseudo(readName()));
  }, []);

  const chapterPool = useMemo(() => {
    const out = [];
    for (const chKey of selected) {
      const qs = byChapter[chKey] || [];
      const meta = CHAPTERS[chKey]?.chapitre;
      for (const q of qs) {
        const diff = resolveDifficulty(q.id, q.difficulty);
        out.push({ ...q, difficulty: diff, _chapterKey: chKey, _meta: meta });
      }
    }
    return out;
  }, [byChapter, selected]);

  const diffCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0 };
    for (const q of chapterPool) {
      counts[q.difficulty] = (counts[q.difficulty] || 0) + 1;
    }
    return counts;
  }, [chapterPool]);

  const pool = useMemo(
    () => chapterPool.filter((q) => difficulties.includes(q.difficulty)),
    [chapterPool, difficulties]
  );

  const toggleDifficulty = (lvl) => {
    setDifficulties((prev) => {
      if (prev.includes(lvl)) {
        // Keep at least one level selected if the user unchecks the last one, or allow unchecking
        return prev.filter((x) => x !== lvl);
      }
      return [...prev, lvl].sort();
    });
  };

  const selectAllDifficulties = () => {
    if (difficulties.length === 3) setDifficulties([]);
    else setDifficulties([1, 2, 3]);
  };

  const effectiveCount = pool.length > 0 ? Math.max(1, Math.min(count, pool.length)) : 0;

  const toggleChapter = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleTheme = (themeObj) => {
    const validIds = themeObj.chapters.map((c) => c.id).filter((id) => (byChapter[id] || []).length > 0);
    if (validIds.length === 0) return;
    const allSelected = validIds.every((id) => selected.includes(id));
    if (allSelected) {
      setSelected((prev) => prev.filter((id) => !validIds.includes(id)));
    } else {
      setSelected((prev) => [...new Set([...prev, ...validIds])]);
    }
  };

  const selectAll = () => {
    if (selected.length === availableChapters.length) setSelected([]);
    else setSelected(availableChapters);
  };

  const startQuiz = () => {
    if (pool.length === 0 || effectiveCount < 1) return;
    const unanswered = pool.filter((q) => {
      const ans = readChapterProgress(q._chapterKey)?.answers || {};
      return !ans[q.id];
    });
    const sourcePool = unanswered.length > 0 ? unanswered : pool;
    const drawn = pickRandom(sourcePool, Math.min(effectiveCount, sourcePool.length));
    setSession({ id: Date.now(), questions: drawn });
    window.scrollTo(0, 0);
  };

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
        <a href="#/" className="cq-back">← Accueil</a>
        <form className="cq-card name-step" onSubmit={onSubmit} style={{ marginTop: 14 }}>
          <label htmlFor="rnd-pseudo">Choisis un pseudo pour commencer le quiz aléatoire</label>
          <input
            id="rnd-pseudo"
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
            Continuer <Icon name="arrow" size={18} />
          </button>
        </form>
      </div>
    );
  }

  if (loading) {
    return <div className="cq"><p className="cq-loading" role="status">Chargement des questions…</p></div>;
  }

  if (session) {
    return (
      <div className="rnd-play">
        <div className="rnd-play-top">
          <button type="button" className="rnd-action-btn" onClick={() => setSession(null)}>
            ← Modifier la sélection
          </button>
        </div>
        <QuizPlayer
          key={session.id}
          chapterKey="quiz-aleatoire"
          meta={{
            numero: 'Mixte',
            theme: 'mixte',
            backHref: '#/',
            titre: `Quiz aléatoire (${session.questions.length} question${session.questions.length > 1 ? 's' : ''})`,
            auteurs: 'A. Cotten',
          }}
          questions={session.questions}
          randomMode
          backLabel="← Accueil"
          onRestart={startQuiz}
        />
      </div>
    );
  }

  return (
    <section className="prog rnd">
      <header className="prog-head">
        <a href="#/" className="cq-back">← Accueil</a>
        <h1>Quiz <span className="grad">aléatoire</span></h1>
        <p className="home-hello">
          Choisis les chapitres à réviser et le nombre de questions à tirer au sort.
        </p>
      </header>

      <div className="cq-card rnd-box">
        <div className="rnd-sec-head">
          <h2>1. Chapitres à inclure</h2>
          <button type="button" className="rnd-action-btn" onClick={selectAll}>
            {selected.length === availableChapters.length ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        </div>

        <div className="rnd-themes">
          {themes.map((t) => {
            const validIds = t.chapters.map((c) => c.id).filter((id) => (byChapter[id] || []).length > 0);
            const selectedInTheme = validIds.filter((id) => selected.includes(id));
            const allInTheme = validIds.length > 0 && selectedInTheme.length === validIds.length;
            const someInTheme = selectedInTheme.length > 0;
            const totalQsInTheme = t.chapters.reduce((sum, c) => sum + (byChapter[c.id] || []).length, 0);
            const isOpen = Boolean(openThemes[t.id]);
            return (
              <div
                key={t.id}
                className={`rnd-theme-card ${isOpen ? 'is-open' : ''} ${someInTheme ? 'has-selected' : ''}`}
              >
                <div className="rnd-theme-bar">
                  <button
                    type="button"
                    className="rnd-theme-toggle"
                    onClick={() => toggleOpenTheme(t.id)}
                    aria-expanded={isOpen}
                  >
                    <div className="rnd-theme-info">
                      <span className="rnd-theme-title">{t.title}</span>
                      <span className="rnd-theme-meta">
                        {validIds.length > 0
                          ? `${selectedInTheme.length}/${validIds.length} ch. · ${totalQsInTheme} q.`
                          : `${t.chapters.length} ch. · 0 q.`}
                      </span>
                    </div>
                    <span className={`prog-chevron ${isOpen ? 'open' : ''}`} aria-hidden="true">▾</span>
                  </button>
                  {validIds.length > 0 && (
                    <button
                      type="button"
                      className={`rnd-theme-check-btn ${allInTheme ? 'on' : ''}`}
                      onClick={() => toggleTheme(t)}
                    >
                      {allInTheme ? '✓ Tout coché' : 'Tout cocher'}
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="rnd-ch-list">
                    {t.chapters.map((c, idx) => {
                      const qCount = (byChapter[c.id] || []).length;
                      const checked = selected.includes(c.id);
                      const disabled = qCount === 0;
                      return (
                        <label
                          key={c.id}
                          className={`rnd-ch ${checked ? 'on' : ''} ${disabled ? 'is-disabled' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleChapter(c.id)}
                          />
                          <span className="rnd-ch-title">
                            <b>{idx + 1}.</b> {c.title}
                          </span>
                          <span className="rnd-ch-count">
                            {qCount > 0 ? `${qCount} q.` : '0 q.'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="cq-card rnd-box">
        <div className="rnd-sec-head">
          <h2>2. Niveau de difficulté</h2>
          <button type="button" className="rnd-action-btn" onClick={selectAllDifficulties}>
            {difficulties.length === 3 ? 'Tout désélectionner' : 'Tous les niveaux'}
          </button>
        </div>
        <p className="rnd-diff-help">
          Choisis un ou plusieurs niveaux de difficulté :
        </p>
        <div className="rnd-diff-grid" role="group" aria-label="Filtrer par niveau de difficulté">
          {[1, 2, 3].map((lvl) => {
            const on = difficulties.includes(lvl);
            const c = diffCounts[lvl] || 0;
            return (
              <button
                key={lvl}
                type="button"
                className={`rnd-diff-card rnd-diff-${lvl} ${on ? 'on' : ''}`}
                onClick={() => toggleDifficulty(lvl)}
                aria-pressed={on}
              >
                <span className="rnd-diff-check" aria-hidden="true">{on ? '✓' : ''}</span>
                <span className="rnd-diff-title">Niveau {lvl}</span>
                <span className="rnd-diff-count">
                  {c} q.
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="cq-card rnd-box">
        <div className="rnd-sec-head">
          <h2>3. Nombre de questions</h2>
          <span className="rnd-pool-info">
            {pool.length} question{pool.length > 1 ? 's' : ''} disponible{pool.length > 1 ? 's' : ''}
          </span>
        </div>

        <div className="rnd-counts">
          {PRESET_COUNTS.filter((n) => n < pool.length).map((n) => (
            <button
              key={n}
              type="button"
              className={`rnd-pill ${effectiveCount === n ? 'on' : ''}`}
              onClick={() => setCount(n)}
              disabled={pool.length === 0}
            >
              {n} questions
            </button>
          ))}
          {pool.length > 0 && (
            <button
              type="button"
              className={`rnd-pill ${effectiveCount === pool.length ? 'on' : ''}`}
              onClick={() => setCount(pool.length)}
            >
              Toutes ({pool.length})
            </button>
          )}
        </div>

        {pool.length > 0 && (
          <div className="rnd-custom">
            <label htmlFor="rnd-count-input">Ou nombre précis :</label>
            <input
              id="rnd-count-input"
              type="number"
              className="admin-input rnd-input"
              min={1}
              max={pool.length}
              value={effectiveCount}
              onChange={(e) => setCount(Math.max(1, Math.min(pool.length, Number(e.target.value) || 1)))}
            />
          </div>
        )}

        <div className="rnd-launch">
          <button
            type="button"
            className="btn rnd-launch-btn"
            onClick={startQuiz}
            disabled={pool.length === 0}
          >
            Lancer le quiz ({effectiveCount} question{effectiveCount > 1 ? 's' : ''})
          </button>
        </div>
      </div>
    </section>
  );
}
