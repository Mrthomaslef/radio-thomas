import { useEffect, useState } from 'react';
import { readName, subscribePlayer } from '../data/player.js';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [pseudo, setPseudo] = useState(readName);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => subscribePlayer(() => setPseudo(readName())), []);

  return (
    <header className={`nav ${scrolled ? 'nav-scrolled' : ''}`}>
      <a href="#/" className="brand" aria-label="QUIZ Cochin — Accueil">
        <img src="/apple-touch-icon.png" alt="" className="brand-logo" />
        <span className="brand-text">QUIZ&nbsp;Cochin</span>
      </a>
      <div className="nav-right">
        {pseudo && <span className="nav-user" title="Session active">{pseudo}</span>}
        <a href="#/classement" className="btn btn-ghost btn-small nav-lb">
          Leaderboard
        </a>
        <a href="#/progression" className="btn btn-ghost btn-small nav-prog">
          Progression
        </a>
      </div>
    </header>
  );
}
