import { useEffect, useMemo, useState } from 'react';

// Friendly names for course slugs; unknown slugs are shown as-is.
const COURSE_LABELS = {
  epaule: 'L’épaule',
  ch1: 'Pathologies de la coiffe',
  ch2: 'Instabilité d’épaule',
  ch3: 'Plexus brachial',
  ch4: 'Autres pathologies de l’épaule',
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');

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
      setAttempts(data.attempts);
    } catch {
      setError('Serveur injoignable, réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setAttempts(null);
    setPassword('');
    setNameFilter('');
    setCourseFilter('');
    setError('');
  };

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

  return (
    <section className="section admin">
      <div className="admin-head">
        <div>
          <span className="eyebrow">Espace privé</span>
          <h1 className="admin-title">Résultats des quiz</h1>
        </div>
        <button className="btn btn-ghost btn-small" onClick={logout}>Se déconnecter</button>
      </div>

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
    </section>
  );
}
