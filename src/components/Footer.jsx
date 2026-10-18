import { useEffect, useState } from 'react';
import Reveal from './Reveal.jsx';

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
      <section className="cta">
        <Reveal>
          <h2>Prêt à lire votre première image en toute confiance ?</h2>
          <p>Commencez par un quiz d’essai, puis choisissez le cours adapté à votre niveau.</p>
          <a href="#courses" className="btn">Commencer</a>
        </Reveal>
      </section>
      <footer className="footer">
        <span className="brand"><span className="brand-mark">R</span> Radio&nbsp;Thomas</span>
        <span className={`status status-${status}`}>
          <span className="dot" /> Serveur {labels[status]}
        </span>
        <a href="#/admin" className="admin-link">Espace formateur</a>
        <span className="muted">© {new Date().getFullYear()} Radio Thomas. À but pédagogique uniquement, ne remplace pas un avis médical.</span>
      </footer>
    </>
  );
}
