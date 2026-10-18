import { useEffect, useState } from 'react';

const links = [
  ['Cours', '#courses'],
  ['Comment ça marche', '#how'],
  ['Quiz', '#quiz'],
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Lock page scroll while the mobile menu is open; close on Escape.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className={`nav ${scrolled || open ? 'nav-scrolled' : ''} ${open ? 'nav-open' : ''}`}>
      <a href="#top" className="brand" onClick={close}>
        <span className="brand-mark">R</span> Radio&nbsp;Thomas
      </a>
      <nav className="nav-links" id="main-menu">
        {links.map(([label, href]) => (
          <a key={href} href={href} onClick={close}>{label}</a>
        ))}
        <a href="#quiz" className="btn btn-small nav-cta" onClick={close}>Tester un quiz</a>
      </nav>
      <button
        className="burger"
        aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={open}
        aria-controls="main-menu"
        onClick={() => setOpen((o) => !o)}
      >
        <span /><span /><span />
      </button>
    </header>
  );
}
