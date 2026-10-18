// Shared validation for quiz questions (used by api/admin-questions.js).
// The file name starts with "_" so Vercel does not expose it as an endpoint.

const ID = /^[a-z0-9-]{1,40}$/;
const CHAPTER = /^ch[0-9]{1,2}$/;
const ITEM_ID = /^[A-F]$/;

const isStr = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
const clean = (s) => s.replace(/\r\n/g, '\n').trim();

// Figure file names end up in /figures/<chapter>/<file>: no path tricks allowed.
const validFile = (f) =>
  typeof f === 'string' && /^[^/\\<>:"?#%]{1,120}\.png$/i.test(f) && !f.includes('..') && !f.startsWith('.');

export function validateId(id) {
  return typeof id === 'string' && ID.test(id);
}

export function validateChapter(chapter) {
  return typeof chapter === 'string' && CHAPTER.test(chapter);
}

// Returns { data } with only known fields (trimmed), or { error } in French.
export function validateQuestion(q) {
  if (!q || typeof q !== 'object') return { error: 'Question invalide' };
  if (q.type !== 'QCU' && q.type !== 'QRM') return { error: 'Le type doit être QCU ou QRM' };
  if (!isStr(q.theme, 1, 80)) return { error: 'Le sous-thème est obligatoire (80 caractères max)' };
  if (!isStr(q.enonce, 1, 1500)) return { error: 'L’énoncé est obligatoire (1 500 caractères max)' };
  if (!isStr(q.explication, 1, 6000)) return { error: 'L’explication est obligatoire (6 000 caractères max)' };

  if (!Array.isArray(q.items) || q.items.length < 2 || q.items.length > 6) {
    return { error: 'Il faut entre 2 et 6 réponses' };
  }
  const seen = new Set();
  const items = [];
  for (const it of q.items) {
    if (!it || typeof it !== 'object' || !ITEM_ID.test(it.id) || seen.has(it.id)) {
      return { error: 'Réponses invalides (lettres A à F, sans doublon)' };
    }
    seen.add(it.id);
    if (!isStr(it.texte, 1, 400)) return { error: 'Chaque réponse doit contenir du texte (400 caractères max)' };
    if (typeof it.correct !== 'boolean') return { error: 'Réponses invalides' };
    items.push({ id: it.id, texte: clean(it.texte), correct: it.correct });
  }
  const good = items.filter((i) => i.correct).length;
  if (q.type === 'QCU' && good !== 1) return { error: 'Un QCU doit avoir exactement 1 bonne réponse' };
  if (q.type === 'QRM' && (good < 2 || good === items.length)) {
    return { error: 'Un QRM doit avoir au moins 2 bonnes réponses, et au moins 1 mauvaise' };
  }

  let enonce_image = null;
  if (q.enonce_image) {
    if (!validFile(q.enonce_image.file) || !isStr(q.enonce_image.alt ?? '', 0, 300)) {
      return { error: 'Image de l’énoncé invalide' };
    }
    enonce_image = { file: q.enonce_image.file, alt: clean(q.enonce_image.alt ?? '') };
  }

  if (!Array.isArray(q.correction_figures) || q.correction_figures.length > 6) {
    return { error: 'Au plus 6 figures de correction' };
  }
  const correction_figures = [];
  for (const f of q.correction_figures) {
    if (!f || !validFile(f.file) || !isStr(f.caption, 1, 1200)) {
      return { error: 'Figure invalide : fichier .png et légende (1 200 caractères max) obligatoires' };
    }
    correction_figures.push({ file: f.file, caption: clean(f.caption) });
  }

  const s = q.source;
  if (!s || !Number.isInteger(s.page) || s.page < 1 || s.page > 9999) {
    return { error: 'La page de la référence doit être un nombre entier' };
  }
  if (!isStr(s.element, 1, 80) || !isStr(s.refs ?? '', 0, 200)) {
    return { error: 'Référence invalide (élément obligatoire, références 200 caractères max)' };
  }

  return {
    data: {
      type: q.type,
      theme: clean(q.theme),
      enonce: clean(q.enonce),
      enonce_image,
      items,
      explication: clean(q.explication),
      correction_figures,
      source: { page: s.page, element: clean(s.element), refs: clean(s.refs ?? '') },
    },
  };
}
