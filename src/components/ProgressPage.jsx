import { useEffect, useState } from 'react';
import { themes } from '../data/themes.js';
import { useQuestions } from '../data/useQuestions.js';
import {
  readName,
  saveName,
  readAllProgress,
  clearChapterProgress,
  subscribePlayer,
  syncProgressFromServer,
} from '../data/player.js';
import Icon from './Icons.jsx';

const isPerfect = (q, picked) => {
  if (!Array.isArray(picked)) return false;
  const good = q.items.filter((i) => i.correct).map((i) => i.id).sort().join();
  return good === [...picked].sort().join();
};

export default function ProgressPage() {
  const { byChapter, loading } = useQuestions();
  const [pseudo, setPseudo] = useState(readName);
  const [draft, setDraft] = useState(pseudo);
  const [editing, setEditing] = useState(!pseudo);
  const [progress, setProgress] = useState(() => readAllProgress(readName()));

  useEffect(() => {
    const refresh = () => {
      const n = readName();
      setPseudo(n);
      setProgress(readAllProgress(n));
    };
    if (readName()) syncProgressFromServer(readName());
    return subscribePlayer(refresh);
  }, []);

  const submitPseudo = (e) => {
    e.preventDefault();
    const clean = draft.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    saveName(clean);
    setPseudo(clean);
    setProgress(readAllProgress(clean));
    setEditing(false);
  };

  const resetChapter = (chapterId, title) => {
    if (!window.confirm(`Réinitialiser vos réponses pour le chapitre « ${title} » ?`)) return;
    clearChapterProgress(chapterId, pseudo);
    setProgress(readAllProgress(pseudo));
  };

  // Compute global statistics across all chapters that have questions
  const allChapters = themes.flatMap((t) => t.chapters);
  let totalQuestions = 0;
  let totalAnswered = 0;
  let totalCorrect = 0;
  let completedChapters = 0;
  let activeChapters = 0;

  for (const ch of allChapters) {
    const qs = byChapter[ch.id] || [];
    if (qs.length === 0) continue;
    activeChapters += 1;
    totalQuestions += qs.length;
    const ans = progress[ch.id]?.answers || {};
    const answered = qs.filter((q) => ans[q.id]);
    const correct = answered.filter((q) => isPerfect(q, ans[q.id]));
    totalAnswered += answered.length;
    totalCorrect += correct.length;
    if (answered.length === qs.length) completedChapters += 1;
  }

  return (
    <section className="prog">
      <header className="prog-head">
        <div className="cq-top-links">
          <a href="#/" className="cq-back">← Accueil</a>
          <a href="#/classement" className="cq-back">Classement →</a>
        </div>
        <h1>Ma <span className="grad">progression</span></h1>

        {editing ? (
          <form className="home-panel name-step prog-name-form" onSubmit={submitPseudo}>
            <label htmlFor="prog-pseudo">Entre ton pseudo pour retrouver ta session</label>
            <input
              id="prog-pseudo"
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
            <button className="btn btn-small" type="submit" disabled={!draft.trim()}>
              Charger ma session <Icon name="arrow" size={16} />
            </button>
          </form>
        ) : (
          <p className="home-hello">
            Session de <strong>{pseudo}</strong> ·{' '}
            <button type="button" className="link-btn" onClick={() => { setDraft(pseudo); setEditing(true); }}>
              Changer de pseudo
            </button>
          </p>
        )}
      </header>

      {!editing && (
        <>
          <div className="admin-summary prog-summary">
            <div className="admin-stat">
              <strong>{totalAnswered} / {totalQuestions}</strong>
              <span>questions répondues</span>
            </div>
            <div className="admin-stat">
              <strong>{totalCorrect} / {totalAnswered || 0}</strong>
              <span>bonnes réponses ({totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0} %)</span>
            </div>
            <div className="admin-stat">
              <strong>{completedChapters} / {activeChapters}</strong>
              <span>chapitres terminés</span>
            </div>
          </div>

          <div className="prog-legend">
            <span><i className="cq-dot pending">1</i> Non validée</span>
            <span><i className="cq-dot ok">1</i> Bonne réponse</span>
            <span><i className="cq-dot ko">1</i> Erreur</span>
            <span className="prog-legend-hint">Cliquez sur un numéro pour accéder directement à la question.</span>
          </div>

          {loading ? (
            <p className="cq-loading">Chargement de la progression…</p>
          ) : (
            <div className="prog-themes">
              {themes.map((t) => (
                <div key={t.id} className="prog-theme">
                  <h2 className="prog-theme-title">{t.title}</h2>
                  <div className="prog-chapters">
                    {t.chapters.map((c, idx) => {
                      const qs = byChapter[c.id] || [];
                      const ans = progress[c.id]?.answers || {};
                      const answered = qs.filter((q) => ans[q.id]);
                      const correct = answered.filter((q) => isPerfect(q, ans[q.id])).length;
                      const pct = qs.length ? (answered.length / qs.length) * 100 : 0;

                      return (
                        <article key={c.id} className="cq-card prog-card">
                          <div className="prog-card-head">
                            <div>
                              <span className="prog-ch-num">Chapitre {idx + 1}</span>
                              <h3>{c.title}</h3>
                            </div>
                            <div className="prog-card-actions">
                              {answered.length > 0 && (
                                <button
                                  type="button"
                                  className="link-btn prog-reset"
                                  onClick={() => resetChapter(c.id, c.title)}
                                >
                                  Réinitialiser
                                </button>
                              )}
                              <a href={`#/quiz/${c.id}`} className="btn btn-small">
                                {qs.length === 0
                                  ? 'Voir'
                                  : answered.length === 0
                                  ? 'Commencer'
                                  : answered.length < qs.length
                                  ? 'Continuer'
                                  : 'Revoir'} <Icon name="arrow" size={15} />
                              </a>
                            </div>
                          </div>

                          {qs.length === 0 ? (
                            <p className="prog-empty">Aucune question dans ce chapitre pour le moment.</p>
                          ) : (
                            <>
                              <div className="cq-stats">
                                <span>Score <b>{correct}</b> / {answered.length || 0}</span>
                                <span>{answered.length} / {qs.length} questions</span>
                              </div>
                              <div className="cq-bar"><div style={{ width: `${pct}%` }} /></div>
                              <div className="cq-dots">
                                {qs.map((q, i) => {
                                  const a = ans[q.id];
                                  const cls = !a ? 'pending' : isPerfect(q, a) ? 'ok' : 'ko';
                                  const label = !a ? 'non validée' : isPerfect(q, a) ? 'bonne réponse' : 'erreur';
                                  return (
                                    <a
                                      key={q.id}
                                      href={`#/quiz/${c.id}?q=${i + 1}`}
                                      className={`cq-dot ${cls}`}
                                      aria-label={`${c.title} — Question ${i + 1} (${label})`}
                                      title={`Question ${i + 1} (${label})`}
                                    >
                                      {i + 1}
                                    </a>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
