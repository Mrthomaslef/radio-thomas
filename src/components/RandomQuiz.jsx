import { useEffect, useMemo, useState } from 'react';
import { themes } from '../data/themes.js';
import { CHAPTERS, useQuestions } from '../data/useQuestions.js';
import { readName, saveName, subscribePlayer } from '../data/player.js';
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
  const [count, setCount] = useState(10);
  const [session, setSession] = useState(null); // { id, questions }

  // Initialize selection with all available chapters once questions are loaded
  useEffect(() => {
    if (availableChapters.length > 0 && selected.length === 0) {
      setSelected(availableChapters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableChapters]);

  useEffect(() => subscribePlayer(() => setPseudo(readName())), []);

  const pool = useMemo(() => {
    const out = [];
    for (const chKey of selected) {
      const qs = byChapter[chKey] || [];
      const meta = CHAPTERS[chKey]?.chapitre;
      for (const q of qs) {
        out.push({ ...q, _chapterKey: chKey, _meta: meta });
      }
    }
    return out;
  }, [byChapter, selected]);

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
    const drawn = pickRandom(pool, effectiveCount);
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
          <button type="button" className="cq-back link-btn" onClick={() => setSession(null)}>
            ← Modifier les chapitres ou le nombre de questions
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
          <button type="button" className="link-btn" onClick={selectAll}>
            {selected.length === availableChapters.length ? 'Tout désélectionner' : 'Tout sélectionner'}
          </button>
        </div>

        <div className="rnd-themes">
          {themes.map((t) => {
            const validIds = t.chapters.map((c) => c.id).filter((id) => (byChapter[id] || []).length > 0);
            const allInTheme = validIds.length > 0 && validIds.every((id) => selected.includes(id));
            return (
              <div key={t.id} className="rnd-theme">
                <div className="rnd-theme-head">
                  <h3>{t.title}</h3>
                  {validIds.length > 0 && (
                    <button type="button" className="link-btn" onClick={() => toggleTheme(t)}>
                      {allInTheme ? 'Décocher ce thème' : 'Cocher ce thème'}
                    </button>
                  )}
                </div>
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
                          {qCount > 0 ? `${qCount} questions` : '0 question'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="cq-card rnd-box">
        <div className="rnd-sec-head">
          <h2>2. Nombre de questions</h2>
          <span className="rnd-pool-info">
            {pool.length} question{pool.length > 1 ? 's' : ''} disponible{pool.length > 1 ? 's' : ''} dans la sélection
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
            <label htmlFor="rnd-count-input">Ou choisis un nombre précis :</label>
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
            className="btn"
            onClick={startQuiz}
            disabled={pool.length === 0}
          >
            Lancer le quiz aléatoire ({effectiveCount} question{effectiveCount > 1 ? 's' : ''}) <Icon name="arrow" size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
