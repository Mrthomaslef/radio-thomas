import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Quiz from './Quiz.jsx';
import Reveal from './Reveal.jsx';
import Icon from './Icons.jsx';

export default function CoursePage({ course }) {
  const [active, setActive] = useState(course.modules[0].id);
  const totalMinutes = course.modules.reduce((n, m) => n + m.minutes, 0);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [course.slug]);

  // Highlight the lesson currently on screen in the sticky lesson bar.
  useEffect(() => {
    const els = course.modules.map((m) => document.getElementById(m.id)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-35% 0px -55% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [course]);

  return (
    <div className="course">
      <header className="course-hero">
        <a href="#/epaule" className="back">← Chapitres de l’épaule</a>
        <motion.span className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          L’épaule · chapitre 1
        </motion.span>
        <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          {course.title}
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7 }}>
          {course.intro}
        </motion.p>
        <div className="course-meta">
          <span>{course.modules.length} leçons</span>
          <span>≈ {totalMinutes} min de lecture</span>
          <span>{course.quiz.length} questions de quiz</span>
        </div>
        <a href="#quiz-cours" className="btn btn-ghost btn-small">Aller directement au quiz <Icon name="arrow" size={16} /></a>
      </header>

      <nav className="lesson-bar" aria-label="Leçons du cours">
        {course.modules.map((m, i) => (
          <a key={m.id} href={`#${m.id}`} className={active === m.id ? 'on' : ''}
             onClick={(e) => { e.preventDefault(); document.getElementById(m.id)?.scrollIntoView({ behavior: 'smooth' }); }}>
            <b>{i + 1}</b> {m.title}
          </a>
        ))}
      </nav>

      <div className="lessons">
        {course.modules.map((m, i) => (
          <Reveal as="section" key={m.id} className="lesson" >
            <div id={m.id} className="lesson-anchor" />
            <span className="lesson-n">Leçon {i + 1} · {m.minutes} min</span>
            <h2>{m.title}</h2>
            <ul className="points">
              {m.points.map((p) => <li key={p}>{p}</li>)}
            </ul>
            {m.table && (
              <div className="table-wrap">
                <table>
                  <thead><tr>{m.table.head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>
                    {m.table.rows.map((r) => (
                      <tr key={r[0]}>{r.map((c, k) => <td key={k} data-label={m.table.head[k]}>{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <aside className="retain"><strong>À retenir</strong><p>{m.retenir}</p></aside>
          </Reveal>
        ))}
      </div>

      <Quiz
        questions={course.quiz}
        id="quiz-cours"
        course={course.slug}
        quizId="quiz-final"
        eyebrow="Quiz du chapitre"
        title="Validez vos connaissances"
        intro={`${course.quiz.length} questions tirées du cours. Les réponses sont mélangées à chaque essai. Il faut 60 % de bonnes réponses pour valider.`}
      />

      <p className="source">{course.source}</p>
    </div>
  );
}
