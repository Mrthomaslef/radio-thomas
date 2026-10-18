import { useEffect, useState } from 'react';

const links = [
  ['Courses', '#courses'],
  ['How it works', '#how'],
  ['Quiz', '#quiz'],
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`nav ${scrolled ? 'nav-scrolled' : ''}`}>
      <a href="#top" className="brand">
        <span className="brand-mark">R</span> Radio&nbsp;Thomas
      </a>
      <nav className="nav-links">
        {links.map(([label, href]) => (
          <a key={href} href={href}>{label}</a>
        ))}
      </nav>
      <a href="#quiz" className="btn btn-small">Try a quiz</a>
    </header>
  );
}
