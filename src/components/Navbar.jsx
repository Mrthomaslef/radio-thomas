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
      <a href="#/" className="brand">
        <span className="brand-mark">Q</span> QUIZ&nbsp;Cotten
      </a>
      <div className="nav-right">
        {pseudo && <span className="nav-user" title="Session active">{pseudo}</span>}
        <a href="#/progression" className="btn btn-ghost btn-small nav-prog">
          Ma progression
        </a>
      </div>
    </header>
  );
}
