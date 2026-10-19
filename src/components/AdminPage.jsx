import { useCallback, useEffect, useMemo, useState } from 'react';
import QuestionsAdmin from './QuestionsAdmin.jsx';
import { useQuestions } from '../data/useQuestions.js';
import { extractAttemptsAndReports, resolveQuestionReport } from '../data/reports.js';

// Friendly names for course slugs; unknown slugs are shown as-is.
const COURSE_LABELS = {
  epaule: 'L’épaule',
  coude: 'Le coude',
  'main-poignet': 'Main et poignet',
  rachis: 'Rachis',
  hanche: 'La Hanche',
  genou: 'Le Genou',
  'jambe-cheville-pied': 'Jambe, Cheville et Pied',
  mixte: 'Mixte',
  'quiz-aleatoire': 'Quiz aléatoire',
  ch1: 'Pathologies de la coiffe',
  ch2: 'Instabilité d’épaule',
  ch3: 'Plexus brachial',
  ch4: 'Autres pathologies de l’épaule',
  ch5: 'Pathologies du compartiment latéral',
  ch6: 'Pathologies du compartiment médial',
  ch7: 'Pathologies du compartiment antérieur',
  ch8: 'Pathologies du compartiment postérieur',
  ch9: 'Autres affections du coude',
  ch10: 'Pathologies dégénératives du poignet',
  ch11: 'Pathologies ligamentaires du poignet',
  ch12: 'Pathologies tendineuses du poignet',
  ch13: 'Pathologies vasculonerveuses',
  ch14: 'Pathologies dégénératives et tendineuses de la main et des doigts',
  ch15: 'Discopathies dégénératives cervicales',
  ch16: 'Affections mécaniques du rachis dorsolombaire',
  ch17: 'Autres affections rachidiennes',
  ch18: 'Pathologies osseuses de la hanche',
  ch19: 'Pathologies articulaires de la hanche',
  ch20: 'Pathologies abarticulaires de la hanche',
  ch21: 'Pathologies du plexus lombosacré',
  ch22: 'Autres pathologies de la ceinture pelvienne',
  ch23: 'Pathologies antérieures',
  ch24: 'Pathologies des ménisques',
  ch25: 'Pathologies des ligaments croisés',
  ch26: 'Pathologies des tissus mous collatéraux et postérieurs',
  ch27: 'Autres pathologies du genou',
  ch28: 'Pathologies de la jambe',
  ch29: 'Pathologies des tissus mous',
  ch30: 'Autres pathologies de la cheville et du pied',
  'pathologie-coiffe': 'Pathologies de la coiffe des rotateurs (ancien)',
  'landing-demo': 'Quiz d’essai (ancien)',
};
const courseLabel = (slug) => COURSE_LABELS[slug] || slug;

const formatDate = (iso) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

// Hidden page (#/admin, not linked anywhere): password-protected list of quiz results.
export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [attempts, setAttempts] = useState(null);
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [tab, setTab] = useState('results'); // results | questions | reports
  const [editTarget, setEditTarget] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);
  const { byChapter } = useQuestions();

  // Map question id -> { chapter, enonce, index }
  const questionMap = useMemo(() => {
    const map = {};
    for (const [ch, list] of Object.entries(byChapter || {})) {
      (list || []).forEach((q, i) => {
        map[q.id] = { chapter: ch, enonce: q.enonce, number: i + 1 };
      });
    }
    return map;
  }, [byChapter]);

  // Keep this page out of search engines while it is displayed.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    window.scrollTo(0, 0);
    return () => meta.remove();
  }, []);

  const login = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(data.error || 'Erreur inattendue, réessayez.');
        return;
      }
      const parsed = extractAttemptsAndReports(data);
      setAttempts(parsed.attempts);
      setReports(parsed.reports);
    } catch {
      setError('Serveur injoignable, réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setAttempts(null);
    setReports([]);
    setPassword('');
    setNameFilter('');
    setCourseFilter('');
    setTab('results');
    setEditTarget(null);
    setError('');
  };

  const handleResolveReport = useCallback(
    async (reportOrContext) => {
      const id = reportOrContext?.reportId ?? reportOrContext?.id;
      const questionId = reportOrContext?.questionId ?? reportOrContext?.question_id;
      if (!id) return;
      setResolvingId(id);
      try {
        await resolveQuestionReport({ password, id, questionId });
        setReports((prev) =>
          prev.map((r) => (String(r.id) === String(id) ? { ...r, resolved_at: new Date().toISOString() } : r))
        );
      } catch {
        // Ignore or keep unresolved
      } finally {
        setResolvingId(null);
      }
    },
    [password]
  );

  const openQuestionFromReport = (r) => {
    const qInfo = questionMap[r.question_id];
    setEditTarget({
      questionId: r.question_id,
      chapter: r.chapter || qInfo?.chapter || 'ch1',
      reportMessage: r.message,
      reportAuthor: r.name,
      reportId: r.id,
    });
    setTab('questions');
  };

  const clearEditTarget = useCallback(() => setEditTarget(null), []);

  const openReports = useMemo(() => reports.filter((r) => !r.resolved_at), [reports]);
  const resolvedReports = useMemo(() => reports.filter((r) => r.resolved_at), [reports]);

  const courses = useMemo(() => [...new Set((attempts || []).map((a) => a.course))].sort(), [attempts]);

  const rows = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    return (attempts || []).filter(
      (a) => (!q || a.name.toLowerCase().includes(q)) && (!courseFilter || a.course === courseFilter)
    );
  }, [attempts, nameFilter, courseFilter]);

  const passedCount = rows.filter((a) => a.passed).length;

  if (attempts === null) {
    return (
      <section className="section admin admin-login">
        <span className="eyebrow">Espace privé</span>
        <h1 className="admin-title">Administration</h1>
        <form onSubmit={login} className="admin-form">
          <label htmlFor="admin-password">Mot de passe</label>
          <input
            id="admin-password"
            className="admin-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button className="btn" type="submit" disabled={loading || !password}>
            {loading ? 'Vérification…' : 'Se connecter'}
          </button>
        </form>
      </section>
    );
  }

  const titleByTab = {
    results: 'Résultats des quiz',
    questions: 'Questions du quiz',
    reports: 'Signalements & retours',
  };

  return (
    <section className="section admin">
      <div className="admin-head">
        <div>
          <span className="eyebrow">Espace privé</span>
          <h1 className="admin-title">{titleByTab[tab] || 'Administration'}</h1>
        </div>
        <button className="btn btn-ghost btn-small" onClick={logout}>Se déconnecter</button>
      </div>

      {openReports.length > 0 && tab !== 'reports' && (
        <div className="admin-notif-banner" role="status">
          <div>
            <strong>
              ⚑ {openReports.length} {openReports.length > 1 ? 'nouveaux retours d’utilisateurs' : 'nouveau retour d’utilisateur'}
            </strong>
            <span>Un participant a signalé une remarque sur une question du quiz.</span>
          </div>
          <button type="button" className="btn btn-small" onClick={() => setTab('reports')}>
            Lire {openReports.length > 1 ? 'les retours' : 'le retour'}
          </button>
        </div>
      )}

      <div className="cq-chips admin-tabs" role="tablist" aria-label="Sections">
        <button role="tab" aria-selected={tab === 'results'} className={tab === 'results' ? 'on' : ''} onClick={() => setTab('results')}>
          Résultats
        </button>
        <button role="tab" aria-selected={tab === 'questions'} className={tab === 'questions' ? 'on' : ''} onClick={() => setTab('questions')}>
          Questions
        </button>
        <button role="tab" aria-selected={tab === 'reports'} className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>
          Signalements
          {openReports.length > 0 && <span className="admin-tab-badge">{openReports.length}</span>}
        </button>
      </div>

      {tab === 'questions' ? (
        <QuestionsAdmin
          password={password}
          editTarget={editTarget}
          onClearEditTarget={clearEditTarget}
          onResolveReport={handleResolveReport}
        />
      ) : tab === 'reports' ? (
        <div className="admin-reports">
          {openReports.length === 0 ? (
            <p className="admin-empty">Aucun nouveau signalement à traiter pour le moment.</p>
          ) : (
            <div className="admin-reports-list">
              {openReports.map((r) => {
                const qInfo = questionMap[r.question_id];
                const chKey = r.chapter || qInfo?.chapter || 'ch1';
                return (
                  <article key={r.id} className="admin-report-card">
                    <div className="admin-report-meta">
                      <span>
                        <strong>{r.name}</strong> · {formatDate(r.created_at)}
                      </span>
                      <span className="admin-report-tag">
                        {courseLabel(chKey)} · {qInfo ? `Question ${qInfo.number}` : r.question_id} ({r.question_id})
                      </span>
                    </div>
                    {qInfo?.enonce && (
                      <p className="admin-report-q">
                        <span>Question :</span> {qInfo.enonce}
                      </p>
                    )}
                    <p className="admin-report-msg">« {r.message} »</p>
                    <div className="admin-report-actions">
                      <button type="button" className="btn btn-small" onClick={() => openQuestionFromReport(r)}>
                        Modifier la question
                      </button>
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        disabled={resolvingId === r.id}
                        onClick={() => handleResolveReport(r)}
                      >
                        {resolvingId === r.id ? 'Traitement…' : 'Marquer comme traité'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {resolvedReports.length > 0 && (
            <details className="qa-deleted" style={{ marginTop: 20 }}>
              <summary>{resolvedReports.length} signalement(s) déjà traité(s)</summary>
              <div className="admin-reports-list" style={{ marginTop: 12 }}>
                {resolvedReports.map((r) => {
                  const qInfo = questionMap[r.question_id];
                  const chKey = r.chapter || qInfo?.chapter || 'ch1';
                  return (
                    <article key={r.id} className="admin-report-card is-resolved">
                      <div className="admin-report-meta">
                        <span>
                          <strong>{r.name}</strong> · {formatDate(r.created_at)}
                        </span>
                        <span className="admin-report-tag">
                          {courseLabel(chKey)} · {r.question_id}
                        </span>
                      </div>
                      <p className="admin-report-msg">« {r.message} »</p>
                      <div className="admin-report-actions">
                        <button type="button" className="btn btn-small btn-ghost" onClick={() => openQuestionFromReport(r)}>
                          Modifier la question
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      ) : (
        <>
          <div className="admin-summary">
            <div className="admin-stat"><strong>{rows.length}</strong><span>passages</span></div>
            <div className="admin-stat"><strong>{passedCount}</strong><span>réussites</span></div>
            <div className="admin-stat">
              <strong>{rows.length ? Math.round((passedCount / rows.length) * 100) : 0} %</strong>
              <span>taux de réussite</span>
            </div>
          </div>

          <div className="admin-filters">
            <input
              className="admin-input"
              type="search"
              placeholder="Filtrer par nom"
              aria-label="Filtrer par nom"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
            <select
              className="admin-input"
              aria-label="Filtrer par cours"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="">Tous les cours</option>
              {courses.map((c) => <option key={c} value={c}>{courseLabel(c)}</option>)}
            </select>
          </div>

          {rows.length === 0 ? (
            <p className="admin-empty">Aucun résultat pour le moment.</p>
          ) : (
            <div className="admin-table-wrap table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Nom</th><th>Cours</th><th>Quiz</th><th>Score</th><th>Résultat</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDate(a.created_at)}</td>
                      <td>{a.name}</td>
                      <td>{courseLabel(a.course)}</td>
                      <td>{courseLabel(a.quiz)}</td>
                      <td>{a.score}/{a.total}</td>
                      <td>
                        <span className={`admin-badge ${a.passed ? 'admin-badge-pass' : 'admin-badge-fail'}`}>
                          {a.passed ? 'Réussi' : 'À revoir'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
