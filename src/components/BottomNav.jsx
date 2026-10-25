import { useEffect, useState } from 'react';

function getActiveTab(hash) {
  const h = hash || '#/';
  if (h === '#/progression') return 'progression';
  if (
    h === '#/chapitres' ||
    h.startsWith('#/quiz/') ||
    h === '#/aleatoire' ||
    h === '#/proposer' ||
    (h.startsWith('#/') &&
      h !== '#/' &&
      h !== '#/admin' &&
      h !== '#/correcteur' &&
      h !== '#/classement' &&
      h !== '#/leaderboard' &&
      h !== '#/contributeurs')
  ) {
    return 'quiz';
  }
  if (h === '#/' || h === '') return 'accueil';
  return '';
}

export default function BottomNav() {
  const [active, setActive] = useState(() =>
    typeof window !== 'undefined' ? getActiveTab(window.location.hash) : 'accueil'
  );

  useEffect(() => {
    const onHash = () => setActive(getActiveTab(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (
    typeof window !== 'undefined' &&
    (window.location.hash === '#/admin' || window.location.hash === '#/correcteur')
  ) {
    return null;
  }

  return (
    <nav className="bottom-nav-wrap" aria-label="Navigation principale">
      <div className="bottom-nav">
        <a
          href="#/"
          className={`bottom-nav-item ${active === 'accueil' ? 'is-active' : ''}`}
          aria-current={active === 'accueil' ? 'page' : undefined}
        >
          <svg
            className="bottom-nav-icon"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill={active === 'accueil' ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1v-9.5Z" />
          </svg>
          <span className="bottom-nav-label">Accueil</span>
        </a>

        <a
          href="#/chapitres"
          className={`bottom-nav-item ${active === 'quiz' ? 'is-active' : ''}`}
          aria-current={active === 'quiz' ? 'page' : undefined}
        >
          <svg
            className="bottom-nav-icon"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <path d="M9 4.5h6v2.5a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V4.5Z" />
            <path d="M9.5 11.5a2.5 2.5 0 0 1 4.6 1.3c0 1.5-2.1 1.8-2.1 3.2" />
            <circle cx="12" cy="18.2" r="0.8" fill="currentColor" stroke="none" />
          </svg>
          <span className="bottom-nav-label">Quiz</span>
        </a>

        <a
          href="#/progression"
          className={`bottom-nav-item ${active === 'progression' ? 'is-active' : ''}`}
          aria-current={active === 'progression' ? 'page' : undefined}
        >
          <svg
            className="bottom-nav-icon"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
          <span className="bottom-nav-label">Ma progression</span>
        </a>
      </div>
    </nav>
  );
}
