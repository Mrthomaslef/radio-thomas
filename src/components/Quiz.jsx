import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { quiz as defaultQuiz } from '../data/quiz.js';
import Icon from './Icons.jsx';
import Reveal from './Reveal.jsx';

// Shuffle answer options (keeps track of the right one) so the answer is not always "A".
function shuffleQuestions(questions) {
  return questions.map((q) => {
    const order = q.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) };
  });
}

const NAME_KEY = 'radio-thomas:name';
const readName = () => {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
};
const saveName = (n) => {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode: ignore */ }
};

export default function Quiz({
  questions = defaultQuiz,
  id = 'quiz',
  course = 'landing-demo', // slugs stored with the result
  quizId = 'essai',
  eyebrow = 'Essai gratuit',
  title = 'Testez-vous dès maintenant',
  intro = 'Cinq questions rapides pour découvrir l’esprit des cours avant de commencer.',
  passMark = 0.6,
}) {
  const [round, setRound] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quiz = useMemo(() => shuffleQuestions(questions), [questions, round]);
  const [name, setName] = useState(readName);
  const [started, setStarted] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [save, setSave] = useState('idle'); // idle | saving | saved | error
  const savedRound = useRef(-1);

  const current = quiz[index];
  const answered = picked !== null;
  const passed = score / quiz.length >= passMark;

  const start = (e) => {
    e.preventDefault();
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    setName(clean);
    saveName(clean);
    setStartedAt(new Date().toISOString());
    setStarted(true);
  };

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
    setRound((r) => r + 1);
    setIndex(0);
    setPicked(null);
    setScore(0);
    setDone(false);
    setSave('idle');
    setStartedAt(new Date().toISOString());
  };

  const sendResult = async () => {
    setSave('saving');
    try {
      const r = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, course, quiz: quizId, score, total: quiz.length, passed, startedAt }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setSave('saved');
    } catch {
      setSave('error');
    }
  };

  // Store the result once, when the quiz is finished.
  useEffect(() => {
    if (done && savedRound.current !== round) {
      savedRound.current = round;
      sendResult();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const progressStep = done ? quiz.length : index + (answered ? 1 : 0);

  return (
    <section className="section" id={id}>
      <Reveal className="section-head">
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{intro}</p>
      </Reveal>

      <Reveal className="quiz">
        <div className="quiz-bar">
          <motion.div className="quiz-bar-fill" animate={{ width: `${started ? (progressStep / quiz.length) * 100 : 0}%` }} />
        </div>

        <AnimatePresence mode="wait">
          {!started ? (
            <motion.form key="name" className="quiz-body name-step" onSubmit={start} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <h3>Avant de commencer</h3>
              <label htmlFor={`${id}-name`}>Votre prénom et nom</label>
              <input
                id={`${id}-name`}
                className="name-input"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Camille Martin"
                maxLength={80}
                autoComplete="name"
                required
              />
              <p className="privacy">
                Votre nom, votre score et la date du quiz sont enregistrés pour permettre à votre formateur de suivre
                les résultats. Aucune autre donnée n’est collectée. Pour faire supprimer vos données, contactez-le.
              </p>
              <button className="btn" type="submit" disabled={!name.trim()}>
                Commencer le quiz <Icon name="arrow" size={18} />
              </button>
              <span className="quiz-count">{quiz.length} questions · {Math.round(passMark * 100)} % pour valider</span>
            </motion.form>
          ) : done ? (
            <motion.div key="done" className="quiz-body result" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              <div className="score-ring" style={{ '--p': (score / quiz.length) * 100 }}>
                <span>{score}/{quiz.length}</span>
              </div>
              <h3>
                {score === quiz.length ? 'Sans faute !' : passed ? 'Bien joué, quiz validé !' : 'Pas encore, relisez le cours et réessayez.'}
              </h3>
              <p>
                {passed
                  ? `Bravo ${name.split(' ')[0]}, vous avez atteint le score de réussite. Les questions sont mélangées à chaque essai : refaites-le pour viser le sans-faute.`
                  : `Il faut au moins ${Math.ceil(passMark * quiz.length)} bonnes réponses sur ${quiz.length}. Relisez les leçons puis retentez votre chance.`}
              </p>
              <p className={`save-status save-${save}`} role="status">
                {save === 'saving' && 'Enregistrement du résultat…'}
                {save === 'saved' && '✓ Résultat enregistré'}
                {save === 'error' && (
                  <>
                    Impossible d’enregistrer le résultat.{' '}
                    <button className="link-btn" onClick={sendResult}>Réessayer</button>
                  </>
                )}
              </p>
              <div className="hero-actions center">
                <button className="btn" onClick={restart}>Réessayer</button>
                <a className="btn btn-ghost" href="#courses">Voir les cours</a>
              </div>
            </motion.div>
          ) : (
            <motion.div key={`${round}-${index}`} className="quiz-body" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.35 }}>
              <span className="quiz-count">Question {index + 1} sur {quiz.length}</span>
              <h3>{current.q}</h3>
              {current.image && (
                <figure className="q-figure">
                  <img src={current.image.src} alt={current.image.alt} loading="lazy" />
                  {current.image.credit && <figcaption>{current.image.credit}</figcaption>}
                </figure>
              )}
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
                    <p><strong>{picked === current.answer ? 'Exact. ' : 'Pas tout à fait. '}</strong>{current.why}</p>
                    <button className="btn btn-small" onClick={next}>
                      {index + 1 >= quiz.length ? 'Voir mon score' : 'Question suivante'} <Icon name="arrow" size={16} />
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
