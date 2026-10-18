// Quiz themes shown on the home page. A chapter with `href` is playable; without it, it shows "Bientôt".
// To open a chapter, add `href: '#/cours/<slug>'` and `questions: <count>` once its course data exists.

export const themes = [
  {
    id: 'epaule',
    title: 'L’épaule',
    chapters: [
      { id: 'coiffe', title: 'Pathologies de la coiffe' },
      { id: 'instabilite', title: 'Instabilité d’épaule' },
      { id: 'plexus', title: 'Plexus brachial' },
      { id: 'autres', title: 'Autres pathologies de l’épaule' },
    ],
  },
];
