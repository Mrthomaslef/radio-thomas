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

// Images uploaded from the admin are referenced by a random 32-hex id (see api/image.js).
const UPLOAD = /^[a-f0-9]{32}$/;
const validUpload = (u) => typeof u === 'string' && UPLOAD.test(u);

// An image is either a bundled file ({file}) or an upload ({upload}), plus a text field
// (`alt` for statement/answer images, `caption` for correction figures).
// Returns the cleaned image, or null when it is invalid.
function cleanImage(img, textKey, textMax, textRequired) {
  if (!img || typeof img !== 'object') return null;
  const text = img[textKey] ?? '';
  if (!isStr(text, textRequired ? 1 : 0, textMax)) return null;
  if (validUpload(img.upload)) return { upload: img.upload, [textKey]: clean(text) };
  if (validFile(img.file)) return { file: img.file, [textKey]: clean(text) };
  return null;
}

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
  if (q.type === 'QRM' && good < 1) {
    return { error: 'Un QRM doit avoir au moins 1 bonne réponse' };
  }

  let enonce_image = null;
  if (q.enonce_image) {
    enonce_image = cleanImage(q.enonce_image, 'alt', 300, false);
    if (!enonce_image) return { error: 'Image de l’énoncé invalide' };
  }

  if (!Array.isArray(q.correction_figures) || q.correction_figures.length > 6) {
    return { error: 'Au plus 6 figures de correction' };
  }
  const correction_figures = [];
  for (const f of q.correction_figures) {
    const fig = cleanImage(f, 'caption', 1200, true);
    if (!fig) return { error: 'Figure invalide : image et légende (1 200 caractères max) obligatoires' };
    correction_figures.push(fig);
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
      reviewed: Boolean(q.reviewed),
    },
  };
}
