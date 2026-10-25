import { useCallback, useEffect, useState } from 'react';
import { readName, saveName, subscribePlayer } from '../data/player.js';
import {
  fetchLeaderboard,
  fetchContributorsLeaderboard,
  fetchStarsLeaderboard,
  getCachedLeaderboard,
} from '../data/leaderboard.js';
import Icon from './Icons.jsx';

const normKey = (s) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').toLowerCase() : '');

export default function LeaderboardPage() {
  const [pseudo, setPseudo] = useState(readName);
  const [draft, setDraft] = useState(pseudo);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState(() =>
    window.location.hash === '#/contributeurs'
      ? 'contributors'
      : window.location.hash === '#/etoiles'
        ? 'stars'
        : 'quiz'
  );
  const [entries, setEntries] = useState(() => getCachedLeaderboard('quiz') || []);
  const [contributors, setContributors] = useState(() => getCachedLeaderboard('contributors') || []);
  const [starsList, setStarsList] = useState(() => getCachedLeaderboard('stars') || []);
  const [loading, setLoading] = useState(
    () =>
      getCachedLeaderboard('quiz') === null &&
      getCachedLeaderboard('contributors') === null &&
      getCachedLeaderboard('stars') === null
  );

  const loadLeaderboard = useCallback(async () => {
    try {
      const [quizList, contribList, starEntries] = await Promise.all([
        fetchLeaderboard(),
        fetchContributorsLeaderboard(),
        fetchStarsLeaderboard(),
      ]);
      setEntries(quizList);
      setContributors(contribList);
      setStarsList(starEntries);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    return subscribePlayer(() => {
      setPseudo(readName());
    });
  }, []);

  const submitPseudo = (e) => {
    e.preventDefault();
    const clean = draft.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    saveName(clean);
    setPseudo(clean);
    setEditing(false);
  };

  const myKey = normKey(pseudo);
  const activeList =
    tab === 'contributors' ? contributors : tab === 'stars' ? starsList : entries;
  const myIndex = myKey ? activeList.findIndex((e) => normKey(e.name) === myKey) : -1;
  const myEntry = myIndex >= 0 ? activeList[myIndex] : null;

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
          <a href="#/progression" className="cq-back">Progression →</a>
        </div>
        <h1>
          <span className="grad">Leaderboard</span>
          {tab === 'contributors' ? ' Contributeurs' : tab === 'stars' ? ' Étoiles' : ''}
        </h1>

        <div className="cq-chips admin-tabs" role="tablist" aria-label="Type de classement">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'quiz'}
            className={tab === 'quiz' ? 'on' : ''}
            onClick={() => setTab('quiz')}
          >
            Quiz
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'stars'}
            className={tab === 'stars' ? 'on' : ''}
            onClick={() => setTab('stars')}
          >
            ★ Étoiles
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'contributors'}
            className={tab === 'contributors' ? 'on' : ''}
            onClick={() => setTab('contributors')}
          >
            Contributeurs
          </button>
        </div>

        {tab === 'quiz' ? (
          <p className="lb-rule">
            Gagnez <strong>1 point par bonne réponse</strong> lorsque vous <strong>terminez et réussissez un quiz</strong> (au moins 60&nbsp;% de bonnes réponses). Les quiz «&nbsp;À revoir&nbsp;» ne rapportent pas de points.
          </p>
        ) : tab === 'stars' ? (
          <p className="lb-rule">
            Classement des <strong>étoiles ★</strong> gagnées sur le parcours quotidien (<strong>1★</strong> en terminant une étape, <strong>2★</strong> dès &gt;&nbsp;60&nbsp;% et <strong>3★</strong> dès &gt;&nbsp;90&nbsp;%).
          </p>
        ) : (
          <p className="lb-rule">
            Gagnez <strong>10 points par question proposée et validée</strong> (<a href="#/proposer">Proposer une question</a>) et <strong>1 point par signalement</strong> envoyé sur une question existante. Merci de contribuer à l’amélioration du quiz&nbsp;!
          </p>
        )}

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
          <div className="home-hello">
            <span>Session de <strong>{pseudo}</strong></span>
            <button
              type="button"
              className="pseudo-change-btn"
              onClick={() => { setDraft(pseudo); setEditing(true); }}
            >
              Changer de pseudo
            </button>
          </div>
        ) : (
          <div className="home-hello">
            <span>Aucun pseudo actif</span>
            <button
              type="button"
              className="pseudo-change-btn"
              onClick={() => { setDraft(''); setEditing(true); }}
            >
              Choisir un pseudo
            </button>
          </div>
        )}
      </header>

      {pseudo && !editing && (
        <div className="admin-summary prog-summary lb-my-summary">
          <div className="admin-stat">
            <strong>{myIndex >= 0 ? `#${myIndex + 1}` : '—'}</strong>
            <span>votre rang ({pseudo})</span>
          </div>
          <div className="admin-stat">
            <strong>
              {myEntry ? myEntry.points : 0}{' '}
              {tab === 'stars' ? '★' : myEntry && myEntry.points > 1 ? 'pts' : 'pt'}
            </strong>
            <span>{tab === 'stars' ? 'étoiles cumulées' : 'points cumulés'}</span>
          </div>
          <div className="admin-stat">
            <strong>
              {myEntry
                ? tab === 'contributors'
                  ? (myEntry.submissions || 0) + (myEntry.reports || 0)
                  : tab === 'stars'
                  ? myEntry.steps || 0
                  : myEntry.quizzes
                : 0}
            </strong>
            <span>
              {tab === 'contributors'
                ? 'contributions (questions + retours)'
                : tab === 'stars'
                ? myEntry && (myEntry.steps || 0) > 1
                  ? 'étapes validées'
                  : 'étape validée'
                : myEntry && myEntry.quizzes > 1
                ? 'quiz réussis'
                : 'quiz réussi'}
            </span>
          </div>
        </div>
      )}

      {loading && activeList.length === 0 ? (
        <p className="cq-loading" role="status">Chargement du classement…</p>
      ) : activeList.length === 0 ? (
        <div className="cq-card lb-empty">
          {tab === 'contributors' ? (
            <>
              <p>Aucune contribution enregistrée pour le moment.</p>
              <p className="lb-empty-sub">
                Proposez une nouvelle question (+10 pts une fois validée) ou signalez une remarque pendant un quiz (+1 pt)&nbsp;!
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                <a href="#/proposer" className="btn btn-small">Proposer une question (+10 pts)</a>
                <a href="#/" className="btn btn-small btn-ghost">Choisir un quiz</a>
              </div>
            </>
          ) : tab === 'stars' ? (
            <>
              <p>Aucune étoile enregistrée pour le moment.</p>
              <p className="lb-empty-sub">
                Validez votre première étape sur le parcours quotidien pour gagner vos premières étoiles&nbsp;!
              </p>
              <a href="#/" className="btn btn-small">Aller au parcours</a>
            </>
          ) : (
            <>
              <p>Aucun quiz terminé et réussi pour le moment.</p>
              <p className="lb-empty-sub">
                Terminez et réussissez un premier quiz pour apparaître dans le classement et marquer vos premiers points&nbsp;!
              </p>
              <a href="#/" className="btn btn-small">Choisir un quiz</a>
            </>
          )}
        </div>
      ) : (
        <div className="cq-card lb-card">
          <div className="lb-list" role="table" aria-label="Classement des utilisateurs">
            <div className="lb-row lb-row-head" role="row">
              <span className="lb-col-rank" role="columnheader">Rang</span>
              <span className="lb-col-name" role="columnheader">Pseudo</span>
              <span className="lb-col-quizzes" role="columnheader">
                {tab === 'contributors'
                  ? 'Contributions'
                  : tab === 'stars'
                  ? 'Étapes'
                  : 'Quiz réussis'}
              </span>
              <span className="lb-col-points" role="columnheader">
                {tab === 'stars' ? 'Étoiles' : 'Points'}
              </span>
            </div>
            {activeList.map((item, idx) => {
              const isMe = myKey && normKey(item.name) === myKey;
              const topClass = idx < 3 ? `lb-top-${idx + 1}` : '';
              const subs = item.submissions || 0;
              const reps = item.reports || 0;
              const stepsCount = item.steps || 0;
              const contribDetails = [
                subs > 0 ? `${subs} ${subs > 1 ? 'questions' : 'question'}` : null,
                reps > 0 ? `${reps} ${reps > 1 ? 'retours' : 'retour'}` : null,
              ]
                .filter(Boolean)
                .join(' · ') || `${item.points} pt`;
              const subDetail =
                tab === 'contributors'
                  ? contribDetails
                  : tab === 'stars'
                  ? `${stepsCount} ${stepsCount > 1 ? 'étapes' : 'étape'}`
                  : `${item.quizzes} quiz`;
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
                    <span className="lb-name-main">
                      <strong>{item.name}</strong>
                      {isMe && <span className="lb-me-tag">Vous</span>}
                    </span>
                    <span className="lb-name-sub">
                      {subDetail}
                    </span>
                  </span>
                  <span className="lb-col-quizzes" role="cell">
                    {subDetail}
                  </span>
                  <span className="lb-col-points" role="cell">
                    <strong>{item.points}</strong>{' '}
                    {tab === 'stars' ? '★' : item.points > 1 ? 'pts' : 'pt'}
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
