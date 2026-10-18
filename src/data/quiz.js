// Quiz d'exemple affiché sur la page d'accueil. `answer` = index de la bonne réponse.
export const quiz = [
  {
    q: 'Quelle incidence est la référence pour une radiographie thoracique de l’adulte ?',
    options: ['Face, couché (AP)', 'Face, debout (PA)', 'Décubitus latéral', 'Lordotique'],
    answer: 1,
    why: 'Une incidence PA debout rapproche le cœur du détecteur (moins d’agrandissement) et permet aux coupoles diaphragmatiques de descendre pour une inspiration complète.',
  },
  {
    q: 'Que signifie ALARA ?',
    options: [
      'As Low As Reasonably Achievable (aussi bas que raisonnablement possible)',
      'Niveau de rayonnement absorbé à l’arrivée',
      'Toujours limiter tous les rayonnements appliqués',
      'Plomb et absorbeur de rayonnement ajustés',
    ],
    answer: 0,
    why: 'ALARA est le principe de base de la radioprotection : garder la dose aussi basse que raisonnablement possible sans perdre en qualité diagnostique.',
  },
  {
    q: 'Quelle unité du SI mesure la dose absorbée ?',
    options: ['Sievert (Sv)', 'Becquerel (Bq)', 'Gray (Gy)', 'Coulomb/kg'],
    answer: 2,
    why: 'Le gray correspond à des joules d’énergie absorbés par kilogramme. Le sievert sert pour la dose efficace/équivalente, le becquerel pour l’activité.',
  },
  {
    q: 'En position anatomique, quel os de l’avant-bras est latéral ?',
    options: ['Ulna (cubitus)', 'Radius', 'Humérus', 'Scaphoïde'],
    answer: 1,
    why: 'Le radius est du côté du pouce : latéral en position anatomique (paumes vers l’avant).',
  },
  {
    q: 'Augmenter le kV (toutes choses égales par ailleurs) a surtout pour effet de…',
    options: [
      'Augmenter la pénétration du faisceau et diminuer le contraste',
      'Diminuer la pénétration et augmenter le contraste',
      'Changer uniquement le temps d’exposition',
      'N’avoir aucun effet sur l’image',
    ],
    answer: 0,
    why: 'Un kV plus élevé donne un faisceau plus énergétique et plus pénétrant, d’où une image à échelle de gris plus longue (contraste plus faible).',
  },
];
