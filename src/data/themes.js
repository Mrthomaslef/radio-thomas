// Quiz themes shown on the home page. Question counts come from the live questions (useQuestions).
import { CHAPTERS } from './useQuestions.js';

const chapter = (key, title) => ({
  id: key,
  title,
  href: `#/quiz/${key}`,
  fallbackCount: CHAPTERS[key].questions.length,
});

export const themes = [
  {
    id: 'epaule',
    title: 'L’épaule',
    chapters: [
      chapter('ch1', 'Pathologies de la coiffe'),
      chapter('ch2', 'Instabilité d’épaule'),
      chapter('ch3', 'Plexus brachial'),
      chapter('ch4', 'Autres pathologies de l’épaule'),
    ],
  },
];
