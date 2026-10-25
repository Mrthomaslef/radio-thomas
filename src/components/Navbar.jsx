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
            Leaderboard
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
              L’ensemble des questions n’a pas encore été relu et validé. La relecture médicale est en cours au fil des chapitres.
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
