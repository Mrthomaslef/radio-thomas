import { motion } from 'framer-motion';
import XrayHero from './XrayHero.jsx';
import Icon from './Icons.jsx';

const word = {
  hidden: { opacity: 0, y: 30 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: 0.1 + i * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] } }),
};

export default function Hero() {
  const headline = ['See', 'inside', 'the', 'human', 'body.', 'Learn', 'to', 'read', 'it.'];
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <motion.span className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
          Medical radiography · courses & quizzes
        </motion.span>
        <h1>
          {headline.map((w, i) => (
            <motion.span key={i} custom={i} variants={word} initial="hidden" animate="show" className={i >= 5 ? 'grad' : ''}>
              {w}
            </motion.span>
          ))}
        </h1>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.7 }}>
          Structured courses, bite-size lessons and interactive quizzes that take you from
          positioning basics to confident image interpretation.
        </motion.p>
        <motion.div className="hero-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.7 }}>
          <a href="#courses" className="btn">
            Explore courses <Icon name="arrow" size={18} />
          </a>
          <a href="#quiz" className="btn btn-ghost">
            <Icon name="play" size={16} /> Try a free quiz
          </a>
        </motion.div>
      </div>
      <XrayHero />
      <div className="scroll-hint" aria-hidden="true"><span /></div>
    </section>
  );
}
