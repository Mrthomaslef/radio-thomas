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

// Compressed inline images (from contributor proposals or fallback when quiz_images table is not active).
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const validDataUrl = (d) => typeof d === 'string' && d.length >= 100 && d.length <= 2000000 && DATA_URL.test(d);

// An image is either a bundled file ({file}), an upload ({upload}) or an inline dataUrl ({dataUrl}),
// plus a text field (`alt` for statement/answer images, `caption` for correction figures).
// Returns the cleaned image, or null when it is invalid.
function cleanImage(img, textKey, textMax, textRequired) {
  if (!img || typeof img !== 'object') return null;
  const text = img[textKey] ?? '';
  if (!isStr(text, textRequired ? 1 : 0, textMax)) return null;
  if (validUpload(img.upload)) return { upload: img.upload, [textKey]: clean(text) };
  if (validFile(img.file)) return { file: img.file, [textKey]: clean(text) };
  if (validDataUrl(img.dataUrl)) return { dataUrl: img.dataUrl, [textKey]: clean(text) };
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
  const themeStr = typeof q.theme === 'string' && q.theme.trim() ? clean(q.theme).slice(0, 120) : 'Général';
  if (!isStr(q.enonce, 1, 2000)) return { error: 'L’énoncé est obligatoire (2 000 caractères max)' };
  const explicationStr = typeof q.explication === 'string' && q.explication.trim() ? clean(q.explication).slice(0, 8000) : 'Correction validée.';

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
    if (!isStr(it.texte, 1, 800)) return { error: 'Chaque réponse doit contenir du texte (800 caractères max)' };
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
    const fWithCaption = f && typeof f === 'object' && !String(f.caption || '').trim() ? { ...f, caption: 'Figure' } : f;
    const fig = cleanImage(fWithCaption, 'caption', 1200, true);
    if (!fig) return { error: 'Figure invalide : image obligatoire (1 200 caractères max pour la légende)' };
    correction_figures.push(fig);
  }

  const s = q.source || {};
  const pageNum = Number.isInteger(Number(s.page)) && Number(s.page) >= 1 && Number(s.page) <= 9999 ? Number(s.page) : 1;
  const elementStr = typeof s.element === 'string' && s.element.trim() ? clean(s.element).slice(0, 80) : 'Texte';
  const refsStr = typeof s.refs === 'string' ? clean(s.refs).slice(0, 200) : '';

  const rawDiff = q.difficulty === undefined || q.difficulty === null ? 2 : Number(q.difficulty);
  if (rawDiff !== 1 && rawDiff !== 2 && rawDiff !== 3) {
    return { error: 'Le niveau de difficulté doit être 1, 2 ou 3' };
  }

  const isReviewed = Boolean(q.reviewed || (typeof q.reviewed_by === 'string' && q.reviewed_by.trim()));
  const reviewedBy =
    typeof q.reviewed_by === 'string' && q.reviewed_by.trim().length > 0
      ? clean(q.reviewed_by).slice(0, 80)
      : isReviewed
      ? 'Thomas L.'
      : null;

  return {
    data: {
      type: q.type,
      difficulty: rawDiff,
      theme: themeStr,
      enonce: clean(q.enonce),
      enonce_image,
      items,
      explication: explicationStr,
      correction_figures,
      source: { page: pageNum, element: elementStr, refs: refsStr },
      reviewed: isReviewed,
      ...(reviewedBy ? { reviewed_by: reviewedBy } : {}),
    },
  };
}
