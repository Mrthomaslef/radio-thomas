import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import Reveal from './Reveal.jsx';

// Placeholder figures — replace with real numbers once the content exists.
const stats = [
  { value: 6, suffix: '', label: 'Complete courses' },
  { value: 120, suffix: '+', label: 'Bite-size lessons' },
  { value: 1500, suffix: '+', label: 'Quiz questions' },
  { value: 100, suffix: '%', label: 'Learn at your pace' },
];

function Counter({ to, suffix }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [n, setN] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const dur = 1400;
    let raf;
    const tick = (t) => {
      const p = Math.min((t - start) / dur, 1);
      setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);

  return <span ref={ref}>{n.toLocaleString()}{suffix}</span>;
}

export default function Stats() {
  return (
    <section className="stats">
      {stats.map((s, i) => (
        <Reveal key={s.label} delay={i * 0.08} className="stat">
          <strong><Counter to={s.value} suffix={s.suffix} /></strong>
          <span>{s.label}</span>
        </Reveal>
      ))}
    </section>
  );
}
