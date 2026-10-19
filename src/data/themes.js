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
  {
    id: 'coude',
    title: 'Le coude',
    chapters: [
      chapter('ch5', 'Pathologies du compartiment latéral'),
      chapter('ch6', 'Pathologies du compartiment médial'),
      chapter('ch7', 'Pathologies du compartiment antérieur'),
      chapter('ch8', 'Pathologies du compartiment postérieur'),
      chapter('ch9', 'Autres affections du coude'),
    ],
  },
];
