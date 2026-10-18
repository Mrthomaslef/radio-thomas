import { motion } from 'framer-motion';
import { courses } from '../data/courses.js';
import Icon from './Icons.jsx';
import Reveal from './Reveal.jsx';

export default function Courses() {
  return (
    <section className="section" id="courses">
      <Reveal className="section-head">
        <span className="eyebrow">Curriculum</span>
        <h2>Everything from first exposure to final exam</h2>
        <p>Pick a course, or follow the full path. Each lesson ends with a quick quiz so it actually sticks.</p>
      </Reveal>

      <div className="grid">
        {courses.map((c, i) => (
          <Reveal key={c.id} delay={(i % 3) * 0.1}>
            <motion.article
              className="card"
              style={{ '--accent': c.accent }}
              whileHover={{ y: -8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <div className="card-icon"><Icon name={c.icon} size={26} /></div>
              <span className="badge">{c.level}</span>
              <h3>{c.title}</h3>
              <p>{c.blurb}</p>
              <div className="card-meta">
                <span>{c.lessons} lessons</span>
                <span>{c.hours} h</span>
                <span className="card-go">Start <Icon name="arrow" size={16} /></span>
              </div>
            </motion.article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
