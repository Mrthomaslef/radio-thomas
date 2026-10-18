// Quiz themes shown on the home page. A chapter with `href` is playable; without it, it shows "Bientôt".
import ch1 from './quiz/ch1.json';
import ch2 from './quiz/ch2.json';
import ch3 from './quiz/ch3.json';
import ch4 from './quiz/ch4.json';

const chapter = (key, data, title) => ({
  id: key,
  title,
  href: `#/quiz/${key}`,
  questions: data.questions.length,
});

export const themes = [
  {
    id: 'epaule',
    title: 'L’épaule',
    chapters: [
      chapter('ch1', ch1, 'Pathologies de la coiffe'),
      chapter('ch2', ch2, 'Instabilité d’épaule'),
      chapter('ch3', ch3, 'Plexus brachial'),
      chapter('ch4', ch4, 'Autres pathologies de l’épaule'),
    ],
  },
];
