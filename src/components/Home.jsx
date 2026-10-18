import { useState } from 'react';
import { motion } from 'framer-motion';
import { themes } from '../data/themes.js';
import { useQuestions } from '../data/useQuestions.js';
import { readName, saveName } from '../data/player.js';
import Icon from './Icons.jsx';

// Home: ask a pseudo, then pick a theme and one of its chapters.
// `openTheme` comes from the URL (#/epaule) so "back" from a chapter lands on the chapter list.
export default function Home({ openTheme }) {
  const { byChapter } = useQuestions();
  const [pseudo, setPseudo] = useState(readName);
  const [draft, setDraft] = useState(pseudo);
  const [editing, setEditing] = useState(!pseudo);

  const submit = (e) => {
    e.preventDefault();
    const clean = draft.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    saveName(clean);
    setPseudo(clean);
    setEditing(false);
  };

  return (
    <section className="home" id="top">
      <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
        QUIZ <span className="grad">Cotten</span>
      </motion.h1>

      {editing ? (
        <motion.form className="home-panel name-step" onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <label htmlFor="pseudo">Choisis un pseudo pour commencer</label>
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
            Ton pseudo, ton score et la date sont enregistrés à la fin de chaque quiz pour le suivi des résultats.
            Aucune autre donnée n’est collectée.
          </p>
          <button className="btn" type="submit" disabled={!draft.trim()}>
            Commencer <Icon name="arrow" size={18} />
          </button>
        </motion.form>
      ) : (
        <motion.div className="home-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <p className="home-hello">
            Salut <strong>{pseudo}</strong> !{' '}
            <button className="link-btn" onClick={() => setEditing(true)}>Changer de pseudo</button>
          </p>

          {themes.map((t) => {
            const open = openTheme === t.id;
            return (
              <div key={t.id} className="theme">
                <a href={open ? '#/' : `#/${t.id}`} className={`theme-head ${open ? 'on' : ''}`} aria-expanded={open}>
                  <span>{t.title}</span>
                  <span className="theme-count">{t.chapters.length} chapitres</span>
                </a>
                {open && (
                  <motion.ol className="chapters" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    {t.chapters.map((c, i) => (
                      <li key={c.id}>
                        {c.href ? (
                          <a href={c.href} className="chapter">
                            <b>{i + 1}</b> <span>{c.title}</span>
                            <span className="chapter-go">{(byChapter[c.id] || []).length || c.fallbackCount} questions <Icon name="arrow" size={16} /></span>
                          </a>
                        ) : (
                          <div className="chapter chapter-soon">
                            <b>{i + 1}</b> <span>{c.title}</span>
                            <span className="chapter-go">Bientôt</span>
                          </div>
                        )}
                      </li>
                    ))}
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
