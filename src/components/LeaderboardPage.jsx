import { useCallback, useEffect, useState } from 'react';
import { useQuestions } from '../data/useQuestions.js';
import { readName, saveName, subscribePlayer, syncProgressFromServer } from '../data/player.js';
import { fetchLeaderboard } from '../data/leaderboard.js';
import Icon from './Icons.jsx';

const normKey = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').toLowerCase() : '');

export default function LeaderboardPage() {
  const { byChapter, loading: questionsLoading } = useQuestions();
  const [pseudo, setPseudo] = useState(readName);
  const [draft, setDraft] = useState(pseudo);
  const [editing, setEditing] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const current = readName();
      if (current) {
        await syncProgressFromServer(current);
      }
      const list = await fetchLeaderboard(byChapter);
      setEntries(list);
    } finally {
      setLoading(false);
    }
  }, [byChapter]);

  useEffect(() => {
    if (!questionsLoading) {
      loadLeaderboard();
    }
  }, [questionsLoading, loadLeaderboard]);

  useEffect(() => {
    return subscribePlayer(() => {
      setPseudo(readName());
      if (!questionsLoading) loadLeaderboard();
    });
  }, [questionsLoading, loadLeaderboard]);

  const submitPseudo = (e) => {
    e.preventDefault();
    const clean = draft.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    saveName(clean);
    setPseudo(clean);
    setEditing(false);
  };

  const myKey = normKey(pseudo);
  const myIndex = myKey ? entries.findIndex((e) => normKey(e.name) === myKey) : -1;
  const myEntry = myIndex >= 0 ? entries[myIndex] : null;

  const rankBadge = (idx) => {
    if (idx === 0) return '🥇';
    if (idx === 1) return '🥈';
    if (idx === 2) return '🥉';
    return `#${idx + 1}`;
  };

  return (
    <section className="prog lb-page">
      <header className="prog-head">
        <div className="cq-top-links">
          <a href="#/" className="cq-back">← Accueil</a>
          <a href="#/progression" className="cq-back">Ma progression →</a>
        </div>
        <h1><span className="grad">Leaderboard</span></h1>
        <p className="lb-rule">
          Gagnez <strong>1 point par bonne réponse</strong> lorsque vous <strong>terminez et réussissez un quiz</strong> (au moins 60&nbsp;% de bonnes réponses). Les quiz «&nbsp;À revoir&nbsp;» ne rapportent pas de points.
        </p>

        {editing ? (
          <form className="home-panel name-step prog-name-form" onSubmit={submitPseudo}>
            <label htmlFor="lb-pseudo">Entre ton pseudo pour retrouver ta session</label>
            <input
              id="lb-pseudo"
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
        ) : pseudo ? (
          <p className="home-hello">
            Session de <strong>{pseudo}</strong> ·{' '}
            <button type="button" className="link-btn" onClick={() => { setDraft(pseudo); setEditing(true); }}>
              Changer de pseudo
            </button>
          </p>
        ) : (
          <p className="home-hello">
            Aucun pseudo actif ·{' '}
            <button type="button" className="link-btn" onClick={() => { setDraft(''); setEditing(true); }}>
              Choisir un pseudo
            </button>
          </p>
        )}
      </header>

      {pseudo && !editing && (
        <div className="admin-summary prog-summary lb-my-summary">
          <div className="admin-stat">
            <strong>{myIndex >= 0 ? `#${myIndex + 1}` : '—'}</strong>
            <span>votre rang ({pseudo})</span>
          </div>
          <div className="admin-stat">
            <strong>{myEntry ? myEntry.points : 0} {myEntry && myEntry.points > 1 ? 'pts' : 'pt'}</strong>
            <span>points cumulés</span>
          </div>
          <div className="admin-stat">
            <strong>{myEntry ? myEntry.quizzes : 0}</strong>
            <span>{myEntry && myEntry.quizzes > 1 ? 'quiz terminés' : 'quiz terminé'}</span>
          </div>
        </div>
      )}

      {loading && entries.length === 0 ? (
        <p className="cq-loading" role="status">Chargement du classement…</p>
      ) : entries.length === 0 ? (
        <div className="cq-card lb-empty">
          <p>Aucun quiz terminé pour le moment.</p>
          <p className="lb-empty-sub">
            Terminez un premier quiz pour apparaître dans le classement et marquer vos premiers points !
          </p>
          <a href="#/" className="btn btn-small">Choisir un quiz</a>
        </div>
      ) : (
        <div className="cq-card lb-card">
          <div className="lb-list" role="table" aria-label="Classement des utilisateurs">
            <div className="lb-row lb-row-head" role="row">
              <span className="lb-col-rank" role="columnheader">Rang</span>
              <span className="lb-col-name" role="columnheader">Pseudo</span>
              <span className="lb-col-quizzes" role="columnheader">Quiz terminés</span>
              <span className="lb-col-points" role="columnheader">Points</span>
            </div>
            {entries.map((item, idx) => {
              const isMe = myKey && normKey(item.name) === myKey;
              const topClass = idx < 3 ? `lb-top-${idx + 1}` : '';
              return (
                <div
                  key={normKey(item.name)}
                  className={`lb-row ${topClass} ${isMe ? 'is-me' : ''}`}
                  role="row"
                >
                  <span className="lb-col-rank" role="cell">
                    <span className={`lb-rank-pill ${topClass}`}>{rankBadge(idx)}</span>
                  </span>
                  <span className="lb-col-name" role="cell">
                    <strong>{item.name}</strong>
                    {isMe && <span className="lb-me-tag">Vous</span>}
                  </span>
                  <span className="lb-col-quizzes" role="cell">
                    {item.quizzes} quiz
                  </span>
                  <span className="lb-col-points" role="cell">
                    <strong>{item.points}</strong> {item.points > 1 ? 'pts' : 'pt'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
