import { motion } from 'framer-motion';
import XrayHero from './XrayHero.jsx';
import Icon from './Icons.jsx';

const word = {
  hidden: { opacity: 0, y: 30 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: 0.1 + i * 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] } }),
};

export default function Hero() {
  const headline = ['Voyez', 'l’intérieur', 'du', 'corps', 'humain.', 'Apprenez', 'à', 'le', 'lire.'];
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <motion.span className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
          Radiologie médicale · cours & quiz
        </motion.span>
        <h1>
          {headline.map((w, i) => (
            <motion.span key={i} custom={i} variants={word} initial="hidden" animate="show" className={i >= 5 ? 'grad' : ''}>
              {w}
            </motion.span>
          ))}
        </h1>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9, duration: 0.7 }}>
          Des cours structurés, des leçons courtes et des quiz interactifs pour passer des
          bases du positionnement à une interprétation d’image sûre.
        </motion.p>
        <motion.div className="hero-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.7 }}>
          <a href="#courses" className="btn">
            Découvrir les cours <Icon name="arrow" size={18} />
          </a>
          <a href="#quiz" className="btn btn-ghost">
            <Icon name="play" size={16} /> Essayer un quiz gratuit
          </a>
        </motion.div>
      </div>
      <XrayHero />
      <div className="scroll-hint" aria-hidden="true"><span /></div>
    </section>
  );
}
