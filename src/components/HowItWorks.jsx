import Reveal from './Reveal.jsx';

const steps = [
  { n: '01', title: 'Learn', text: 'Short, visual lessons covering anatomy, physics, technique and pathology.' },
  { n: '02', title: 'Practice', text: 'Interactive quizzes with instant feedback and clear explanations for every answer.' },
  { n: '03', title: 'Review', text: 'Spaced repetition brings back the questions you struggled with, right on time.' },
  { n: '04', title: 'Master', text: 'Timed mock exams and a weak-spot report get you exam-ready with confidence.' },
];

export default function HowItWorks() {
  return (
    <section className="section" id="how">
      <Reveal className="section-head">
        <span className="eyebrow">How it works</span>
        <h2>A simple loop that builds real skill</h2>
      </Reveal>
      <div className="steps">
        {steps.map((s, i) => (
          <Reveal key={s.n} delay={i * 0.1} className="step">
            <span className="step-n">{s.n}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
