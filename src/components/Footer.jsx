import { useEffect, useState } from 'react';

export default function Footer() {
  const [status, setStatus] = useState('checking');
  const labels = { checking: 'en vérification', online: 'en ligne', offline: 'hors ligne' };

  // Petit test de bout en bout : frontend -> /api/hello -> Supabase.
  useEffect(() => {
    fetch('/api/hello')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => setStatus('online'))
      .catch(() => setStatus('offline'));
  }, []);

  return (
    <>
      <footer className="footer">
        <span className="brand"><span className="brand-mark">Q</span> QUIZ&nbsp;Cotten</span>
        <span className={`status status-${status}`}>
          <span className="dot" /> Serveur {labels[status]}
        </span>
        <a href="#/correcteur" className="admin-link">Espace correcteur</a>
        <a href="#/admin" className="admin-link">Espace admin</a>
        <span className="muted">© {new Date().getFullYear()} QUIZ Cotten. À but pédagogique uniquement.</span>
      </footer>
    </>
  );
}
