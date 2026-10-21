const paths = {
  bone: 'M7 4a3 3 0 0 0-2.8 4A3 3 0 0 0 6 14l4 4a3 3 0 0 0 5.2 1.8A3 3 0 0 0 20 16.5a3 3 0 0 0-1.8-5.2L14 7A3 3 0 0 0 7 4Z',
  atom: 'M12 12m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M12 3c4 0 7 4 7 9s-3 9-7 9-7-4-7-9 3-9 7-9ZM4 8c3.5-2 9-1 13 2s5 8 3 11M4 16c-2-3.5 1-9 5-12s9-3 12 0',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  lungs: 'M9 4v8c0 3-1 5-4 6-2 .6-2-2-1-6s2-8 5-8Zm6 0v8c0 3 1 5 4 6 2 .6 2-2 1-6s-2-8-5-8ZM12 3v9',
  scan: 'M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M4 12h16',
  target: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cross: 'M6 6l12 12M18 6L6 18',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  play: 'M8 5v14l11-7z',
  bookmark: 'M6 4h12a1 1 0 0 1 1 1v16l-7-4-7 4V5a1 1 0 0 1 1-1Z',
};

export default function Icon({ name, size = 22, filled = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
