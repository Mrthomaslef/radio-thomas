// Helpers to send and read question feedback reports and user-proposed questions.
// Works with /api/reports and gracefully falls back to /api/attempts when running against an older backend proxy.

const LOCAL_SUBMISSIONS_KEY = 'quiz-cotten:local-submissions:v1';
const LOCAL_DECISIONS_KEY = 'quiz-cotten:submission-decisions:v1';
const LOCAL_REVIEWER_EDITS_KEY = 'quiz-cotten:reviewer-edits:v1';
const LOCAL_REVIEW_NOTIFS_KEY = 'quiz-cotten:review-notifications:v1';

export const REVIEWERS = [
  'Hippolyte M.',
  'Macil H.',
  'Marie-Pauline T.',
  'Stephano L.',
  'Thomas L.',
  'Yazid A.',
];

export function readLocalReviewerEdits() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_REVIEWER_EDITS_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function writeLocalReviewerEdit(rowObj) {
  if (!rowObj || !rowObj.id) return;
  try {
    const map = readLocalReviewerEdits();
    map[rowObj.id] = {
      id: rowObj.id,
      chapter: rowObj.chapter,
      position: rowObj.position ?? 0,
      data: rowObj.data || rowObj.question,
      updated_at: rowObj.updated_at || new Date().toISOString(),
    };
    localStorage.setItem(LOCAL_REVIEWER_EDITS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function readLocalReviewNotifications() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_REVIEW_NOTIFS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function writeLocalReviewNotification(notif) {
  if (!notif || !notif.id) return;
  try {
    const list = readLocalReviewNotifications().filter((n) => String(n.id) !== String(notif.id));
    list.unshift(notif);
    localStorage.setItem(LOCAL_REVIEW_NOTIFS_KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    // Ignore storage errors
  }
}

// Patterns that may indicate personal patient information (dates of birth, NIR/SSN, patient name labels, etc.)
const PERSONAL_DATA_PATTERN =
  /\b(nom\s+du\s+patient|pr[eé]nom\s+du\s+patient|n[eé]\(e\)\s+le|date\s+de\s+naissance|num[eé]ro\s+de\s+s[eé]curit[eé]\s+sociale|ipp\s*[:=]|\b[12]\s?\d{2}\s?(0[1-9]|1[0-2])\s?\d{2}\s?\d{3}\s?\d{3}\b)/i;

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function fromBase64Utf8(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function readLocalSubmissions() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_SUBMISSIONS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function writeLocalSubmissions(list) {
  try {
    localStorage.setItem(LOCAL_SUBMISSIONS_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage errors
  }
}

function readLocalDecisions() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_DECISIONS_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeLocalDecision(id, decision) {
  try {
    const map = readLocalDecisions();
    map[id] = { decision, resolved_at: new Date().toISOString() };
    localStorage.setItem(LOCAL_DECISIONS_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function validateProposedQuestion(q, { noPersonalDataConfirmed = true } = {}) {
  if (!noPersonalDataConfirmed) {
    return {
      error:
        'Veuillez confirmer que votre question ne contient aucune information personnelle sur un patient.',
    };
  }
  if (!q || typeof q !== 'object') return { error: 'Question invalide.' };
  if (q.type !== 'QCU' && q.type !== 'QRM') return { error: 'Le type doit être QCU ou QRM.' };

  const theme = typeof q.theme === 'string' ? q.theme.trim() : '';
  const enonce = typeof q.enonce === 'string' ? q.enonce.trim() : '';
  const explication = typeof q.explication === 'string' ? q.explication.trim() : '';

  if (theme.length < 2 || theme.length > 80) {
    return { error: 'Le sous-thème est obligatoire (2 à 80 caractères).' };
  }
  if (enonce.length < 10 || enonce.length > 1500) {
    return { error: 'L’énoncé est obligatoire (10 à 1 500 caractères).' };
  }
  if (explication.length < 10 || explication.length > 6000) {
    return { error: 'L’explication de la correction est obligatoire (10 à 6 000 caractères).' };
  }

  if (!Array.isArray(q.items) || q.items.length < 2 || q.items.length > 6) {
    return { error: 'La question doit comporter entre 2 et 6 réponses.' };
  }

  const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const items = [];
  for (let i = 0; i < q.items.length; i++) {
    const it = q.items[i];
    const texte = typeof it?.texte === 'string' ? it.texte.trim() : '';
    if (!texte || texte.length > 400) {
      return { error: `La réponse ${LETTERS[i]} doit contenir du texte (400 caractères max).` };
    }
    items.push({
      id: LETTERS[i],
      texte,
      correct: Boolean(it.correct),
    });
  }

  const correctCount = items.filter((it) => it.correct).length;
  if (q.type === 'QCU' && correctCount !== 1) {
    return { error: 'Un QCU doit avoir exactement 1 bonne réponse cochée.' };
  }
  if (q.type === 'QRM' && correctCount < 1) {
    return { error: 'Un QRM doit avoir au moins 1 bonne réponse cochée.' };
  }

  // Validate optional statement image (enonce_image)
  const DATA_URL_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  const UPLOAD_RE = /^[a-f0-9]{32}$/;
  const cleanProposalImg = (img, textKey, textMax, textRequired) => {
    if (!img || typeof img !== 'object') return null;
    const text = typeof img[textKey] === 'string' ? img[textKey].trim() : '';
    if (textRequired && text.length < 1) return null;
    if (text.length > textMax) return null;
    if (typeof img.upload === 'string' && UPLOAD_RE.test(img.upload)) {
      return { upload: img.upload, [textKey]: text };
    }
    if (
      typeof img.dataUrl === 'string' &&
      img.dataUrl.length >= 100 &&
      img.dataUrl.length <= 45000 &&
      DATA_URL_RE.test(img.dataUrl)
    ) {
      return { dataUrl: img.dataUrl, [textKey]: text };
    }
    if (typeof img.file === 'string' && /^[^/\\<>:"?#%]{1,120}\.png$/i.test(img.file)) {
      return { file: img.file, [textKey]: text };
    }
    return null;
  };

  let enonce_image = null;
  if (q.enonce_image) {
    enonce_image = cleanProposalImg(q.enonce_image, 'alt', 300, false);
    if (!enonce_image) {
      return { error: 'L’image avant la question est invalide ou trop lourde.' };
    }
  }

  const rawFigures = Array.isArray(q.correction_figures) ? q.correction_figures : [];
  if (rawFigures.length > 4) {
    return { error: 'Vous pouvez ajouter au maximum 4 figures de correction.' };
  }
  const correction_figures = [];
  for (let i = 0; i < rawFigures.length; i++) {
    const fig = cleanProposalImg(rawFigures[i], 'caption', 1200, true);
    if (!fig) {
      return {
        error: `Figure de correction ${i + 1} invalide : l’image et sa légende (obligatoire, 1 200 caractères max) doivent être renseignées.`,
      };
    }
    correction_figures.push(fig);
  }

  // Check for obvious personal patient data across all text fields (including image descriptions/captions)
  const allText = [
    theme,
    enonce,
    explication,
    enonce_image?.alt || '',
    ...correction_figures.map((f) => f.caption || ''),
    ...items.map((i) => i.texte),
  ].join(' ');
  if (PERSONAL_DATA_PATTERN.test(allText)) {
    return {
      error:
        'Votre texte semble contenir des données nominatives ou personnelles de patient (date de naissance, nom/prénom, IPP ou numéro de sécurité sociale). Veuillez anonymiser complètement la question.',
    };
  }

  const page = Number.isInteger(q.source?.page) && q.source.page >= 1 && q.source.page <= 9999 ? q.source.page : 1;
  const element =
    typeof q.source?.element === 'string' && q.source.element.trim()
      ? q.source.element.trim().slice(0, 80)
      : 'Proposition utilisateur';
  const refs = typeof q.source?.refs === 'string' ? q.source.refs.trim().slice(0, 200) : '';

  return {
    data: {
      type: q.type,
      theme,
      enonce,
      enonce_image,
      items,
      explication,
      correction_figures,
      source: { page, element, refs },
      reviewed: false,
    },
  };
}

export async function submitQuestionProposal({ name, chapter, question, noPersonalDataConfirmed }) {
  const cleanName = (name || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!cleanName || cleanName === 'Anonyme') {
    throw new Error('Veuillez renseigner votre pseudo pour recevoir vos 10 points une fois la question validée.');
  }
  if (!/^ch[0-9]{1,2}$/.test(chapter || '')) {
    throw new Error('Veuillez choisir un chapitre valide.');
  }

  const { data: validatedQuestion, error } = validateProposedQuestion(question, { noPersonalDataConfirmed });
  if (error) {
    throw new Error(error);
  }

  const rand = Math.random().toString(16).slice(2, 8);
  const fallbackSlug = `report-subm-${Date.now().toString(36)}-${rand}`;

  // 1. Try /api/reports with action: 'submit_question'
  let subId = fallbackSlug;
  let sentViaApi = false;
  try {
    const r = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit_question',
        name: cleanName,
        chapter,
        question: validatedQuestion,
      }),
    });
    if (r.ok) {
      const out = await r.json().catch(() => ({}));
      if (out?.id) subId = out.id;
      sentViaApi = true;
    }
  } catch {
    // Fallback below
  }

  // 2. Fallback via /api/attempts chunks so even an older backend stores the submission
  if (!sentViaApi) {
    const payloadStr = JSON.stringify({
      u: cleanName,
      c: chapter,
      m: JSON.stringify({ kind: 'submission', question: validatedQuestion }),
    });
    const b64 = toBase64Utf8(payloadStr);
    const chunks = [];
    for (let i = 0; i < b64.length; i += 76) {
      chunks.push(b64.slice(i, i + 76));
    }
    if (chunks.length > 800) {
      throw new Error('La question proposée (avec ses images) est trop volumineuse.');
    }

    for (let p = 0; p * 100 < chunks.length; p++) {
      const partChunks = chunks.slice(p * 100, (p + 1) * 100);
      const courseSlug = p === 0 ? subId : `${subId}-p${p}`;
      for (let idx = 0; idx < partChunks.length; idx++) {
        const res = await fetch('/api/attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: partChunks[idx],
            course: courseSlug,
            quiz: chapter,
            score: idx,
            total: partChunks.length,
            passed: false,
          }),
        });
        if (!res.ok) {
          throw new Error('Impossible d’envoyer la proposition de question, réessayez.');
        }
      }
    }
  }

  // Also keep a local copy so the admin on the same browser sees it immediately
  const localList = readLocalSubmissions();
  localList.unshift({
    id: subId,
    created_at: new Date().toISOString(),
    name: cleanName,
    chapter,
    question: validatedQuestion,
    status: 'pending',
    resolved_at: null,
  });
  writeLocalSubmissions(localList.slice(0, 200));

  return { id: subId, question: validatedQuestion };
}

export async function resolveQuestionProposal({ password, id, chapter, decision, authorName }) {
  const cleanDecision = decision === 'refused' ? 'refused' : 'accepted';
  writeLocalDecision(id, cleanDecision);

  // Update local submissions list if present
  const localList = readLocalSubmissions().map((s) =>
    String(s.id) === String(id)
      ? { ...s, status: cleanDecision, resolved_at: new Date().toISOString() }
      : s
  );
  writeLocalSubmissions(localList);

  let resolvedOnServer = false;
  try {
    const r = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'resolve_submission',
        password,
        id,
        chapter,
        decision: cleanDecision,
      }),
    });
    if (r.ok) {
      resolvedOnServer = true;
    }
  } catch {
    // Fallback below
  }

  if (!resolvedOnServer && typeof id === 'string' && id.startsWith('report-')) {
    const markerName = cleanDecision === 'refused' ? '__refused__' : '__accepted__';
    const qid = `subm-${cleanDecision}`;
    await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: markerName,
        course: id,
        quiz: qid,
        score: 1,
        total: 1,
        passed: true,
      }),
    }).catch(() => {});
  }

  return true;
}

export async function submitQuestionReport({ name, chapter, questionId, message }) {
  const cleanName = (name || '').trim().replace(/\s+/g, ' ').slice(0, 80) || 'Anonyme';
  const cleanMsg = (message || '').replace(/\r\n/g, '\n').trim();
  if (cleanMsg.length < 2) {
    throw new Error('Veuillez écrire quelques mots avant d’envoyer.');
  }
  if (cleanMsg.length > 600) {
    throw new Error('Le message ne doit pas dépasser 600 caractères.');
  }

  // 1. Try /api/reports
  try {
    const r = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: cleanName,
        chapter,
        questionId,
        message: cleanMsg,
      }),
    });
    if (r.ok) {
      return true;
    }
    if (r.status !== 404) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || 'Impossible d’envoyer le signalement.');
    }
  } catch (e) {
    if (e.message && !e.message.includes('Failed to fetch')) {
      throw e;
    }
  }

  // 2. Fallback via /api/attempts when /api/reports is not deployed yet on the proxy
  const rand = Math.random().toString(16).slice(2, 8);
  const reportSlug = `report-${Date.now().toString(36)}-${rand}`;
  const b64 = toBase64Utf8(JSON.stringify({ u: cleanName, c: chapter, m: cleanMsg }));
  const chunks = [];
  for (let i = 0; i < b64.length; i += 76) {
    chunks.push(b64.slice(i, i + 76));
  }

  for (let idx = 0; idx < chunks.length; idx++) {
    const res = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: chunks[idx],
        course: reportSlug,
        quiz: questionId,
        score: idx,
        total: chunks.length,
        passed: false,
      }),
    });
    if (!res.ok) {
      throw new Error('Impossible d’envoyer le signalement, réessayez.');
    }
  }
  return true;
}

export async function resolveQuestionReport({ password, id, questionId }) {
  writeLocalDecision(id, 'resolved');
  if (typeof id === 'string' && id.startsWith('synth-rev-')) {
    return true;
  }
  try {
    const r = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve', password, id, questionId }),
    });
    if (r.ok) return true;
    if (r.status !== 404) {
      const d = await r.json().catch(() => ({}));
      throw new Error(d.error || 'Impossible de marquer comme traité.');
    }
  } catch (e) {
    if (e.message && !e.message.includes('Failed to fetch')) {
      throw e;
    }
  }

  if (typeof id === 'string' && id.startsWith('report-')) {
    const res = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '__resolved__',
        course: id,
        quiz: questionId || 'c1-q01',
        score: 1,
        total: 1,
        passed: true,
      }),
    });
    if (!res.ok) throw new Error('Impossible de marquer comme traité.');
  }
  return true;
}

export async function submitReviewerQuestionEdit({ id, chapter, position, question }) {
  if (!id || !question) return false;
  const reviewer = question.reviewed_by || 'Correcteur';
  const rand = Math.random().toString(16).slice(2, 8);
  const editSlug = `report-revedit-${Date.now().toString(36)}-${rand}`;

  const b64 = toBase64Utf8(
    JSON.stringify({
      u: reviewer,
      c: chapter || 'ch1',
      m: JSON.stringify({
        kind: 'reviewer_edit',
        id,
        chapter: chapter || 'ch1',
        position: Number.isInteger(position) ? position : 0,
        question,
        reviewed_by: question.reviewed_by || null,
      }),
    })
  );
  const chunks = [];
  for (let i = 0; i < b64.length; i += 76) {
    chunks.push(b64.slice(i, i + 76));
  }
  if (chunks.length > 800) return false;

  const tasks = [];
  for (let p = 0; p * 100 < chunks.length; p++) {
    const partChunks = chunks.slice(p * 100, (p + 1) * 100);
    const courseSlug = p === 0 ? editSlug : `${editSlug}-p${p}`;
    for (let idx = 0; idx < partChunks.length; idx++) {
      tasks.push(
        fetch('/api/attempts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: partChunks[idx],
            course: courseSlug,
            quiz: id,
            score: idx,
            total: partChunks.length,
            passed: false,
          }),
        }).catch(() => {})
      );
    }
  }
  await Promise.all(tasks);
  return true;
}

export async function submitQuizReviewNotification({ chapter, reviewer, count, total }) {
  const cleanReviewer = (reviewer || '').trim() || 'Correcteur';
  const rand = Math.random().toString(16).slice(2, 8);
  const notifSlug = `report-revquiz-${Date.now().toString(36)}-${rand}`;

  writeLocalReviewNotification({
    id: notifSlug,
    created_at: new Date().toISOString(),
    reviewer: cleanReviewer,
    chapter,
    count: Number(count) || 0,
    total: Number(total) || 0,
    resolved_at: null,
  });

  // Store via /api/attempts chunks (public insert, never triggers admin_login_failures)
  const b64 = toBase64Utf8(
    JSON.stringify({
      u: cleanReviewer,
      c: chapter,
      m: JSON.stringify({
        kind: 'quiz_reviewed',
        chapter,
        reviewer: cleanReviewer,
        count: Number(count) || 0,
        total: Number(total) || 0,
      }),
    })
  );
  const chunks = [];
  for (let i = 0; i < b64.length; i += 76) {
    chunks.push(b64.slice(i, i + 76));
  }
  await Promise.all(
    chunks.map((chunk, idx) =>
      fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: chunk,
          course: notifSlug,
          quiz: chapter || 'ch1',
          score: idx,
          total: chunks.length,
          passed: false,
        }),
      }).catch(() => {})
    )
  );
  return true;
}

function tryParseJsonMessage(msg) {
  if (typeof msg !== 'string' || !msg.trim().startsWith('{')) return null;
  try {
    const obj = JSON.parse(msg);
    return obj && typeof obj === 'object' ? obj : null;
  } catch {
    return null;
  }
}

export function extractAttemptsAndReports(data) {
  const rawAttempts = Array.isArray(data?.attempts) ? data.attempts : [];
  const serverReports = Array.isArray(data?.reports) ? data.reports : [];
  const localDecisions = readLocalDecisions();

  const attempts = [];
  const reportGroups = new Map();

  for (const a of rawAttempts) {
    if (typeof a.course === 'string' && a.course.startsWith('report-')) {
      const partMatch = a.course.match(/^(report-(?:subm|revedit|revquiz)-[a-z0-9]+-[a-z0-9]+)-p([0-9]+)$/);
      const baseCourse = partMatch ? partMatch[1] : a.course;
      const partIdx = partMatch ? Number.parseInt(partMatch[2], 10) || 0 : 0;

      if (!reportGroups.has(baseCourse)) {
        reportGroups.set(baseCourse, {
          id: baseCourse,
          created_at: a.created_at,
          question_id: a.quiz,
          chunks: new Map(),
          resolved_at: null,
          decision: null,
        });
      }
      const g = reportGroups.get(baseCourse);
      if (a.created_at < g.created_at) g.created_at = a.created_at;
      if (
        a.passed ||
        a.name === '__resolved__' ||
        a.name === '__accepted__' ||
        a.name === '__refused__'
      ) {
        g.resolved_at = a.created_at;
        if (a.name === '__refused__' || a.quiz === 'subm-refused') {
          g.decision = 'refused';
        } else if (a.name === '__accepted__' || a.quiz === 'subm-accepted') {
          g.decision = 'accepted';
        }
      } else {
        g.chunks.set(partIdx * 100 + a.score, a.name);
        if (a.quiz && !a.quiz.startsWith('subm-')) {
          g.question_id = a.quiz;
        }
      }
    } else {
      attempts.push(a);
    }
  }

  const clientParsedReports = [];
  for (const g of reportGroups.values()) {
    if (g.chunks.size === 0) continue;
    const b64 = [...g.chunks.entries()]
      .sort((x, y) => x[0] - y[0])
      .map((x) => x[1])
      .join('');
    try {
      const parsed = JSON.parse(fromBase64Utf8(b64));
      clientParsedReports.push({
        id: g.id,
        created_at: g.created_at,
        name: parsed.u || 'Anonyme',
        chapter: parsed.c || 'ch1',
        question_id: g.question_id,
        message: parsed.m || '',
        resolved_at: g.resolved_at,
        decision: g.decision,
      });
    } catch {
      // Ignore malformed row
    }
  }

  const seenIds = new Set(serverReports.map((r) => String(r.id)));
  const allCombined = [
    ...serverReports,
    ...clientParsedReports.filter((r) => !seenIds.has(String(r.id))),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const reports = [];
  const submissionsMap = new Map();
  const reviewerEditsMap = new Map();
  const reviewNotifsMap = new Map();

  // Process oldest to newest for reviewerEdits so the latest edit for a question ID wins
  const chronological = [...allCombined].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (const item of chronological) {
    const jsonMsg = tryParseJsonMessage(item.message);
    if (
      (jsonMsg?.kind === 'reviewer_edit' || String(item.id || '').startsWith('report-revedit-')) &&
      jsonMsg?.id &&
      jsonMsg?.question
    ) {
      reviewerEditsMap.set(String(jsonMsg.id), {
        id: String(jsonMsg.id),
        chapter: jsonMsg.chapter || item.chapter || 'ch1',
        position: Number.isInteger(jsonMsg.position) ? jsonMsg.position : 0,
        data: jsonMsg.question,
        reviewed_by: jsonMsg.reviewed_by || jsonMsg.question?.reviewed_by || item.name || null,
        updated_at: item.created_at,
      });
      continue;
    }

    if (jsonMsg?.kind === 'quiz_reviewed' || String(item.id || '').startsWith('report-revquiz-')) {
      const loc = localDecisions[item.id];
      const resolvedAt = item.resolved_at || loc?.resolved_at || null;
      reviewNotifsMap.set(String(item.id), {
        id: item.id,
        created_at: item.created_at,
        reviewer: jsonMsg?.reviewer || item.name || 'Correcteur',
        chapter: jsonMsg?.chapter || item.chapter || 'ch1',
        count: Number(jsonMsg?.count) || 0,
        total: Number(jsonMsg?.total) || 0,
        resolved_at: resolvedAt,
      });
    }
  }

  // Merge local reviewer edits
  for (const [qid, localEdit] of Object.entries(readLocalReviewerEdits())) {
    if (!localEdit?.id || !localEdit?.data) continue;
    const prev = reviewerEditsMap.get(qid);
    if (!prev || (localEdit.updated_at && localEdit.updated_at >= prev.updated_at)) {
      reviewerEditsMap.set(qid, localEdit);
    }
  }

  // Merge local review notifications
  for (const localNotif of readLocalReviewNotifications()) {
    if (!localNotif?.id || reviewNotifsMap.has(String(localNotif.id))) continue;
    const loc = localDecisions[localNotif.id];
    reviewNotifsMap.set(String(localNotif.id), {
      ...localNotif,
      resolved_at: localNotif.resolved_at || loc?.resolved_at || null,
    });
  }

  // Also synthesize a chapter review notification if reviewerEdits has reviewed questions for a chapter
  const chapterReviewsByReviewer = new Map();
  for (const ed of reviewerEditsMap.values()) {
    if (ed.data?.reviewed && (ed.data?.reviewed_by || ed.reviewed_by)) {
      const rev = ed.data?.reviewed_by || ed.reviewed_by;
      const ck = `${ed.chapter}::${rev}`;
      const curr = chapterReviewsByReviewer.get(ck) || {
        chapter: ed.chapter,
        reviewer: rev,
        count: 0,
        created_at: ed.updated_at,
      };
      curr.count += 1;
      if (ed.updated_at > curr.created_at) curr.created_at = ed.updated_at;
      chapterReviewsByReviewer.set(ck, curr);
    }
  }
  for (const [ck, info] of chapterReviewsByReviewer.entries()) {
    const hasExplicit = [...reviewNotifsMap.values()].some(
      (n) => n.chapter === info.chapter && n.reviewer === info.reviewer
    );
    if (!hasExplicit) {
      const synthId = `synth-rev-${ck}`;
      const loc = localDecisions[synthId];
      reviewNotifsMap.set(synthId, {
        id: synthId,
        created_at: info.created_at,
        reviewer: info.reviewer,
        chapter: info.chapter,
        count: info.count,
        total: 0,
        resolved_at: loc?.resolved_at || null,
      });
    }
  }

  for (const item of allCombined) {
    const jsonMsg = tryParseJsonMessage(item.message);
    if (
      jsonMsg?.kind === 'reviewer_edit' ||
      jsonMsg?.kind === 'quiz_reviewed' ||
      String(item.id || '').startsWith('report-revedit-') ||
      String(item.id || '').startsWith('report-revquiz-')
    ) {
      continue;
    }

    const subQuestion =
      item.question && typeof item.question === 'object'
        ? item.question
        : jsonMsg?.kind === 'submission' && jsonMsg?.question
        ? jsonMsg.question
        : null;
    const isSub = Boolean(subQuestion) || String(item.id || '').startsWith('report-subm-');

    if (isSub && subQuestion) {
      const loc = localDecisions[item.id];
      const resolvedAt = item.resolved_at || loc?.resolved_at || null;
      const decision =
        item.decision ||
        loc?.decision ||
        (resolvedAt ? 'accepted' : 'pending');
      const status = resolvedAt ? (decision === 'refused' ? 'refused' : 'accepted') : 'pending';
      submissionsMap.set(String(item.id), {
        id: item.id,
        created_at: item.created_at,
        name: item.name || 'Anonyme',
        chapter: item.chapter || item.question_id || 'ch1',
        question: subQuestion,
        status,
        decision: status === 'refused' ? 'refused' : status === 'accepted' ? 'accepted' : null,
        resolved_at: resolvedAt,
      });
    } else if (!isSub) {
      reports.push(item);
    }
  }

  // Merge any locally stored submissions not yet returned by the server
  for (const localSub of readLocalSubmissions()) {
    if (!localSub?.id || submissionsMap.has(String(localSub.id))) continue;
    const loc = localDecisions[localSub.id];
    const resolvedAt = localSub.resolved_at || loc?.resolved_at || null;
    const decision = loc?.decision || localSub.status || (resolvedAt ? 'accepted' : 'pending');
    const status = resolvedAt ? (decision === 'refused' ? 'refused' : 'accepted') : 'pending';
    submissionsMap.set(String(localSub.id), {
      ...localSub,
      status,
      decision: status === 'refused' ? 'refused' : status === 'accepted' ? 'accepted' : null,
      resolved_at: resolvedAt,
    });
  }

  const submissions = [...submissionsMap.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const reviewerEdits = [...reviewerEditsMap.values()];
  const reviewNotifications = [...reviewNotifsMap.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return { attempts, reports, submissions, reviewerEdits, reviewNotifications };
}
