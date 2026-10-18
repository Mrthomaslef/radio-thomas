import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { quiz } from '../data/quiz.js';
import Icon from './Icons.jsx';
import Reveal from './Reveal.jsx';

export default function Quiz() {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const current = quiz[index];
  const answered = picked !== null;

  const choose = (i) => {
    if (answered) return;
    setPicked(i);
    if (i === current.answer) setScore((s) => s + 1);
  };

  const next = () => {
    if (index + 1 >= quiz.length) setDone(true);
    else {
      setIndex((i) => i + 1);
      setPicked(null);
    }
  };

  const restart = () => {
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };

  return (
    <section className="section" id="quiz">
      <Reveal className="section-head">
        <span className="eyebrow">Free sample</span>
        <h2>Test yourself — right now</h2>
        <p>Five quick questions. See how every course feels before you start.</p>
      </Reveal>

      <Reveal className="quiz">
        <div className="quiz-bar">
          <motion.div
            className="quiz-bar-fill"
            animate={{ width: `${((done ? quiz.length : index + (answered ? 1 : 0)) / quiz.length) * 100}%` }}
          />
        </div>

        <AnimatePresence mode="wait">
          {done ? (
            <motion.div key="done" className="quiz-body result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <div className="score-ring" style={{ '--p': (score / quiz.length) * 100 }}>
                <span>{score}/{quiz.length}</span>
              </div>
              <h3>{score === quiz.length ? 'Perfect score!' : score >= 3 ? 'Nice work!' : 'Good start — keep going!'}</h3>
              <p>The full courses go much deeper, with explanations and spaced repetition for every miss.</p>
              <div className="hero-actions center">
                <button className="btn" onClick={restart}>Try again</button>
                <a className="btn btn-ghost" href="#courses">Browse courses</a>
              </div>
            </motion.div>
          ) : (
            <motion.div key={index} className="quiz-body" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.35 }}>
              <span className="quiz-count">Question {index + 1} of {quiz.length}</span>
              <h3>{current.q}</h3>
              <div className="options">
                {current.options.map((o, i) => {
                  const state = !answered ? '' : i === current.answer ? 'correct' : i === picked ? 'wrong' : 'dim';
                  return (
                    <motion.button key={o} className={`option ${state}`} onClick={() => choose(i)} whileHover={!answered ? { x: 6 } : {}} whileTap={!answered ? { scale: 0.985 } : {}}>
                      <span className="option-key">{String.fromCharCode(65 + i)}</span>
                      <span className="option-text">{o}</span>
                      {answered && i === current.answer && <Icon name="check" size={20} />}
                      {answered && i === picked && i !== current.answer && <Icon name="cross" size={20} />}
                    </motion.button>
                  );
                })}
              </div>

              <AnimatePresence>
                {answered && (
                  <motion.div className="explain" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <p><strong>{picked === current.answer ? 'Correct. ' : 'Not quite. '}</strong>{current.why}</p>
                    <button className="btn btn-small" onClick={next}>
                      {index + 1 >= quiz.length ? 'See my score' : 'Next question'} <Icon name="arrow" size={16} />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </Reveal>
    </section>
  );
}
