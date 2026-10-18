// Quiz themes shown on the home page. A chapter with `href` is playable; without it, it shows "Bientôt".
import { coursCoiffe } from './coursCoiffe.js';

export const themes = [
  {
    id: 'epaule',
    title: 'L’épaule',
    chapters: [
      {
        id: 'coiffe',
        title: 'Pathologies de la coiffe',
        href: `#/cours/${coursCoiffe.slug}`,
        questions: coursCoiffe.quiz.length,
      },
      { id: 'instabilite', title: 'Instabilité d’épaule' },
      { id: 'plexus', title: 'Plexus brachial' },
      { id: 'autres', title: 'Autres pathologies de l’épaule' },
    ],
  },
];
