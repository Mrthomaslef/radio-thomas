// Sample quiz shown on the landing page. `answer` is the index of the correct option.
export const quiz = [
  {
    q: 'Which projection is the standard for an adult chest X-ray?',
    options: ['AP supine', 'PA erect', 'Lateral decubitus', 'Lordotic'],
    answer: 1,
    why: 'A PA erect chest keeps the heart close to the detector (less magnification) and lets the diaphragm descend for full lung inflation.',
  },
  {
    q: 'What does ALARA stand for?',
    options: [
      'As Low As Reasonably Achievable',
      'Absorbed Level Of Radiation At Arrival',
      'Always Limit All Radiation Applied',
      'Adjusted Lead And Radiation Absorber',
    ],
    answer: 0,
    why: 'ALARA is the core radiation-protection principle: keep dose as low as reasonably achievable without losing diagnostic value.',
  },
  {
    q: 'Which SI unit measures absorbed dose?',
    options: ['Sievert (Sv)', 'Becquerel (Bq)', 'Gray (Gy)', 'Coulomb/kg'],
    answer: 2,
    why: 'Gray is joules of energy absorbed per kilogram. Sievert is used for effective/equivalent dose, Becquerel for activity.',
  },
  {
    q: 'In anatomical position, which forearm bone is lateral?',
    options: ['Ulna', 'Radius', 'Humerus', 'Scaphoid'],
    answer: 1,
    why: 'The radius sits on the thumb side — lateral in anatomical position (palms forward).',
  },
  {
    q: 'Raising kVp (with everything else equal) mainly…',
    options: [
      'Increases beam penetration and lowers contrast',
      'Decreases penetration and raises contrast',
      'Only changes exposure time',
      'Has no effect on the image',
    ],
    answer: 0,
    why: 'Higher kVp means a more energetic, more penetrating beam, which produces a longer scale (lower contrast) image.',
  },
];
