import { useEffect, useState } from 'react';
import { readName } from '../data/player.js';
import { submitQuestionReport } from '../data/reports.js';

export default function Footer() {
  const [status, setStatus] = useState('checking');
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [refsOpen, setRefsOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('idle'); // idle | sending | sent
  const [feedbackError, setFeedbackError] = useState('');
  const labels = { checking: 'en vérification', online: 'en ligne', offline: 'hors ligne' };

  // Petit test de bout en bout : frontend -> /api/hello -> Supabase.
  useEffect(() => {
    fetch('/api/hello')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(() => setStatus('online'))
      .catch(() => setStatus('offline'));
  }, []);

  const handleSendFeedback = async (e) => {
    e.preventDefault();
    if (feedbackStatus === 'sending') return;
    setFeedbackError('');
    setFeedbackStatus('sending');
    try {
      await submitQuestionReport({
        name: readName() || 'Anonyme',
        chapter: 'ch1',
        questionId: 'site-bug',
        message: feedbackText,
      });
      setFeedbackStatus('sent');
      setFeedbackText('');
    } catch (err) {
      setFeedbackError(err.message || 'Impossible d’envoyer le retour.');
      setFeedbackStatus('idle');
    }
  };

  return (
    <>
      {feedbackOpen && (
        <div className="footer-feedback-wrap">
          <div className="cq-card footer-feedback-card">
            {feedbackStatus === 'sent' ? (
              <div className="footer-feedback-done">
                <p className="cq-report-sent" role="status">
                  Merci ! Votre retour a bien été envoyé à l’administrateur.
                </p>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => {
                    setFeedbackOpen(false);
                    setFeedbackStatus('idle');
                  }}
                >
                  Fermer
                </button>
              </div>
            ) : (
              <form className="cq-report-form" onSubmit={handleSendFeedback}>
                <label htmlFor="footer-feedback-input">
                  Une suggestion ou un problème technique sur le site ? Écrivez quelques phrases ci-dessous :
                </label>
                <textarea
                  id="footer-feedback-input"
                  className="admin-input"
                  rows={3}
                  maxLength={600}
                  placeholder="Décrivez votre retour ou le bug rencontré…"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  autoFocus
                  required
                />
                {feedbackError && (
                  <p className="admin-error" role="alert">
                    {feedbackError}
                  </p>
                )}
                <div className="cq-report-actions">
                  <button
                    type="submit"
                    className="btn btn-small"
                    disabled={feedbackStatus === 'sending' || feedbackText.trim().length < 2}
                  >
                    {feedbackStatus === 'sending' ? 'Envoi…' : 'Envoyer à l’admin'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => {
                      setFeedbackOpen(false);
                      setFeedbackError('');
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
      {refsOpen && (
        <div className="footer-feedback-wrap">
          <div className="cq-card footer-feedback-card footer-refs-card">
            <div className="footer-refs-head">
              <strong>📚 Ouvrage de référence</strong>
              <button
                type="button"
                className="daily-cal-close"
                onClick={() => setRefsOpen(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <p className="footer-refs-title">
              Imagerie musculosquelettique – Pathologies locorégionales
            </p>
            <p className="footer-refs-meta">
              Pr Anne Cotten · 2<sup>e</sup> édition, Elsevier Masson (2017) · ISBN 978-2-294-72182-3
            </p>
            <div className="footer-refs-actions">
              <a
                href="https://www.elsevier-masson.fr/imagerie-musculosquelettique-pathologies-locoregionales-9782294721823.html"
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-small"
              >
                Acheter l’ouvrage →
              </a>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => setRefsOpen(false)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      <footer className="footer">
        <span className="brand">
          <img src="/apple-touch-icon.png" alt="" className="brand-logo" /> QUIZ&nbsp;Cochin
        </span>
        <span className={`status status-${status}`}>
          <span className="dot" /> Serveur {labels[status]}
        </span>
        <a href="#/correcteur" className="admin-link">Espace correcteur</a>
        <a href="#/admin" className="admin-link">Espace admin</a>
        <button
          type="button"
          className="admin-link"
          onClick={() => {
            setFeedbackOpen((v) => !v);
            setRefsOpen(false);
            setFeedbackStatus('idle');
            setFeedbackError('');
          }}
        >
          Faire un retour / Signaler un bug
        </button>
        <button
          type="button"
          className="admin-link"
          onClick={() => {
            setRefsOpen((v) => !v);
            setFeedbackOpen(false);
          }}
        >
          Références
        </button>
        <span className="muted">© {new Date().getFullYear()} QUIZ Cochin. À but pédagogique uniquement.</span>
      </footer>
    </>
  );
}
