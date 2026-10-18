import { useEffect, useState } from 'react';
import Reveal from './Reveal.jsx';

export default function Footer() {
  const [status, setStatus] = useState('checking');

  // Tiny end-to-end check: frontend -> /api/hello -> Supabase.
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
          <h2>Ready to read your first image with confidence?</h2>
          <p>Start with the free quiz, then pick the course that fits your level.</p>
          <a href="#courses" className="btn">Get started</a>
        </Reveal>
      </section>
      <footer className="footer">
        <span className="brand"><span className="brand-mark">R</span> Radio&nbsp;Thomas</span>
        <span className={`status status-${status}`}>
          <span className="dot" /> Backend {status}
        </span>
        <span className="muted">© {new Date().getFullYear()} Radio Thomas. For education only — not medical advice.</span>
      </footer>
    </>
  );
}
