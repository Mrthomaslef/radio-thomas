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
    logo: '/theme-logos/epaule.png',
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
    logo: '/theme-logos/coude.png',
    chapters: [
      chapter('ch5', 'Pathologies du compartiment latéral'),
      chapter('ch6', 'Pathologies du compartiment médial'),
      chapter('ch7', 'Pathologies du compartiment antérieur'),
      chapter('ch8', 'Pathologies du compartiment postérieur'),
      chapter('ch9', 'Autres affections du coude'),
    ],
  },
  {
    id: 'main-poignet',
    title: 'Main et poignet',
    logo: '/theme-logos/main-poignet.png',
    chapters: [
      chapter('ch10', 'Pathologies dégénératives du poignet'),
      chapter('ch11', 'Pathologies ligamentaires du poignet'),
      chapter('ch12', 'Pathologies tendineuses du poignet'),
      chapter('ch13', 'Pathologies vasculonerveuses'),
      chapter('ch14', 'Pathologies dégénératives et tendineuses de la main et des doigts'),
    ],
  },
  {
    id: 'rachis',
    title: 'Rachis',
    logo: '/theme-logos/rachis.png',
    chapters: [
      chapter('ch15', 'Discopathies dégénératives cervicales'),
      chapter('ch16', 'Affections mécaniques du rachis dorsolombaire'),
      chapter('ch17', 'Autres affections rachidiennes'),
    ],
  },
  {
    id: 'hanche',
    title: 'La Hanche',
    logo: '/theme-logos/hanche.png',
    chapters: [
      chapter('ch18', 'Pathologies osseuses de la hanche'),
      chapter('ch19', 'Pathologies articulaires de la hanche'),
      chapter('ch20', 'Pathologies abarticulaires de la hanche'),
      chapter('ch21', 'Pathologies du plexus lombosacré'),
      chapter('ch22', 'Autres pathologies de la ceinture pelvienne'),
    ],
  },
  {
    id: 'genou',
    title: 'Le Genou',
    logo: '/theme-logos/genou.png',
    chapters: [
      chapter('ch23', 'Pathologies antérieures'),
      chapter('ch24', 'Pathologies des ménisques'),
      chapter('ch25', 'Pathologies des ligaments croisés'),
      chapter('ch26', 'Pathologies des tissus mous collatéraux et postérieurs'),
      chapter('ch27', 'Autres pathologies du genou'),
    ],
  },
  {
    id: 'jambe-cheville-pied',
    title: 'Jambe, Cheville et Pied',
    logo: '/theme-logos/jambe-cheville-pied.png',
    chapters: [
      chapter('ch28', 'Pathologies de la jambe'),
      chapter('ch29', 'Pathologies des tissus mous'),
      chapter('ch30', 'Autres pathologies de la cheville et du pied'),
    ],
  },
  {
    id: 'dysostose',
    title: 'Dysostose',
    logo: '/theme-logos/dysostose.png',
    chapters: [
      chapter('ch31', 'Dysostoses crâniennes'),
      chapter('ch32', 'Dysostoses rachidiennes'),
      chapter('ch33', 'Dysostoses de la paroi thoracique'),
      chapter('ch34', 'Dysostoses de la ceinture scapulaire et du membre supérieur'),
      chapter('ch35', 'Dysostoses du membre inférieur'),
      chapter('ch36', 'Déformation du pied du nourrisson'),
    ],
  },
];
