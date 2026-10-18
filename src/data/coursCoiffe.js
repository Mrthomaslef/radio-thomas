// Cours 1 — Pathologies de la coiffe des rotateurs.
// Synthèse rédigée à partir du chapitre 1 de « Imagerie musculosquelettique »
// (Michelin, El Rafei, Duparc — Elsevier Masson, 2017). Texte reformulé, sans reprise des figures.

export const coursCoiffe = {
  slug: 'pathologie-coiffe',
  title: 'Pathologies de la coiffe des rotateurs',
  level: 'Intermédiaire',
  intro:
    'De l’anatomie de l’épaule aux radiographies : comprendre la coiffe des rotateurs, ses lésions les plus fréquentes et ce que l’imagerie doit chercher.',
  source:
    'Synthèse d’après P. Michelin, M. El Rafei, F. Duparc, « Pathologies de la coiffe des rotateurs », chapitre 1 de Imagerie musculosquelettique, Elsevier Masson, 2017. Résumé pédagogique reformulé : il ne remplace pas l’ouvrage de référence.',

  modules: [
    {
      id: 'anatomie',
      title: 'Anatomie de la coiffe',
      minutes: 15,
      points: [
        'La coiffe des rotateurs est un manchon tendineux autour de l’articulation scapulohumérale. Les tendons de quatre muscles viennent « coiffer » la tête de l’humérus : le supra-épineux, l’infra-épineux, le petit rond et le subscapulaire.',
        'Ces tendons se fondent avec la capsule articulaire. Leur rôle : mobiliser l’épaule, mais surtout stabiliser et recentrer la tête humérale dans la glène (on parle de muscles coaptateurs).',
        'Le tendon du long biceps n’appartient pas à la coiffe, mais il en est très proche : il naît du haut de la glène (tubercule supraglénoïdal et labrum), traverse l’articulation puis s’engage dans le sillon intertuberculaire. Son rôle mécanique à l’épaule est faible, pourtant il est souvent atteint en même temps que la coiffe.',
      ],
      table: {
        head: ['Muscle', 'Insertion sur l’humérus', 'Rôle principal'],
        rows: [
          ['Supra-épineux', 'Facette antérieure du tubercule majeur', 'Abduction, coaptation'],
          ['Infra-épineux', 'Facette moyenne du tubercule majeur', 'Rotation latérale, coaptation'],
          ['Petit rond', 'Facette inférieure du tubercule majeur', 'Rotation latérale (aide l’infra-épineux)'],
          ['Subscapulaire', 'Tubercule mineur', 'Rotation médiale, adduction, coaptation'],
        ],
      },
      retenir:
        'Supra-épineux = lever le bras. Infra-épineux + petit rond = rotation latérale. Subscapulaire = rotation médiale.',
    },
    {
      id: 'intervalles',
      title: 'Intervalles, câble et espaces synoviaux',
      minutes: 15,
      points: [
        'L’intervalle antérieur sépare le supra-épineux du subscapulaire. Il contient la poulie de réflexion, une structure fibreuse qui maintient le tendon du long biceps à l’entrée de son sillon.',
        'L’intervalle postérieur sépare le supra-épineux de l’infra-épineux : leurs bandes tendineuses y sont superposées et reliées par du tissu plus lâche.',
        'Le « câble des rotateurs » est un renfort fibreux en arc dans la coiffe : il répartit les contraintes mécaniques, comme le câble d’un pont suspendu. Derrière lui, la zone du « croissant » est plus fine et donc plus fragile.',
        'La bourse sub-acromiodeltoïdienne est un espace de glissement entre la coiffe et l’acromion (ou le deltoïde). Normalement, elle ne communique pas avec la cavité articulaire : si elle le fait, c’est qu’une rupture traverse toute l’épaisseur de la coiffe.',
        'Le récessus subscapulaire enjambe le bord supérieur du tendon du subscapulaire. C’est pourquoi une rupture isolée de ce tendon ne met pas en communication l’articulation et la bourse.',
      ],
      retenir:
        'Poulie du biceps = intervalle antérieur. Zone du croissant = point faible, en arrière. Communication articulation ↔ bourse = rupture transfixiante.',
    },
    {
      id: 'tendinopathies',
      title: 'Tendinopathies et conflits',
      minutes: 20,
      points: [
        'On distingue les tendinopathies dégénératives, qui peuvent aboutir à une rupture, et les tendinopathies calcifiantes.',
        'Dégénérative : des microlésions s’accumulent avec les contraintes de la vie, la cicatrisation devient insuffisante et la vascularisation diminue avec l’âge. Tabac, obésité et traumatismes sont des facteurs de risque de rupture. Les ruptures partielles deviennent fréquentes dès 50 ans, les ruptures complètes dès 60 ans, et beaucoup restent peu ou pas douloureuses.',
        'Conflit sous-acromial : le plus fréquent des conflits extra-articulaires. La coiffe est comprimée sous l’acromion ou le ligament coraco-acromial. Facteurs anatomiques (espace réduit, ostéophytes, ossification du ligament) ou fonctionnels (mauvais centrage de la tête humérale).',
        'Autres conflits : sous-coracoïdien (rare), antéro-supérieur (rare, lié à la poulie du biceps) et postéro-supérieur (dans l’articulation, en position d’armé : bras en abduction, rotation latérale et rétropulsion, typique des lanceurs et des sportifs jeunes).',
        'Calcifiante : dépôts de cristaux de phosphate de calcium (apatite). Fréquente entre 30 et 60 ans, plus souvent chez les femmes, surtout dans la partie supérieure de la coiffe (supra-épineux). Elle devient brutalement douloureuse lors d’une phase inflammatoire, puis peut se résorber.',
        'Le long biceps : sa tendinopathie accompagne souvent une rupture de coiffe. Si la poulie est lésée, il se déstabilise. Un tendon très épaissi qui ne coulisse plus donne le « biceps en sablier ». Une rupture complète donne le signe de Popeye (le muscle se rétracte vers le bras).',
      ],
      retenir:
        'Dégénératif = usure (50–60 ans et plus). Calcifiant = dépôts d’apatite (30–60 ans, crise douloureuse). Le conflit sous-acromial est le plus fréquent.',
    },
    {
      id: 'ruptures',
      title: 'Ruptures de la coiffe',
      minutes: 25,
      points: [
        'Une rupture est la discontinuité d’une ou plusieurs bandes de fibres. Elle est non transfixiante (partielle, pas de communication avec l’articulation ni la bourse) ou transfixiante (sur toute l’épaisseur : la cavité articulaire communique avec la bourse, sauf pour le subscapulaire).',
        'Le plus souvent, la rupture débute dans le supra-épineux, environ 1,3 à 1,7 cm en arrière du tendon du biceps, puis s’étend vers l’avant et l’arrière. Les ruptures partielles côté articulaire sont plus fréquentes que côté bursal, surtout dans la zone du croissant.',
        'La rupture isolée de la partie antérieure du supra-épineux est rare (environ 6 %), plutôt traumatique et chez le sujet jeune. Comme cette partie porte l’essentiel des fibres musculaires, elle entraîne vite une involution graisseuse.',
        'Subscapulaire : la rupture commence en haut et côté externe du tendon, puis descend. On la classe avec la classification de Lafosse (stades I à V). Petit rond : rarement rompu, et tardivement.',
        'Taille : petite (moins de 1 cm), moyenne (1 à 4 cm), massive (plus de 4 cm). On mesure aussi la rétraction du tendon par rapport au tubercule majeur, au sommet de la tête humérale et à l’interligne articulaire.',
        'Conséquences sur le muscle : atrophie puis infiltration graisseuse, considérées comme définitives. Le signe de la tangente est positif quand le muscle supra-épineux ne dépasse plus la ligne reliant l’épine de la scapula au processus coracoïde (coupe en Y).',
        'La dégénérescence graisseuse se classe en stades 0 à 4 (Goutallier), simplifiés en 3 stades par Fuchs. À partir du stade 3, ou en cas de signe de la tangente positif, la rupture est en général jugée non réparable : on ne répare pas un tendon dont le muscle ne fonctionne plus.',
      ],
      retenir:
        'Transfixiante = toute l’épaisseur. Petite < 1 cm, moyenne 1–4 cm, massive > 4 cm. Graisse stade ≥ 3 = critère de non-réparabilité.',
    },
    {
      id: 'clinique',
      title: 'Examen clinique',
      minutes: 15,
      points: [
        'Premier réflexe : s’assurer que la douleur vient bien de l’épaule (le principal diagnostic différentiel est la névralgie cervicobrachiale), puis chercher quel tendon est atteint.',
        'L’interrogatoire distingue une douleur mécanique, souvent chronique (dégénératif), d’une douleur inflammatoire intense et aiguë (calcification). L’inspection cherche un creux au-dessus ou sous l’épine de la scapula, signe d’atrophie musculaire.',
        'On évalue les amplitudes passives puis actives, puis chaque muscle est testé selon sa fonction. Une perte de force traduit soit une rupture, soit un mauvais centrage actif de la tête humérale.',
        'Les tests de conflit reproduisent la compression en fin de mouvement (abduction, antépulsion, rotation médiale). En cas de conflit postéro-supérieur, la douleur apparaît en abduction et rotation latérale, et elle est postérieure.',
        'Limites : une douleur forte peut fausser les tests (faux positifs), et certaines lésions sont bien compensées (faux négatifs). D’où l’intérêt de confronter la clinique à l’imagerie.',
      ],
      table: {
        head: ['Test', 'Tendon exploré', 'Principe'],
        rows: [
          ['Jobe', 'Supra-épineux', 'Abduction contre résistance, bras à 90° dans le plan de la scapula'],
          ['Patte', 'Infra-épineux', 'Rotation latérale contre résistance, bras à 90° d’abduction'],
          ['Gerber (lift-off)', 'Subscapulaire', 'Rotation médiale, main dans le dos, à vide puis contre résistance'],
          ['Palm-up test', 'Long biceps', 'Bras tendu en avant, paume vers le haut, contre résistance'],
          ['Signe du clairon', 'Petit rond / infra-épineux', 'Impossible de ramener la main à la bouche sans lever le coude'],
        ],
      },
      retenir:
        'Jobe = supra-épineux. Patte = infra-épineux. Gerber = subscapulaire. Palm-up = biceps.',
    },
    {
      id: 'imagerie',
      title: 'Imagerie et radiographies',
      minutes: 25,
      points: [
        'Stratégie : les radiographies sont toujours indiquées en première intention. L’échographie guide le traitement médical, caractérise les calcifications et détecte les ruptures. L’IRM sans injection est un examen de seconde intention, utile pour préparer une chirurgie. L’arthroscanner et l’arthro-IRM sont réservés au bilan préopératoire. Le scanner simple est rarement utilisé.',
        'Technique de routine : trois clichés de face (rotation neutre, médiale et latérale) et un profil de coiffe (incidence de Lamy, de Neer ou « subacromial »). Selon le contexte : incidence de Railhac (décubitus, rayon vertical, supprime le poids du bras), clichés dynamiques de Leclercq (abduction contrariée), profil axillaire (os acromial), cliché glénoïdien de Bernageau.',
        'Centrage de la tête humérale : l’espace sous-acromial normal mesure de 7 à 15 mm (moyenne 10,5 mm en rotation neutre). Un espace de 6 mm ou moins évoque une large rupture des tendons supra et infra-épineux, et c’est un critère de non-réparabilité. Les clichés en rotation ne sont pas fiables pour cette mesure.',
        'L’ossification de l’enthèse du ligament coraco-acromial (« épine acromiale ») est un signe radiographique fortement associé aux ruptures transfixiantes. Dans les grandes ruptures, la tête humérale peut remonter et creuser le dessous de l’acromion : c’est l’acétabulisation.',
        'À repérer sur chaque cliché : centrage de la tête, articulation scapulohumérale (arthrose, ostéophytes), calcifications et bursite calcique, forme de l’acromion (épine, angle critique supérieur à 35°), articulation acromioclaviculaire et lésions osseuses focales.',
      ],
      table: {
        head: ['À regarder', 'Ce que l’on cherche'],
        rows: [
          ['Centrage de la tête', 'Espace sous-acromial : normal 7–15 mm, ≤ 6 mm = grande rupture'],
          ['Acromion', 'Épine acromiale, angle critique > 35°, acétabulisation'],
          ['Calcifications', 'Localisation, bursite calcique'],
          ['Articulations', 'Arthrose gléno-humérale, arthropathie acromioclaviculaire'],
          ['Os', 'Lésion focale, anomalies du tubercule majeur'],
        ],
      },
      retenir:
        'Radios en première intention : 3 clichés de face + profil de coiffe. Espace sous-acromial ≤ 6 mm = grande rupture.',
    },
  ],

  quiz: [
    {
      q: 'Quels muscles forment la coiffe des rotateurs ?',
      options: [
        'Supra-épineux, infra-épineux, petit rond, subscapulaire',
        'Deltoïde, biceps, triceps, grand rond',
        'Supra-épineux, infra-épineux, grand rond, grand dorsal',
        'Subscapulaire, deltoïde, petit pectoral, trapèze',
      ],
      answer: 0,
      why: 'Quatre tendons coiffent la tête humérale : supra-épineux, infra-épineux, petit rond et subscapulaire. Le biceps est voisin mais n’en fait pas partie.',
    },
    {
      q: 'Sur quelle zone de l’humérus s’insère le tendon du subscapulaire ?',
      options: ['Facette antérieure du tubercule majeur', 'Tubercule mineur', 'Facette moyenne du tubercule majeur', 'Col chirurgical'],
      answer: 1,
      why: 'Le subscapulaire s’insère surtout sur le tubercule mineur. Les trois autres tendons se partagent les facettes du tubercule majeur.',
    },
    {
      q: 'Quelle est l’action principale de l’infra-épineux et du petit rond ?',
      options: ['Rotation médiale', 'Rotation latérale', 'Adduction', 'Flexion du coude'],
      answer: 1,
      why: 'Infra-épineux et petit rond sont rotateurs latéraux de l’épaule, alors que le subscapulaire est rotateur médial.',
    },
    {
      q: 'Sur ce schéma de la coiffe (vue sagittale oblique), quel muscle porte le numéro 5 ?',
      image: { src: '/figures/fig-1-1-coiffe-sagittale.jpg', alt: 'Schéma de la coiffe des rotateurs en vue sagittale oblique, structures numérotées de 1 à 8', credit: 'Figure : Michelin, El Rafei, Duparc, Imagerie musculosquelettique, Elsevier Masson, 2017' },
      options: ['Supra-épineux', 'Infra-épineux', 'Petit rond', 'Subscapulaire'],
      answer: 0,
      why: 'Le numéro 5 est le muscle supra-épineux, au sommet de la coiffe. Le 6 est l’infra-épineux, le 7 le petit rond et le 2 le subscapulaire.',
    },
    {
      q: 'Sur le même schéma, que désigne le numéro 4 ?',
      image: { src: '/figures/fig-1-1-coiffe-sagittale.jpg', alt: 'Schéma de la coiffe des rotateurs en vue sagittale oblique, structures numérotées de 1 à 8', credit: 'Figure : Michelin, El Rafei, Duparc, Imagerie musculosquelettique, Elsevier Masson, 2017' },
      options: ['Le tendon du chef long du biceps brachial', 'La capsule articulaire', 'Le muscle deltoïde', 'Le muscle petit rond'],
      answer: 0,
      why: 'Le numéro 4 est le tendon du chef long du biceps, visible en coupe à l’entrée du sillon. La capsule est le 1 et le deltoïde le 8.',
    },
    {
      q: 'Que contient l’intervalle antérieur de la coiffe ?',
      options: [
        'La poulie de réflexion du tendon du long biceps',
        'Le câble des rotateurs postérieur',
        'Le nerf supra-scapulaire uniquement',
        'La bourse sous-acromiale',
      ],
      answer: 0,
      why: 'L’intervalle antérieur, entre supra-épineux et subscapulaire, contient la poulie qui stabilise le tendon du long biceps à l’entrée du sillon intertuberculaire.',
    },
    {
      q: 'La zone violette de ce schéma représente un renfort fibreux qui répartit les contraintes sur la coiffe. Comment l’appelle-t-on ?',
      image: { src: '/figures/fig-1-9-cable.jpg', alt: 'Vue supérieure des tendons de la coiffe avec une bande violette en arc', credit: 'Figure : Michelin, El Rafei, Duparc, Imagerie musculosquelettique, Elsevier Masson, 2017' },
      options: ['Le câble des rotateurs', 'La poulie de réflexion', 'Le soft point', 'Le récessus subscapulaire'],
      answer: 0,
      why: 'Le câble des rotateurs est un renfort fibreux en arc dans la coiffe. Son nom vient de son rôle de répartition des contraintes, comme un câble de pont suspendu.',
    },
    {
      q: 'Que signifie la présence d’une communication entre la cavité articulaire et la bourse sub-acromiodeltoïdienne ?',
      options: [
        'Une rupture transfixiante d’un tendon supra ou infra-épineux',
        'Une tendinopathie calcifiante',
        'Un conflit sous-coracoïdien',
        'Une situation normale',
      ],
      answer: 0,
      why: 'Normalement séparées, ces deux cavités ne communiquent que si une rupture traverse toute l’épaisseur de la coiffe.',
    },
    {
      q: 'Parmi ces facteurs, lequel augmente le risque de rupture de la coiffe ?',
      options: ['Le tabagisme', 'Un régime riche en fibres', 'La pratique du yoga', 'La taille du patient'],
      answer: 0,
      why: 'Tabac, obésité et traumatismes sont des facteurs de risque. Le tabac réduit en plus la vascularisation tendineuse.',
    },
    {
      q: 'Quel est le conflit le plus fréquent de l’épaule ?',
      options: ['Conflit sous-acromial', 'Conflit sous-coracoïdien', 'Conflit antéro-supérieur', 'Conflit postéro-supérieur'],
      answer: 0,
      why: 'Le conflit sous-acromial représente la majorité des conflits extra-articulaires. Les trois autres sont rares.',
    },
    {
      q: 'Dans quelle situation rencontre-t-on typiquement le conflit postéro-supérieur ?',
      options: [
        'Sportif jeune en position d’armé (abduction, rotation latérale, rétropulsion)',
        'Sujet âgé avec arthrose acromioclaviculaire',
        'Enfant après une fracture de la clavicule',
        'Patient diabétique avec capsulite',
      ],
      answer: 0,
      why: 'Il s’agit d’un conflit intra-articulaire lié à la position d’armé forcée, chez les lanceurs (tennis, handball, volley-ball…).',
    },
    {
      q: 'Vers quel âge les tendinopathies calcifiantes sont-elles les plus fréquentes ?',
      options: ['Avant 20 ans', 'Entre 30 et 60 ans', 'Après 80 ans', 'Uniquement chez le nourrisson'],
      answer: 1,
      why: 'Les calcifications sont surtout rencontrées entre 30 et 60 ans, avec une prédominance féminine. Elles sont exceptionnelles avant 20 ans.',
    },
    {
      q: 'Quelle taille définit une rupture massive de la coiffe ?',
      options: ['Moins de 1 cm', 'Entre 1 et 4 cm', 'Plus de 4 cm', 'Exactement 2 cm'],
      answer: 2,
      why: 'Petite : moins de 1 cm. Moyenne : 1 à 4 cm. Massive : plus de 4 cm.',
    },
    {
      q: 'À partir de quel stade de dégénérescence graisseuse (Goutallier) une rupture est-elle en général jugée non réparable ?',
      options: ['Stade 0', 'Stade 1', 'Stade 2', 'Stade 3 ou plus'],
      answer: 3,
      why: 'Un stade 3 ou 4 signe une involution graisseuse sévère : le muscle ne fonctionne plus et réparer le tendon n’a plus de sens.',
    },
    {
      q: 'Sur cette coupe IRM, la ligne rouge relie l’épine de la scapula au processus coracoïde, et le muscle supra-épineux ne la dépasse plus. Que conclure ?',
      image: { src: '/figures/fig-1-25-tangente.jpg', alt: 'Coupe IRM sagittale oblique de l’épaule avec une ligne rouge tracée au-dessus du muscle supra-épineux', credit: 'Figure : Michelin, El Rafei, Duparc, Imagerie musculosquelettique, Elsevier Masson, 2017' },
      options: ['Signe de la tangente positif : amyotrophie évoluée du supra-épineux', 'Muscle supra-épineux normal', 'Calcification du tendon', 'Luxation du long biceps'],
      answer: 0,
      why: 'Quand le bord supérieur du muscle ne dépasse plus la tangente, le signe de la tangente est positif : amyotrophie avancée, critère de non-réparabilité.',
    },
    {
      q: 'Quel test clinique explore surtout le tendon du supra-épineux ?',
      options: ['Test de Patte', 'Test de Gerber', 'Test de Jobe', 'Palm-up test'],
      answer: 2,
      why: 'Jobe : abduction contre résistance. Patte explore l’infra-épineux, Gerber le subscapulaire et le palm-up test le long biceps.',
    },
    {
      q: 'Quel examen d’imagerie est toujours indiqué en première intention devant une suspicion de pathologie de la coiffe ?',
      options: ['Arthroscanner', 'IRM avec injection', 'Radiographies', 'Scintigraphie'],
      answer: 2,
      why: 'Les radiographies sont systématiques en première intention. Échographie, IRM puis arthroscanner ou arthro-IRM viennent ensuite selon le besoin.',
    },
    {
      q: 'Quelle série de clichés constitue le bilan radiographique de routine de l’épaule ?',
      options: [
        'Trois clichés de face (rotations neutre, médiale, latérale) et un profil de coiffe',
        'Un seul cliché de face en rotation neutre',
        'Uniquement un cliché axial',
        'Un cliché de face et un cliché du coude',
      ],
      answer: 0,
      why: 'Le bilan de routine comprend trois clichés de face selon la rotation et un profil de coiffe (Lamy ou Neer).',
    },
    {
      q: 'Quel espace sous-acromial évoque une large rupture des tendons de la coiffe ?',
      options: ['12 mm', '10 mm', '8 mm', '6 mm ou moins'],
      answer: 3,
      why: 'Normal : 7 à 15 mm (moyenne 10,5 mm). À 6 mm ou moins, la tête humérale est remontée : large rupture, et critère de non-réparabilité.',
    },
    {
      q: 'Cette radiographie de face montre un espace entre la tête humérale et l’acromion réduit à 6 mm ou moins. À quoi faut-il penser ?',
      image: { src: '/figures/fig-1-27-espace-sous-acromial.jpg', alt: 'Radiographie de face de l’épaule avec tête humérale remontée contre l’acromion', credit: 'Figure : Michelin, El Rafei, Duparc, Imagerie musculosquelettique, Elsevier Masson, 2017' },
      options: ['Une large rupture des tendons supra et infra-épineux', 'Une coiffe normale', 'Une luxation antérieure de l’épaule', 'Une fracture du col chirurgical'],
      answer: 0,
      why: 'Un espace sous-acromial de 6 mm ou moins témoigne d’une large rupture de la partie supérieure de la coiffe, et c’est un critère de non-réparabilité.',
    },
    {
      q: 'Sur cette radiographie, la flèche désigne une ossification sur le bord antérieur de l’acromion. Comment appelle-t-on ce signe ?',
      image: { src: '/figures/fig-1-28-epine-acromiale.jpg', alt: 'Radiographie de l’épaule avec une flèche blanche sur l’acromion', credit: 'Figure : Michelin, El Rafei, Duparc, Imagerie musculosquelettique, Elsevier Masson, 2017' },
      options: ['Épine acromiale (ossification de l’enthèse du ligament coraco-acromial)', 'Acétabulisation de l’acromion', 'Calcification du supra-épineux', 'Fracture de l’acromion'],
      answer: 0,
      why: 'L’ossification de l’enthèse acromiale du ligament coraco-acromial s’appelle l’épine acromiale. Elle est fortement associée aux ruptures transfixiantes.',
    },
    {
      q: 'Sur cette radiographie, la tête humérale est remontée et creuse la face inférieure de l’acromion. Comment nomme-t-on ce remodelage ?',
      image: { src: '/figures/fig-1-29-acetabulisation.jpg', alt: 'Radiographie de face de l’épaule avec une tête humérale haute sous un acromion remodelé', credit: 'Figure : Michelin, El Rafei, Duparc, Imagerie musculosquelettique, Elsevier Masson, 2017' },
      options: ['Acétabulisation de l’acromion', 'Épine acromiale', 'Ostéophyte glénoïdien', 'Chondrocalcinose'],
      answer: 0,
      why: 'Dans les grandes ruptures avec excentration supérieure, la tête humérale remodèle le dessous de l’acromion qui devient creusé : c’est l’acétabulisation.',
    },
  ],
};

// Questions illustrated with figures from the source book are switched off until the
// right to publish those figures is confirmed (images live in public/figures/, which is
// git-ignored). To enable: put the images back, set this to true, commit them.
export const SHOW_FIGURES = false;
if (!SHOW_FIGURES) coursCoiffe.quiz = coursCoiffe.quiz.filter((q) => !q.image);
