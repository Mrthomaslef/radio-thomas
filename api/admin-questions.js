// POST /api/admin-questions {password, action, ...} — list / save / delete / import quiz questions.
// The password is checked inside Postgres (private.check_admin), which also throttles wrong guesses.
import { validateChapter, validateId, validateQuestion } from './_validate.js';

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return null;
  }
}

async function rpc(name, args) {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }

  const body = readBody(req);
  const password = body && typeof body.password === 'string' ? body.password : '';
  if (!password || password.length > 200) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  // Validate everything BEFORE calling the database.
  let fn;
  let args;
  switch (body.action) {
    case 'list':
      fn = 'admin_list_questions';
      args = { p_password: password };
      break;
    case 'save': {
      if (!validateId(body.id) || !validateChapter(body.chapter)) {
        return res.status(400).json({ error: 'Identifiant ou chapitre invalide' });
      }
      const position = Number.isInteger(body.position) ? body.position : 0;
      if (position < 0 || position > 100000) return res.status(400).json({ error: 'Position invalide' });
      const { data, error } = validateQuestion(body.question);
      if (error) return res.status(400).json({ error });
      fn = 'admin_save_question';
      args = { p_password: password, p_id: body.id, p_chapter: body.chapter, p_position: position, p_data: data };
      break;
    }
    case 'delete':
      if (!validateId(body.id)) return res.status(400).json({ error: 'Identifiant invalide' });
      fn = 'admin_delete_question';
      args = { p_password: password, p_id: body.id };
      break;
    case 'import': {
      const items = body.items;
      if (!Array.isArray(items) || items.length < 1 || items.length > 200) {
        return res.status(400).json({ error: 'Import invalide (1 à 200 questions)' });
      }
      const rows = [];
      for (const it of items) {
        if (!it || !validateId(it.id) || !validateChapter(it.chapter)) {
          return res.status(400).json({ error: 'Import invalide : identifiant ou chapitre incorrect' });
        }
        const { data, error } = validateQuestion(it.data);
        if (error) return res.status(400).json({ error: `${it.id} : ${error}` });
        rows.push({ id: it.id, chapter: it.chapter, position: Number.isInteger(it.position) ? it.position : 0, data });
      }
      fn = 'admin_import_questions';
      args = { p_password: password, p_items: rows };
      break;
    }
    default:
      return res.status(400).json({ error: 'Action inconnue' });
  }

  try {
    const out = await rpc(fn, args);
    if (out.status === 'locked') return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard' });
    if (out.status === 'bad_password') return res.status(401).json({ error: 'Mot de passe incorrect' });
    if (out.status === 'not_found') return res.status(404).json({ error: 'Question introuvable' });
    if (out.status !== 'ok') return res.status(400).json({ error: 'Requête refusée' });
    return res.status(200).json(out);
  } catch {
    return res.status(502).json({ error: 'Base de données injoignable ou migration non appliquée' });
  }
}
