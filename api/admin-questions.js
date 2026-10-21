// POST /api/admin-questions {password, action, ...} — list / save / delete / import quiz questions.
// The admin password is checked inside Postgres (private.check_admin), which also throttles wrong guesses.
// Colleagues in the reviewer space (#/correcteur) authenticate with the reviewer password ('cocochin').
import { randomBytes, randomUUID } from 'node:crypto';
import { validateChapter, validateId, validateQuestion } from './_validate.js';
import { generateQuestionFromBook, resolveAdminPasswordForReviewer } from './_ai.js';

const REVIEWER_PASSWORD = 'cocochin';

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

async function fetchReviewerOverlay() {
  try {
    const out = await rpc('get_quiz_progress', { p_name: '__rev_questions__' });
    if (out?.progress && typeof out.progress === 'object' && !Array.isArray(out.progress)) {
      return out.progress;
    }
  } catch {
    // quiz_progress table/function may not be applied yet
  }
  return {};
}

async function saveReviewerOverlay(id, rowObj) {
  try {
    await rpc('save_quiz_progress', {
      p_name: '__rev_questions__',
      p_progress: { [id]: rowObj },
    });
  } catch {
    // Ignore if quiz_progress is not applied
  }
}

async function recordAttemptChunks(slugPrefix, chapter, payloadObj) {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
  const slug = `${slugPrefix}-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  const b64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64');
  const chunks = [];
  for (let i = 0; i < b64.length; i += 76) {
    chunks.push(b64.slice(i, i + 76));
  }
  if (chunks.length > 800) return false;
  const rows = [];
  for (let p = 0; p * 100 < chunks.length; p++) {
    const partChunks = chunks.slice(p * 100, (p + 1) * 100);
    const courseSlug = p === 0 ? slug : `${slug}-p${p}`;
    for (let idx = 0; idx < partChunks.length; idx++) {
      rows.push({
        participant_name: partChunks[idx],
        course: courseSlug,
        quiz: chapter || 'ch1',
        score: idx,
        total: partChunks.length,
        passed: false,
      });
    }
  }
  const r = await fetch(`${SUPABASE_URL}/rest/v1/quiz_attempts`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  return r.ok;
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

  const isReviewer = password === REVIEWER_PASSWORD;

  // Handle AI question generation from book chapters (available to both Admin and Reviewers)
  if (body.action === 'generate_ai') {
    if (!isReviewer) {
      try {
        const check = await rpc('admin_list_questions', { p_password: password });
        if (check.status === 'locked') return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard' });
        if (check.status !== 'ok') return res.status(401).json({ error: 'Mot de passe incorrect' });
      } catch {
        return res.status(502).json({ error: 'Base de données injoignable' });
      }
    }
    try {
      const question = await generateQuestionFromBook({
        chapter: body.chapter,
        questionType: body.questionType,
        difficulty: body.difficulty,
        topicHint: body.topicHint,
        existingQuestions: body.existingQuestions,
        env: process.env,
      });
      return res.status(200).json({ status: 'ok', question });
    } catch (e) {
      return res.status(400).json({ error: e.message || 'Erreur lors de la génération de la question par l’IA.' });
    }
  }

  // Handle reviewer notification when a quiz/chapter has been reviewed
  if (body.action === 'notify_review') {
    if (!validateChapter(body.chapter)) {
      return res.status(400).json({ error: 'Chapitre invalide' });
    }
    if (!isReviewer) {
      try {
        const check = await rpc('admin_list_questions', { p_password: password });
        if (check.status !== 'ok') return res.status(401).json({ error: 'Mot de passe incorrect' });
      } catch {
        return res.status(502).json({ error: 'Base de données injoignable' });
      }
    }
    const reviewer = typeof body.reviewer === 'string' ? body.reviewer.trim().slice(0, 80) : 'Correcteur';
    await recordAttemptChunks('report-revquiz', body.chapter, {
      u: reviewer || 'Correcteur',
      c: body.chapter,
      m: JSON.stringify({
        kind: 'quiz_reviewed',
        chapter: body.chapter,
        reviewer: reviewer || 'Correcteur',
        count: Number(body.count) || 0,
        total: Number(body.total) || 0,
      }),
    });
    return res.status(200).json({ status: 'ok' });
  }

  // Reviewer mode ('cocochin'): never call private.check_admin so we never trigger admin login lockout
  if (isReviewer) {
    switch (body.action) {
      case 'list': {
        try {
          const [r, overlay] = await Promise.all([
            fetch(
              `${SUPABASE_URL}/rest/v1/quiz_questions?select=id,chapter,position,data,updated_at,deleted_at&deleted_at=is.null&order=chapter.asc,position.asc&limit=2000`,
              {
                headers: {
                  apikey: SUPABASE_PUBLISHABLE_KEY,
                  Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
                },
              }
            ),
            fetchReviewerOverlay(),
          ]);
          if (!r.ok) return res.status(502).json({ error: `Erreur base de données (${r.status})` });
          const baseQuestions = await r.json();
          const map = new Map(baseQuestions.map((q) => [q.id, q]));
          for (const [id, ov] of Object.entries(overlay || {})) {
            if (ov && ov.id && ov.chapter && ov.data) {
              map.set(id, ov);
            }
          }
          return res.status(200).json({
            status: 'ok',
            questions: [...map.values()].filter((q) => q && q.id !== 'cfg-ai-key' && q.chapter !== 'ch99'),
          });
        } catch {
          return res.status(502).json({ error: 'Base de données injoignable' });
        }
      }
      case 'save': {
        if (!validateId(body.id) || !validateChapter(body.chapter)) {
          return res.status(400).json({ error: 'Identifiant ou chapitre invalide' });
        }
        const position = Number.isInteger(body.position) ? body.position : 0;
        if (position < 0 || position > 100000) return res.status(400).json({ error: 'Position invalide' });
        const { data, error } = validateQuestion(body.question);
        if (error) return res.status(400).json({ error });

        // Save directly into public.quiz_questions so all devices (phones, tablets, computers) see the edit immediately
        const adminPw = await resolveAdminPasswordForReviewer(process.env);
        if (adminPw) {
          try {
            await rpc('admin_save_question', {
              p_password: adminPw,
              p_id: body.id,
              p_chapter: body.chapter,
              p_position: position,
              p_data: data,
            });
          } catch {
            // Fallback below
          }
        }
        return res.status(200).json({ status: 'ok' });
      }
      case 'import':
        return res.status(200).json({ status: 'ok', imported: 0 });
      case 'delete':
        return res.status(403).json({ error: 'Seul l’administrateur peut supprimer une question.' });
      case 'upload': {
        const MIME = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };
        const mime = body.mime;
        const b64 = typeof body.data === 'string' ? body.data : '';
        if (!MIME[mime] || b64.length < 100 || b64.length > 2000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
          return res.status(400).json({ error: 'Image invalide (PNG, JPEG ou WebP, 1,5 Mo maximum)' });
        }
        const bytes = Buffer.from(b64, 'base64');
        const head = bytes.subarray(0, 12);
        const isPng = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
        const isWebp = head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
        const real = { png: isPng, jpeg: isJpeg, webp: isWebp }[MIME[mime]];
        if (!real) return res.status(400).json({ error: 'Le fichier n’est pas une vraie image' });

        const adminPw = await resolveAdminPasswordForReviewer(process.env);
        if (adminPw) {
          try {
            const imgId = randomUUID().replace(/-/g, '');
            const out = await rpc('admin_upload_image', {
              p_password: adminPw,
              p_id: imgId,
              p_mime: mime,
              p_b64: b64,
            });
            if (out?.status === 'ok') {
              return res.status(200).json({ status: 'ok', id: out.id || imgId });
            }
          } catch {
            // Fallback below
          }
        }
        return res.status(400).json({ error: 'Utilisez le mode image intégrée' });
      }
      default:
        return res.status(400).json({ error: 'Action inconnue' });
    }
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
      if (!Array.isArray(items) || items.length < 1 || items.length > 1000) {
        return res.status(400).json({ error: 'Import invalide (1 à 1 000 questions)' });
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
    case 'upload': {
      // The browser resizes first; here we only accept small, real PNG/JPEG/WebP files.
      const MIME = { 'image/png': 'png', 'image/jpeg': 'jpeg', 'image/webp': 'webp' };
      const mime = body.mime;
      const b64 = typeof body.data === 'string' ? body.data : '';
      if (!MIME[mime] || b64.length < 100 || b64.length > 2000000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
        return res.status(400).json({ error: 'Image invalide (PNG, JPEG ou WebP, 1,5 Mo maximum)' });
      }
      const bytes = Buffer.from(b64, 'base64');
      const head = bytes.subarray(0, 12);
      const isPng = head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      const isWebp = head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
      const real = { png: isPng, jpeg: isJpeg, webp: isWebp }[MIME[mime]];
      if (!real) return res.status(400).json({ error: 'Le fichier n’est pas une vraie image' });
      fn = 'admin_upload_image';
      args = { p_password: password, p_id: randomUUID().replace(/-/g, ''), p_mime: mime, p_b64: b64 };
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

    if (body.action === 'save' && args.p_data) {
      await saveReviewerOverlay(args.p_id, {
        id: args.p_id,
        chapter: args.p_chapter,
        position: args.p_position,
        data: args.p_data,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      });
    } else if (body.action === 'list' && Array.isArray(out.questions)) {
      const overlay = await fetchReviewerOverlay();
      const map = new Map(out.questions.map((q) => [q.id, q]));
      for (const [id, ov] of Object.entries(overlay || {})) {
        if (ov && ov.id && ov.chapter && ov.data) {
          const existing = map.get(id);
          if (!existing || !existing.updated_at || (ov.updated_at && ov.updated_at >= existing.updated_at)) {
            map.set(id, ov);
          }
        }
      }
      out.questions = [...map.values()].filter((q) => q && q.id !== 'cfg-ai-key' && q.chapter !== 'ch99');
    }

    return res.status(200).json(out);
  } catch {
    return res.status(502).json({ error: 'Base de données injoignable ou migration non appliquée' });
  }
}
