// "Parcours du semestre" Cochin–HEGP (winter 2026–2027).
// Source: "Programme d'imagerie ostéo-articulaire hiver 26-27" sent by the HEGP team.
// A chapter opens on the Monday of its week, or earlier as soon as the previous
// chapter of the path is finished (every question answered).
// This only drives the #/semestre page: the free chapter list (#/chapitres) is unchanged.

export const SEMESTER = {
  id: 'cochin-hegp-hiver-2026-2027',
  title: 'Parcours du semestre Cochin–HEGP',
  subtitle: 'Programme de révision ostéo-articulaire · Hiver 2026–2027',
  // Monday-based weeks; `end` is the last day (Sunday) the week covers.
  weeks: [
    { start: '2026-11-02', end: '2026-11-15', label: 'Semaines du 2 et du 9 novembre', topics: ['Épaule : pathologies de la coiffe des rotateurs'], chapters: ['ch1'] },
    { start: '2026-11-16', end: '2026-11-22', label: 'Semaine du 16 novembre', topics: ['Épaule : instabilité gléno-humérale'], chapters: ['ch2'] },
    { start: '2026-11-23', end: '2026-11-29', label: 'Semaine du 23 novembre', topics: ['Épaule : pathologies nerveuses de la ceinture scapulaire'], chapters: ['ch3'] },
    { start: '2026-11-30', end: '2026-12-06', label: 'Semaine du 30 novembre', topics: ['Épaule : capsulite rétractile, omarthrose, ostéochondrite, scapula alata et à ressaut, articulations acromio- et sterno-claviculaires, grand pectoral'], chapters: ['ch4'], exam: 'Examen n°1' },
    { start: '2026-12-07', end: '2026-12-13', label: 'Semaine du 7 décembre', topics: ['Coude : compartiment latéral', 'Coude : compartiment médial'], chapters: ['ch5', 'ch6'] },
    { start: '2026-12-14', end: '2026-12-20', label: 'Semaine du 14 décembre', topics: ['Coude : compartiment antérieur', 'Coude : compartiment postérieur'], chapters: ['ch7', 'ch8'] },
    { start: '2026-12-21', end: '2027-01-03', label: 'Semaines du 21 et du 28 décembre', topics: ['Coude : affections diverses et présentations particulières'], chapters: ['ch9'] },
    { start: '2027-01-04', end: '2027-01-10', label: 'Semaine du 4 janvier', topics: ['Poignet : pathologies osseuses dégénératives'], chapters: ['ch10'], exam: 'Examen n°2' },
    { start: '2027-01-11', end: '2027-01-17', label: 'Semaine du 11 janvier', topics: ['Poignet : pathologies ligamentaires'], chapters: ['ch11'] },
    { start: '2027-01-18', end: '2027-01-31', label: 'Semaines du 18 et du 25 janvier', topics: ['Poignet : pathologies tendineuses et ténosynoviales'], chapters: ['ch12'] },
    { start: '2027-02-01', end: '2027-02-07', label: 'Semaine du 1er février', topics: ['Poignet : pathologies vasculo-nerveuses'], chapters: ['ch13'] },
    { start: '2027-02-08', end: '2027-02-21', label: 'Semaines du 8 et du 15 février', topics: ['Main : pathologies dégénératives et tendineuses de la main et des doigts'], chapters: ['ch14'] },
    { start: '2027-02-22', end: '2027-02-28', label: 'Semaine du 22 février', topics: ['Vacances / révisions'], chapters: [], break: true },
    { start: '2027-03-01', end: '2027-03-07', label: 'Semaine du 1er mars', topics: ['Hanche : pathologies osseuses', 'Hanche : pathologies articulaires'], chapters: ['ch18', 'ch19'] },
    { start: '2027-03-08', end: '2027-03-14', label: 'Semaine du 8 mars', topics: ['Hanche : pathologies abarticulaires'], chapters: ['ch20'] },
    { start: '2027-03-15', end: '2027-03-21', label: 'Semaine du 15 mars', topics: ['Ceinture pelvienne : sacro-iliaques et symphyse pubienne', 'Plexus lombo-sacré'], chapters: ['ch22', 'ch21'], exam: 'Examen n°3' },
    { start: '2027-03-22', end: '2027-03-28', label: 'Semaine du 22 mars', topics: ['Genou : pathologies antérieures'], chapters: ['ch23'] },
    { start: '2027-03-29', end: '2027-04-04', label: 'Semaine du 29 mars', topics: ['Genou : ménisques et ligaments croisés'], chapters: ['ch24', 'ch25'] },
    { start: '2027-04-05', end: '2027-04-11', label: 'Semaine du 5 avril', topics: ['Genou : plans collatéraux et postérieurs', 'Genou : gonarthrose, fractures de contrainte, ostéonécroses, SDRC 1, ostéochondrite disséquante, maladie de Blount'], chapters: ['ch26', 'ch27'], exam: 'Examen n°4' },
    { start: '2027-04-12', end: '2027-04-18', label: 'Semaine du 12 avril', topics: ['Jambe : pathologies de la jambe et du mollet', 'Pied et cheville : tendon calcanéen, aponévrose plantaire'], chapters: ['ch28', 'ch29'] },
    { start: '2027-04-19', end: '2027-04-25', label: 'Semaine du 19 avril', topics: ['Pied et cheville : tibial postérieur et spring, LFH, fibulaires, extenseurs', 'Pied et cheville : ligaments, neuropathies'], chapters: ['ch29'] },
    { start: '2027-04-26', end: '2027-05-02', label: 'Semaine du 26 avril', topics: ['Statique du pied, coalitions du tarse, ostéochondroses, arthrose de cheville et du pied'], chapters: ['ch30'], exam: 'Examen final' },
  ],
  // Outside the evaluated programme: always open.
  sideQuests: [
    {
      id: 'rachis',
      title: 'Rachis',
      note: 'Hors évaluation : accessible à tout moment.',
      chapters: ['ch15', 'ch16', 'ch17'],
    },
  ],
};

// Ordered list of chapters along the path, each with the Monday it opens.
export const SEMESTER_PATH = (() => {
  const seen = new Set();
  const list = [];
  for (const w of SEMESTER.weeks) {
    for (const key of w.chapters) {
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ key, opensOn: w.start });
    }
  }
  return list;
})();

export function localIsoDay(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DAY_MONTH_FR = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export function formatOpenDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return DAY_MONTH_FR.format(new Date(y, m - 1, d, 12));
}

export function weekStatus(week, today = localIsoDay()) {
  if (today < week.start) return 'upcoming';
  if (today > week.end) return 'past';
  return 'current';
}

// `isCompleted(key)` → true when every question of the chapter has been answered.
// Returns { [key]: { unlocked, early, opensOn, prevKey } }.
export function computeSemesterUnlocks(isCompleted, today = localIsoDay()) {
  const out = {};
  let prev = null;
  for (const { key, opensOn } of SEMESTER_PATH) {
    const byDate = today >= opensOn;
    const byProgress = Boolean(prev && out[prev.key].unlocked && isCompleted(prev.key));
    out[key] = {
      unlocked: byDate || byProgress,
      early: !byDate && byProgress,
      opensOn,
      prevKey: prev ? prev.key : null,
    };
    prev = { key };
  }
  return out;
}
