import Reveal from './Reveal.jsx';

const steps = [
  { n: '01', title: 'Apprendre', text: 'Des leçons courtes et visuelles : anatomie, physique, technique et pathologie.' },
  { n: '02', title: 'S’entraîner', text: 'Des quiz interactifs avec correction immédiate et explication claire de chaque réponse.' },
  { n: '03', title: 'Réviser', text: 'La répétition espacée ramène les questions ratées au moment idéal.' },
  { n: '04', title: 'Maîtriser', text: 'Examens blancs chronométrés et bilan des points faibles pour arriver prêt le jour J.' },
];

export default function HowItWorks() {
  return (
    <section className="section" id="how">
      <Reveal className="section-head">
        <span className="eyebrow">Comment ça marche</span>
        <h2>Une boucle simple pour progresser vraiment</h2>
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
