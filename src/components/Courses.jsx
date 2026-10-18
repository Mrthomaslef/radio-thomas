import { motion } from 'framer-motion';
import { courses } from '../data/courses.js';
import Icon from './Icons.jsx';
import Reveal from './Reveal.jsx';

export default function Courses() {
  return (
    <section className="section" id="courses">
      <Reveal className="section-head">
        <span className="eyebrow">Programme</span>
        <h2>De la première exposition à l’examen final</h2>
        <p>Choisissez un cours ou suivez le parcours complet. Chaque leçon se termine par un petit quiz pour bien retenir.</p>
      </Reveal>

      <div className="grid">
        {courses.map((c, i) => {
          const Card = c.available ? motion.a : motion.article;
          return (
            <Reveal key={c.id} delay={(i % 3) * 0.1}>
              <Card
                className={`card ${c.available ? '' : 'card-soon'}`}
                style={{ '--accent': c.accent }}
                {...(c.available ? { href: c.href } : {})}
                whileHover={{ y: -8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <div className="card-icon"><Icon name={c.icon} size={26} /></div>
                <span className={`badge ${c.available ? 'badge-live' : ''}`}>{c.available ? 'Disponible' : 'Bientôt'}</span>
                <h3>{c.title}</h3>
                <p>{c.blurb}</p>
                <div className="card-meta">
                  <span>{c.level}</span>
                  <span>{c.lessons} leçons</span>
                  {c.quiz ? <span>{c.quiz} questions</span> : <span>{c.hours} h</span>}
                  {c.available && <span className="card-go">Ouvrir <Icon name="arrow" size={16} /></span>}
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
