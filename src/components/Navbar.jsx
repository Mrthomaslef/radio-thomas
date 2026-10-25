import { useEffect, useState } from 'react';
import { readName, subscribePlayer } from '../data/player.js';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [pseudo, setPseudo] = useState(readName);
  const [showBetaModal, setShowBetaModal] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => subscribePlayer(() => setPseudo(readName())), []);

  return (
    <>
      <header className={`nav ${scrolled ? 'nav-scrolled' : ''}`}>
        <div className="nav-brand-group">
          <a href="#/" className="brand" aria-label="QUIZ Cochin — Accueil">
            <img src="/apple-touch-icon.png" alt="" className="brand-logo" />
            <span className="brand-text">QUIZ&nbsp;Cochin</span>
          </a>
          <button
            type="button"
            className="nav-beta-badge"
            onClick={() => setShowBetaModal(true)}
            aria-label="Informations sur la version Bêta"
            title="Version Bêta — Cliquez pour en savoir plus"
          >
            Bêta
          </button>
        </div>
        <div className="nav-right">
          {pseudo && <span className="nav-user" title="Session active">{pseudo}</span>}
          <a href="#/classement" className="btn btn-ghost btn-small nav-lb">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ color: '#facc15', flexShrink: 0 }}>
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
              <path d="M4 22h16" />
              <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
              <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
              <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
            </svg>
            <span>Leaderboard</span>
          </a>
        </div>
      </header>

      {showBetaModal && (
        <div
          className="daily-cal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Version Bêta"
          onClick={() => setShowBetaModal(false)}
        >
          <div className="daily-cal-modal nav-beta-modal" onClick={(e) => e.stopPropagation()}>
            <div className="daily-cal-head">
              <div className="daily-cal-title-row">
                <span className="nav-beta-pill">BÊTA</span>
                <div>
                  <h3>Version Bêta</h3>
                </div>
              </div>
              <button
                type="button"
                className="daily-cal-close"
                onClick={() => setShowBetaModal(false)}
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <p className="nav-beta-text">
              L’ensemble des questions n’a pas encore été relu et validé. Veuillez toujours vous référer à l’ouvrage de référence mentionné en bas des questions.
            </p>

            <div className="daily-limit-modal-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setShowBetaModal(false)}
              >
                Compris
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
