import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QuizPlayer } from './ChapterQuiz.jsx';
import { CHAPTERS, CHAPTER_KEYS, bundledQuestions, bundledById, resetQuestionsCache, imageSrc, resolveDifficulty, mergeLocalAndServerRow } from '../data/useQuestions.js';
import { themes } from '../data/themes.js';
import {
  REVIEWERS,
  readLocalReviewerEdits,
  writeLocalReviewerEdit,
  removeLocalReviewerEdit,
  submitReviewerQuestionEdit,
  submitQuizReviewNotification,
} from '../data/reports.js';

const MAX_SIDE = 1800; // high-resolution cap for very large photos; screenshots <= 1.45 MB are kept 100% lossless

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Impossible de lire ce fichier image.'));
    reader.readAsDataURL(file);
  });
}

// Reads a picture: keeps PNG/JPEG/WebP files <= 1.45 MB 100% lossless, or resizes larger files at 1800 px HD.
function prepareImage(file) {
  return new Promise((resolve, reject) => {
    if (file.type && !/^image\/(png|jpe?g|webp|gif|bmp|avif|heic|heif)$/i.test(file.type)) {
      reject(new Error('Format non pris en charge : utilisez une image PNG, JPEG ou WebP.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      try {
        // Build a compact fallback dataUrl (<= 34 KB) only used if the server is unreachable
        let maxSide = 960;
        let quality = 0.82;
        let compactDataUrl = '';
        for (let attempt = 0; attempt < 8; attempt++) {
          const compactScale = Math.min(1, maxSide / Math.max(img.width, img.height));
          const c2 = document.createElement('canvas');
          c2.width = Math.max(1, Math.round(img.width * compactScale));
          c2.height = Math.max(1, Math.round(img.height * compactScale));
          const ctx2 = c2.getContext('2d');
          ctx2.fillStyle = '#fff';
          ctx2.fillRect(0, 0, c2.width, c2.height);
          ctx2.drawImage(img, 0, 0, c2.width, c2.height);
          compactDataUrl = c2.toDataURL('image/jpeg', quality);
          if (compactDataUrl.length <= 34000) break;
          maxSide = Math.max(360, Math.round(maxSide * 0.85));
          quality = Math.max(0.5, quality - 0.06);
        }

        // If the original file is PNG/JPEG/WebP and <= 1.45 MB, keep the original lossless bytes!
        const normMime =
          file.type === 'image/jpg' ? 'image/jpeg' : file.type;
        if (
          (normMime === 'image/png' || normMime === 'image/jpeg' || normMime === 'image/webp') &&
          file.size > 100 &&
          file.size <= 1450000
        ) {
          const origDataUrl = await readFileAsDataUrl(file);
          const commaIdx = origDataUrl.indexOf(',');
          if (commaIdx > 0) {
            resolve({
              mime: normMime,
              data: origDataUrl.slice(commaIdx + 1),
              compactDataUrl,
            });
            return;
          }
        }

        // Otherwise resize at 1800 px high-quality JPEG
        const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

        resolve({
          mime: 'image/jpeg',
          data: dataUrl.slice(dataUrl.indexOf(',') + 1),
          compactDataUrl,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de lire cette image.'));
    };
    img.src = url;
  });
}

// Picks or drops one or more files, uploads them to public.quiz_images (1400 px HD), and hands back { upload } (or { dataUrl } fallback).
function ImagePicker({ password, label, onPicked, disabled, multiple = false, compact = false }) {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [err, setErr] = useState('');
  const inputRef = useRef(null);

  const openFilePicker = () => {
    if (busy || disabled) return;
    inputRef.current?.click();
  };

  const handleFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length || busy || disabled) return;
    const toProcess = multiple ? files : [files[0]];
    setBusy(true);
    setErr('');
    try {
      for (const file of toProcess) {
        const { mime, data, compactDataUrl } = await prepareImage(file);
        let picked = null;
        try {
          const out = await call(password, { action: 'upload', mime, data });
          if (out?.id) {
            picked = { upload: out.id };
          }
        } catch {
          // Fallback to inline compactDataUrl if offline
        }
        if (!picked) {
          if (compactDataUrl && compactDataUrl.length <= 44000) {
            picked = { dataUrl: compactDataUrl };
          } else {
            throw new Error('Impossible d’enregistrer cette image.');
          }
        }
        onPicked(picked);
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };

  const onChange = (e) => {
    const files = e.target.files;
    e.target.value = ''; // allows picking the same file again
    handleFiles(files);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!busy && !disabled) setDragging(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    if (busy || disabled) return;
    const files = e.dataTransfer?.files;
    if (files?.length) handleFiles(files);
  };

  return (
    <span className={`qa-pick ${compact ? 'is-compact' : 'is-dropzone'}`}>
      <button
        type="button"
        className={`${
          compact ? 'btn btn-ghost btn-small qa-drop-compact' : 'qa-dropzone'
        }${dragging ? ' is-dragging' : ''}${busy || disabled ? ' is-disabled' : ''}`}
        onClick={openFilePicker}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        disabled={busy || disabled}
      >
        {compact ? (
          <span>{busy ? 'Envoi…' : dragging ? 'Déposer l’image ici' : `${label} (ou glisser)`}</span>
        ) : (
          <>
            <span className="qa-dropzone-title">
              {busy ? 'Envoi de l’image…' : dragging ? 'Relâchez pour déposer l’image' : label}
            </span>
            <span className="qa-dropzone-hint">
              Glissez-déposez {multiple ? 'une ou plusieurs images' : 'une image'} ici ou cliquez pour parcourir (PNG, JPEG, WebP)
            </span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple={multiple}
        onChange={onChange}
        disabled={busy || disabled}
        style={{ display: 'none' }}
      />
      {err && <span className="admin-error" role="alert">{err}</span>}
    </span>
  );
}

const CHAPTER_LABELS = {
  ch1: 'Coiffe des rotateurs',
  ch2: 'Instabilité',
  ch3: 'Plexus brachial',
  ch4: 'Autres pathologies (épaule)',
  ch5: 'Coude : compartiment latéral',
  ch6: 'Coude : compartiment médial',
  ch7: 'Coude : compartiment antérieur',
  ch8: 'Coude : compartiment postérieur',
  ch9: 'Coude : autres affections',
  ch10: 'Poignet : pathologies dégénératives',
  ch11: 'Poignet : pathologies ligamentaires',
  ch12: 'Poignet : pathologies tendineuses',
  ch13: 'Poignet & main : vasculonerveux',
  ch14: 'Main & doigts : dégénératif et tendineux',
  ch15: 'Rachis : discopathies cervicales',
  ch16: 'Rachis : mécanique dorsolombaire',
  ch17: 'Rachis : autres affections',
  ch18: 'Hanche : pathologies osseuses',
  ch19: 'Hanche : pathologies articulaires',
  ch20: 'Hanche : pathologies abarticulaires',
  ch21: 'Hanche : plexus lombosacré',
  ch22: 'Hanche : ceinture pelvienne',
  ch23: 'Genou : pathologies antérieures',
  ch24: 'Genou : ménisques',
  ch25: 'Genou : ligaments croisés',
  ch26: 'Genou : collatéraux et postérieurs',
  ch27: 'Genou : autres pathologies',
  ch28: 'Jambe : pathologies de la jambe',
  ch29: 'Cheville & pied : tissus mous',
  ch30: 'Cheville & pied : autres pathologies',
  ch31: 'Dysostose : crâniennes',
  ch32: 'Dysostose : rachidiennes',
  ch33: 'Dysostose : paroi thoracique',
  ch34: 'Dysostose : ceinture scapulaire & membre sup.',
  ch35: 'Dysostose : membre inférieur',
  ch36: 'Dysostose : pied du nourrisson',
};
const chapterNumber = (k) => Number.parseInt(String(k || '').replace(/^ch/i, ''), 10) || 1;
const chapterFullLabel = (k) => `Chapitre ${chapterNumber(k)} — ${CHAPTER_LABELS[k] || k}`;
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

const isReviewerPass = (pw) => String(pw || '').trim().toLowerCase() === 'cocochin';

// updated_at of each question as last seen from the server. Every save sends it back as `baseUpdatedAt`,
// so the server refuses to overwrite a question that someone (or another device) changed in the meantime.
const serverStamps = new Map();
const rememberStamps = (list) => {
  for (const q of Array.isArray(list) ? list : []) {
    if (q?.id && q.updated_at) serverStamps.set(q.id, q.updated_at);
  }
};
const conflictError = (data) => {
  const err = new Error(data?.error || 'Cette question a été modifiée entre-temps. Rechargez la page.');
  err.code = 'conflict';
  return err;
};

async function call(password, payload) {
  if (payload.action === 'save') {
    payload = { ...payload, baseUpdatedAt: serverStamps.get(payload.id) };
  }
  if (payload.action === 'generate_ai') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 14000);
    try {
      const r = await fetch('/api/admin-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ password, ...payload }),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.question) return data;
      // Fallback to local Vite middleware (/api/generate-question) during local dev before backend deploy
      const localRes = await fetch('/api/generate-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (localRes && localRes.ok) {
        const localData = await localRes.json().catch(() => ({}));
        if (localData?.question) return localData;
      }
      throw new Error(data.error || 'Erreur lors de la génération par l’IA.');
    } catch (e) {
      if (e?.name === 'AbortError') {
        throw new Error('La génération IA a mis trop de temps. Veuillez réessayer.');
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  if (isReviewerPass(password)) {
    if (payload.action === 'list') {
      try {
        const r = await fetch('/api/admin-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, action: 'list' }),
        });
        if (r.ok) {
          const data = await r.json().catch(() => ({}));
          if (Array.isArray(data.questions)) {
            rememberStamps(data.questions);
            return { questions: data.questions };
          }
        }
      } catch {
        // Fallback below
      }
      const r = await fetch('/api/questions');
      const data = await r.json().catch(() => ({}));
      rememberStamps(data.questions);
      return { questions: Array.isArray(data.questions) ? data.questions : [] };
    }
    if (payload.action === 'save') {
      try {
        const r = await fetch('/api/admin-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, ...payload }),
        });
        if (r.status === 409) throw conflictError(await r.json().catch(() => ({})));
        if (r.ok) {
          const out = await r.json().catch(() => ({}));
          if (out.updatedAt) serverStamps.set(payload.id, out.updatedAt);
          return { ok: true, ...out };
        }
      } catch (e) {
        if (e?.code === 'conflict') throw e;
        // Fallback below
      }
      await submitReviewerQuestionEdit({
        id: payload.id,
        chapter: payload.chapter,
        position: payload.position,
        question: payload.question,
      });
      return { ok: true };
    }
    if (payload.action === 'import') {
      return { imported: 0 };
    }
  }

  const r = await fetch('/api/admin-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, ...payload }),
  });
  const data = await r.json().catch(() => ({}));
  if (r.status === 409) throw conflictError(data);
  if (r.ok) {
    if (payload.action === 'list') rememberStamps(data.questions);
    if (data.updatedAt && (payload.action === 'save' || payload.action === 'set_reviewed')) {
      serverStamps.set(payload.id, data.updatedAt);
    }
  }
  if (!r.ok) {
    if (r.status === 429 && payload.action === 'list') {
      const qRes = await fetch('/api/questions');
      const qData = await qRes.json().catch(() => ({}));
      return { questions: Array.isArray(qData.questions) ? qData.questions : [] };
    }
    if (r.status === 429 && payload.action === 'save') {
      await submitReviewerQuestionEdit({
        id: payload.id,
        chapter: payload.chapter,
        position: payload.position,
        question: payload.question,
      });
      return { ok: true };
    }
    throw new Error(data.error || 'Erreur inattendue, réessayez.');
  }
  return data;
}

const REVIEW_STORAGE_KEY = 'radio-thomas:reviewed-questions';
const REVIEWED_BY_STORAGE_KEY = 'radio-thomas:reviewed-by-questions';
const ACTIVE_REVIEWER_KEY = 'radio-thomas:reviewer-name';
const LOCAL_DELETED_KEY = 'radio-thomas:deleted-questions';

function readLocalDeleted() {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_DELETED_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeLocalDeleted(map) {
  try {
    localStorage.setItem(LOCAL_DELETED_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

function readLocalReviewed() {
  try {
    const raw = localStorage.getItem(REVIEW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalReviewed(map) {
  try {
    localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

function readLocalReviewedBy() {
  try {
    const raw = localStorage.getItem(REVIEWED_BY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalReviewedBy(map) {
  try {
    localStorage.setItem(REVIEWED_BY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

export function readSavedReviewerName() {
  try {
    const saved = localStorage.getItem(ACTIVE_REVIEWER_KEY);
    return saved && REVIEWERS.includes(saved) ? saved : REVIEWERS[0];
  } catch {
    return REVIEWERS[0];
  }
}

export function saveReviewerName(name) {
  try {
    localStorage.setItem(ACTIVE_REVIEWER_KEY, name);
  } catch {
    // Ignore storage errors
  }
}

const blankQuestion = (reviewerName = '') => ({
  type: 'QCU',
  difficulty: 2,
  theme: '',
  enonce: '',
  enonce_image: null,
  items: LETTERS.slice(0, 4).map((id, i) => ({ id, texte: '', correct: i === 0 })),
  explication: '',
  correction_figures: [],
  source: { page: 1, element: 'Texte', refs: '' },
  reviewed: Boolean(reviewerName),
  reviewed_by: reviewerName || '',
});

export const newId = (chapter, rows = []) => {
  const list = Array.isArray(rows) ? rows : [];
  const used = new Set([
    ...list.map((r) => r.id),
    ...bundledQuestions.map((b) => b.id),
  ]);
  const bundledInChapter = CHAPTERS[chapter]?.questions?.length || 0;
  // Start after bundled questions (or at 51 if the chapter has no bundled questions yet, to avoid future collisions)
  const startN = bundledInChapter > 0 ? bundledInChapter + 1 : 51;
  for (let n = startN; n < 1000; n++) {
    const id = `${chapter.replace('ch', 'c')}-q${String(n).padStart(2, '0')}`;
    if (!used.has(id)) return id;
  }
  return `${chapter}-${Date.now()}`;
};

export default function QuestionsAdmin({
  password,
  editTarget = null,
  onClearEditTarget = null,
  onResolveReport = null,
  onResolveSubmission = null,
  acceptedSubmissions = [],
  reviewerEdits = [],
  activeReviewer = null,
  onChangeReviewer = null,
  reviewerMode = false,
  onEditingChange = null,
}) {
  const [rows, setRows] = useState(null);
  const [localReviewed, setLocalReviewed] = useState(readLocalReviewed);
  const [localReviewedBy, setLocalReviewedBy] = useState(readLocalReviewedBy);
  const [internalReviewer, setInternalReviewer] = useState(readSavedReviewerName);
  const reviewerName = activeReviewer !== null ? activeReviewer : internalReviewer;
  const setReviewerName = (name) => {
    saveReviewerName(name);
    setInternalReviewer(name);
    onChangeReviewer?.(name);
  };
  const [reviewFilter, setReviewFilter] = useState('all'); // all | todo | done
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [chapter, setChapter] = useState('ch1');
  const [editing, setEditing] = useState(null); // { id, chapter, position, q, isNew, reportContext, aiContext }
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    if (!onEditingChange) return;
    if (editing) {
      onEditingChange(() => () => {
        setEditing(null);
        setPreview(false);
        setError('');
      });
    } else {
      onEditingChange(null);
    }
  }, [editing, onEditingChange]);
  const [busy, setBusy] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiChapter, setAiChapter] = useState('ch1');
  const [aiType, setAiType] = useState('AUTO');
  const [aiDifficulty, setAiDifficulty] = useState(2);
  const [aiTopicHint, setAiTopicHint] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      let data = await call(password, { action: 'list' });
      let dbList = data.questions || [];
      let changed = false;

      // 1. If a user-proposed question in DB collided with a newly added bundled question ID (e.g. c5-q01),
      // move the user-proposed question to a fresh non-colliding ID and restore the bundled question.
      if (!reviewerMode) {
        for (const r of [...dbList]) {
          const bundled = bundledById.get(r.id);
          if (
            bundled &&
            r.data?.source?.element === 'Proposition utilisateur' &&
            r.data?.enonce?.trim() !== bundled.enonce?.trim()
          ) {
            try {
              const chRows = [...dbList, ...bundledQuestions].filter((x) => x.chapter === r.chapter);
              const nextPos = chRows.length ? Math.max(...chRows.map((x) => x.position || 0)) + 1 : 50;
              const freshId = newId(r.chapter, [...dbList, ...bundledQuestions]);
              await call(password, {
                action: 'save',
                id: freshId,
                chapter: r.chapter,
                position: nextPos,
                question: r.data,
              });
              const bRow = bundledQuestions.find((b) => b.id === r.id);
              if (bRow) {
                await call(password, {
                  action: 'save',
                  id: bRow.id,
                  chapter: bRow.chapter,
                  position: bRow.position,
                  question: bRow.data,
                });
              }
              changed = true;
            } catch {
              // Keep existing row if migration fails
            }
          }
        }
      }

      // 2. Auto-import any new bundled questions in chunks of 100 (so we never exceed the 200-item API cap).
      if (!reviewerMode && dbList.length > 0) {
        const known = new Set(dbList.map((r) => r.id));
        const missing = bundledQuestions.filter((b) => !known.has(b.id));
        if (missing.length > 0) {
          try {
            for (let i = 0; i < missing.length; i += 100) {
              await call(password, { action: 'import', items: missing.slice(i, i + 100) });
            }
            changed = true;
          } catch {
            // Do not discard dbList if an import batch fails
          }
        }
      }

      // 3. Ensure any accepted user-proposed question (from Propositions) is present in quiz_questions.
      if (!reviewerMode && Array.isArray(acceptedSubmissions) && acceptedSubmissions.length > 0) {
        const existingEnonces = new Set(
          dbList.map((r) => `${r.chapter}::${(r.data?.enonce || '').trim().toLowerCase()}`)
        );
        for (const sub of acceptedSubmissions) {
          if (!sub?.question?.enonce || !sub?.chapter) continue;
          const key = `${sub.chapter}::${sub.question.enonce.trim().toLowerCase()}`;
          if (!existingEnonces.has(key)) {
            try {
              const allKnown = [...dbList, ...bundledQuestions];
              const chRows = allKnown.filter((x) => x.chapter === sub.chapter);
              const nextPos = chRows.length ? Math.max(...chRows.map((x) => x.position || 0)) + 1 : 50;
              const freshId = newId(sub.chapter, allKnown);
              await call(password, {
                action: 'save',
                id: freshId,
                chapter: sub.chapter,
                position: nextPos,
                question: { ...sub.question, reviewed: true },
              });
              existingEnonces.add(key);
              dbList.push({
                id: freshId,
                chapter: sub.chapter,
                position: nextPos,
                data: { ...sub.question, reviewed: true },
              });
              changed = true;
            } catch {
              // Ignore individual save error
            }
          }
        }
      }

      // Backfill any already-reviewed questions that don't have a reviewer name yet to "Thomas L."
      const locRev = readLocalReviewed();
      const locRevBy = readLocalReviewedBy();
      const localEditsMap = readLocalReviewerEdits();
      let locByChanged = false;
      for (const [qid, val] of Object.entries(locRev)) {
        if (val && !locRevBy[qid]) {
          locRevBy[qid] = 'Thomas L.';
          locByChanged = true;
        }
      }
      if (locByChanged) {
        writeLocalReviewedBy(locRevBy);
        setLocalReviewedBy(locRevBy);
      }

      if (changed) {
        resetQuestionsCache();
        try {
          data = await call(password, { action: 'list' });
          dbList = data.questions || dbList;
        } catch {
          // Keep updated dbList
        }
      }

      // Merge with bundledQuestions and any reviewer edits (remote or local)
      const locDeleted = readLocalDeleted();
      const serverById = new Map(dbList.map((r) => [r.id, r]));
      const byId = new Map(dbList.map((r) => [r.id, r]));
      if (dbList.length === 0) {
        for (const b of bundledQuestions) {
          if (!byId.has(b.id)) byId.set(b.id, b);
        }
      }
      for (const [delId, delInfo] of Object.entries(locDeleted)) {
        if (!delInfo?.deleted_at) continue;
        const curr = byId.get(delId);
        if (curr) {
          byId.set(delId, { ...curr, deleted_at: curr.deleted_at || delInfo.deleted_at });
        } else if (delInfo.data && delInfo.chapter) {
          byId.set(delId, {
            id: delId,
            chapter: delInfo.chapter,
            position: delInfo.position || 0,
            data: delInfo.data,
            deleted_at: delInfo.deleted_at,
          });
        }
      }
      for (const revEd of reviewerEdits || []) {
        if (revEd?.id && revEd?.data) {
          const curr = byId.get(revEd.id);
          if (curr?.deleted_at || locDeleted[revEd.id]) continue;
          if (!curr || !curr.updated_at || (revEd.updated_at && revEd.updated_at >= curr.updated_at)) {
            byId.set(revEd.id, revEd);
          }
        }
      }
      const idsToSync = new Set();
      for (const [id, localEd] of Object.entries(localEditsMap)) {
        if (localEd?.id && localEd?.data) {
          const srv = serverById.get(id);
          if (srv?.deleted_at || locDeleted[id]) {
            removeLocalReviewerEdit(id);
            continue;
          }
          const { row: mergedRow, removeLocal, shouldSyncToServer } = mergeLocalAndServerRow(id, localEd, srv);
          byId.set(id, mergedRow);
          if (removeLocal) {
            removeLocalReviewerEdit(id);
          }
          if (shouldSyncToServer) {
            idsToSync.add(id);
          }
        }
      }

      // Auto-sync any local edits or local 'reviewed' statuses to the database so phones/other devices see them
      for (const [id, row] of byId.entries()) {
        if (!row || row.deleted_at) continue;
        const srv = serverById.get(id);
        const srvData = srv?.data;
        const hasLocalRev = Boolean(locRev[id]);
        const shouldBeReviewed = Boolean(row.data?.reviewed || hasLocalRev);
        const chosenRevBy = shouldBeReviewed
          ? row.data?.reviewed_by || locRevBy[id] || 'Thomas L.'
          : null;
        const mergedData = {
          ...row.data,
          reviewed: shouldBeReviewed,
          ...(chosenRevBy ? { reviewed_by: chosenRevBy } : {}),
        };
        if (shouldBeReviewed !== Boolean(row.data?.reviewed) || chosenRevBy !== (row.data?.reviewed_by || null)) {
          byId.set(id, { ...row, data: mergedData });
        }

        // Only the "reviewed" flag is pushed from here, and the server applies it on its own current copy:
        // an out-of-date page can never send old question text back.
        const isOutOfSync = shouldBeReviewed && srv && (!srvData?.reviewed || !srvData?.reviewed_by);

        // A real unsynced edit (a save that failed earlier) is retried; the server still refuses it if the
        // question changed since this list was loaded (see serverStamps / baseUpdatedAt).
        if (idsToSync.has(id) && srv) {
          call(password, {
            action: 'save',
            id: row.id,
            chapter: row.chapter,
            position: row.position || 0,
            question: mergedData,
          })
            .then(() => removeLocalReviewerEdit(row.id))
            .catch((e) => {
              if (e?.code === 'conflict') removeLocalReviewerEdit(row.id);
            });
        } else if (isOutOfSync) {
          call(password, {
            action: 'set_reviewed',
            id: row.id,
            reviewed: true,
            reviewedBy: chosenRevBy,
          })
            .then(() => {
              removeLocalReviewerEdit(row.id);
            })
            .catch(() => {});
        }
      }

      setRows([...byId.values()]);
    } catch (e) {
      setError(e.message);
      setRows(bundledQuestions);
    }
  }, [password, acceptedSubmissions, reviewerEdits, reviewerMode]);

  useEffect(() => { load(); }, [load]);

  const isRowReviewed = useCallback(
    (row) => {
      if (!row) return false;
      if (localReviewed[row.id] !== undefined) return Boolean(localReviewed[row.id]);
      return Boolean(row.data?.reviewed || row.data?.reviewed_by);
    },
    [localReviewed]
  );

  const getRowReviewer = useCallback(
    (row) => {
      if (!row) return '';
      if (localReviewedBy[row.id]) return localReviewedBy[row.id];
      if (row.data?.reviewed_by) return row.data.reviewed_by;
      if (isRowReviewed(row)) return 'Thomas L.';
      return '';
    },
    [localReviewedBy, isRowReviewed]
  );

  const toggleReviewed = async (row, nextVal = !isRowReviewed(row)) => {
    const chosenReviewer = nextVal ? reviewerName || row.data?.reviewed_by || REVIEWERS[0] : '';
    const updatedMap = { ...localReviewed, [row.id]: nextVal };
    const updatedByMap = { ...localReviewedBy, [row.id]: chosenReviewer };
    setLocalReviewed(updatedMap);
    writeLocalReviewed(updatedMap);
    setLocalReviewedBy(updatedByMap);
    writeLocalReviewedBy(updatedByMap);

    const nextData = {
      ...row.data,
      reviewed: nextVal,
      reviewed_by: chosenReviewer || null,
    };

    const otherReviewedInChapter = live.filter((r) => r.id !== row.id && isRowReviewed(r)).length;
    const newChapterReviewedCount = otherReviewedInChapter + (nextVal ? 1 : 0);

    setRows((prev) =>
      (prev || []).map((r) => (r.id === row.id ? { ...r, data: nextData } : r))
    );
    try {
      await call(password, {
        action: 'set_reviewed',
        id: row.id,
        reviewed: nextVal,
        reviewedBy: chosenReviewer,
      });
      if (nextVal && live.length > 0 && newChapterReviewedCount === live.length) {
        await submitQuizReviewNotification({
          password,
          chapter: row.chapter,
          reviewer: chosenReviewer,
          count: live.length,
          total: live.length,
        });
        setNotice(
          `✓ Toutes les questions de « ${chapterFullLabel(row.chapter)} » sont relues par ${chosenReviewer} ! L’administrateur a reçu une notification.`
        );
      }
      resetQuestionsCache();
    } catch {
      // Kept in localStorage even if offline or before backend deploy
    }
  };

  const markWholeChapterReviewed = async () => {
    if (live.length === 0) return;
    const chosenReviewer = reviewerName || REVIEWERS[0];
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updatedMap = { ...localReviewed };
      const updatedByMap = { ...localReviewedBy };
      const toUpdate = live.filter((r) => !isRowReviewed(r) || !getRowReviewer(r));

      for (const r of live) {
        updatedMap[r.id] = true;
        if (!updatedByMap[r.id]) updatedByMap[r.id] = r.data?.reviewed_by || chosenReviewer;
      }
      setLocalReviewed(updatedMap);
      writeLocalReviewed(updatedMap);
      setLocalReviewedBy(updatedByMap);
      writeLocalReviewedBy(updatedByMap);

      setRows((prev) =>
        (prev || []).map((r) => {
          if (r.chapter !== chapter || r.deleted_at) return r;
          const nextData = {
            ...r.data,
            reviewed: true,
            reviewed_by: r.data?.reviewed_by || chosenReviewer,
          };
          return { ...r, data: nextData };
        })
      );

      for (const r of toUpdate) {
        const nextData = {
          ...r.data,
          reviewed: true,
          reviewed_by: r.data?.reviewed_by || chosenReviewer,
        };
        await call(password, {
          action: 'set_reviewed',
          id: r.id,
          reviewed: true,
          reviewedBy: nextData.reviewed_by,
        }).catch(() => {});
      }

      await submitQuizReviewNotification({
        password,
        chapter,
        reviewer: chosenReviewer,
        count: live.length,
        total: live.length,
      });
      resetQuestionsCache();
      setNotice(
        `✓ Le chapitre « ${chapterFullLabel(chapter)} » est marqué comme relu par ${chosenReviewer}. L’administrateur a été notifié !`
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Open a specific question directly when arriving from a user report or user-proposed question
  useEffect(() => {
    if (!editTarget) return;
    const subQ = editTarget.question || editTarget.submissionQuestion;
    if (editTarget.isSubmission && subQ) {
      const currentRows = rows || bundledQuestions;
      const targetChapter = editTarget.chapter || 'ch1';
      const chapterRows = currentRows.filter((r) => !r.deleted_at && r.chapter === targetChapter);
      const position = chapterRows.length ? Math.max(...chapterRows.map((r) => r.position)) + 1 : 0;
      setChapter(targetChapter);
      setEditing({
        id: newId(targetChapter, currentRows),
        chapter: targetChapter,
        position,
        q: {
          ...blankQuestion(),
          ...structuredClone(subQ),
          reviewed: true,
        },
        isNew: true,
        submissionContext: {
          ...editTarget,
          author: editTarget.author || editTarget.reportAuthor || 'Anonyme',
        },
      });
      onClearEditTarget?.();
      return;
    }
    if (rows === null) return;
    if (!editTarget.questionId) return;
    const found =
      rows.find((r) => r.id === editTarget.questionId) ||
      bundledQuestions.find((b) => b.id === editTarget.questionId);
    if (found) {
      setChapter(found.chapter);
      setEditing({
        id: found.id,
        chapter: found.chapter,
        position: found.position,
        q: {
          ...structuredClone(found.data),
          difficulty: resolveDifficulty(found.id, found.data?.difficulty),
          reviewed: isRowReviewed(found),
        },
        isNew: false,
        reportContext: editTarget,
      });
    } else if (editTarget.chapter) {
      setChapter(editTarget.chapter);
    }
    onClearEditTarget?.();
  }, [editTarget, rows, onClearEditTarget, isRowReviewed]);

  const allLive = useMemo(() => (rows || []).filter((r) => !r.deleted_at), [rows]);
  const reviewedTotal = useMemo(() => allLive.filter((r) => isRowReviewed(r)).length, [allLive, isRowReviewed]);
  const globalPct = allLive.length ? Math.round((reviewedTotal / allLive.length) * 100) : 0;

  const chapterCounts = useMemo(() => {
    const map = {};
    for (const k of CHAPTER_KEYS) map[k] = { total: 0, reviewed: 0 };
    for (const r of allLive) {
      if (map[r.chapter]) {
        map[r.chapter].total += 1;
        if (isRowReviewed(r)) map[r.chapter].reviewed += 1;
      }
    }
    return map;
  }, [allLive, isRowReviewed]);

  const live = useMemo(
    () => (rows || []).filter((r) => !r.deleted_at && r.chapter === chapter).sort((a, b) => a.position - b.position),
    [rows, chapter]
  );

  const filteredLive = useMemo(() => {
    if (reviewFilter === 'todo') return live.filter((r) => !isRowReviewed(r));
    if (reviewFilter === 'done') return live.filter((r) => isRowReviewed(r));
    return live;
  }, [live, reviewFilter, isRowReviewed]);

  const chapterReviewedCount = useMemo(() => live.filter((r) => isRowReviewed(r)).length, [live, isRowReviewed]);
  const deleted = useMemo(() => (rows || []).filter((r) => r.deleted_at && r.chapter === chapter), [rows, chapter]);

  const importBundled = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      let totalImported = 0;
      for (let i = 0; i < bundledQuestions.length; i += 100) {
        const out = await call(password, { action: 'import', items: bundledQuestions.slice(i, i + 100) });
        totalImported += Number(out.imported) || 0;
      }
      resetQuestionsCache();
      setNotice(`${totalImported} nouvelle(s) question(s) importée(s) dans la base en ligne.`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const edit = (row) =>
    setEditing({
      id: row.id,
      chapter: row.chapter,
      position: row.position,
      q: {
        ...structuredClone(row.data),
        difficulty: resolveDifficulty(row.id, row.data?.difficulty),
        reviewed: isRowReviewed(row),
        reviewed_by: getRowReviewer(row) || reviewerName || '',
      },
      isNew: false,
    });
  const create = () => {
    const position = live.length ? Math.max(...live.map((r) => r.position)) + 1 : 0;
    setEditing({
      id: newId(chapter, rows || []),
      chapter,
      position,
      q: { ...blankQuestion(), reviewed_by: reviewerName || '' },
      isNew: true,
    });
  };

  const openAiGenerator = () => {
    setAiChapter(chapter);
    setError('');
    setNotice('');
    setAiModalOpen(true);
  };

  const runAiGenerator = async (overrideParams = null) => {
    const targetChapter = overrideParams?.chapter || aiChapter || chapter;
    const targetType = overrideParams?.questionType || aiType || 'AUTO';
    const targetDiff = Number(overrideParams?.difficulty || aiDifficulty || 2);
    const targetHint = overrideParams?.topicHint !== undefined ? overrideParams.topicHint : aiTopicHint;

    setAiBusy(true);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const currentRows = rows || bundledQuestions;
      const chapterRows = currentRows.filter((r) => !r.deleted_at && r.chapter === targetChapter);
      const existingQuestions = chapterRows.map((r) => ({
        theme: r.data?.theme || '',
        enonce: r.data?.enonce || '',
      }));
      if (editing?.q?.enonce) {
        existingQuestions.push({
          theme: editing.q.theme || '',
          enonce: editing.q.enonce,
        });
      }

      const out = await call(password, {
        action: 'generate_ai',
        chapter: targetChapter,
        questionType: targetType,
        difficulty: targetDiff,
        topicHint: targetHint,
        existingQuestions,
      });

      const generated = out.question;
      const position = chapterRows.length ? Math.max(...chapterRows.map((r) => r.position || 0)) + 1 : 0;
      setChapter(targetChapter);
      setAiModalOpen(false);
      setPreview(true);
      setEditing({
        id: newId(targetChapter, currentRows),
        chapter: targetChapter,
        position,
        q: {
          ...blankQuestion(reviewerName),
          ...generated,
          reviewed: true,
          reviewed_by: reviewerName || REVIEWERS[0],
        },
        isNew: true,
        aiContext: {
          chapter: targetChapter,
          questionType: targetType,
          difficulty: targetDiff,
          topicHint: targetHint,
        },
      });
    } catch (e) {
      setError(e.message || 'Erreur lors de la génération par l’IA.');
    } finally {
      setAiBusy(false);
      setBusy(false);
    }
  };

  const save = async (forceReviewed = null) => {
    setError('');
    setNotice('');

    if (!editing?.q?.enonce || !String(editing.q.enonce).trim()) {
      setError('Veuillez renseigner l’énoncé de la question.');
      return;
    }
    const items = Array.isArray(editing.q.items) ? editing.q.items : [];
    if (items.length < 2 || items.some((it) => !String(it?.texte || '').trim())) {
      setError('Chaque proposition de réponse doit contenir du texte.');
      return;
    }
    if (!items.some((it) => it.correct)) {
      setError('Veuillez cocher au moins une bonne réponse.');
      return;
    }

    setBusy(true);
    const nextReviewed = forceReviewed !== null ? forceReviewed : Boolean(editing.q.reviewed);
    const chosenReviewer = nextReviewed
      ? editing.q.reviewed_by || reviewerName || REVIEWERS[0]
      : editing.q.reviewed_by || '';

    const rawPage = Number.parseInt(editing.q.source?.page, 10);
    const nextQ = {
      ...editing.q,
      theme: String(editing.q.theme || '').trim() || CHAPTER_LABELS[editing.chapter] || 'Général',
      enonce: String(editing.q.enonce || '').trim(),
      explication: String(editing.q.explication || '').trim() || 'Correction validée.',
      items: items.map((it) => ({
        ...it,
        texte: String(it.texte || '').trim().slice(0, 800),
      })),
      correction_figures: (editing.q.correction_figures || []).map((f) => ({
        ...f,
        caption: String(f?.caption || '').trim() || 'Figure',
      })),
      source: {
        page: Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 9999 ? rawPage : 1,
        element: String(editing.q.source?.element || '').trim() || 'Texte',
        refs: String(editing.q.source?.refs || '').trim(),
      },
      reviewed: nextReviewed,
      reviewed_by: chosenReviewer || null,
    };

    const allRows = rows || bundledQuestions;
    const finalId =
      editing.isNew && allRows.some((r) => r.id === editing.id)
        ? newId(editing.chapter, allRows)
        : editing.id;
    const updatedMap = { ...localReviewed, [finalId]: nextReviewed };
    const updatedByMap = { ...localReviewedBy, [finalId]: chosenReviewer };
    setLocalReviewed(updatedMap);
    writeLocalReviewed(updatedMap);
    setLocalReviewedBy(updatedByMap);
    writeLocalReviewedBy(updatedByMap);

    const savedRow = {
      id: finalId,
      chapter: editing.chapter,
      position: editing.position,
      data: nextQ,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    writeLocalReviewerEdit(savedRow);

    setRows((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [...bundledQuestions];
      const idx = list.findIndex((r) => r.id === finalId);
      if (idx >= 0) {
        list[idx] = savedRow;
      } else {
        list.push(savedRow);
      }
      return list;
    });

    const otherReviewedInChapter = live.filter((r) => r.id !== finalId && isRowReviewed(r)).length;
    const newChapterReviewedCount = otherReviewedInChapter + (nextReviewed ? 1 : 0);
    const totalInChapter = editing.isNew ? live.length + 1 : live.length;
    const chapterNotified = nextReviewed && totalInChapter > 0 && newChapterReviewedCount === totalInChapter;

    const currentEditing = editing;
    setNotice(
      currentEditing.submissionContext
        ? `Question publiée et proposition de ${currentEditing.submissionContext.author || 'l’utilisateur'} validée (+10 pts) !`
        : chapterNotified
        ? `Question enregistrée et chapitre « ${chapterFullLabel(currentEditing.chapter)} » entièrement relu par ${chosenReviewer} (administrateur notifié) !`
        : nextReviewed && chosenReviewer
        ? `Question enregistrée et marquée « Relu par ${chosenReviewer} ».`
        : 'Question enregistrée.'
    );

    // Redirect immediately back to the main reviewer/questions list
    setEditing(null);
    setPreview(false);
    setBusy(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    try {
      const saveOut = await call(password, {
        action: 'save',
        id: finalId,
        chapter: currentEditing.chapter,
        position: currentEditing.position,
        question: nextQ,
      });
      // Once saved in the central Supabase database, remove from local offline queue so colleagues' future edits are never overwritten
      removeLocalReviewerEdit(finalId);
      if (saveOut?.question) {
        const promotedRow = {
          ...savedRow,
          data: saveOut.question,
          updated_at: new Date().toISOString(),
        };
        setRows((prev) =>
          (prev || []).map((r) => (r.id === finalId ? promotedRow : r))
        );
      }
      if (currentEditing.reportContext && onResolveReport) {
        await onResolveReport(currentEditing.reportContext);
      }
      if (currentEditing.submissionContext && onResolveSubmission) {
        await onResolveSubmission(currentEditing.submissionContext, 'accepted');
      }
      if (chapterNotified) {
        await submitQuizReviewNotification({
          password,
          chapter: currentEditing.chapter,
          reviewer: chosenReviewer || reviewerName || REVIEWERS[0],
          count: totalInChapter,
          total: totalInChapter,
        });
      }
      resetQuestionsCache();
    } catch (e) {
      if (e?.code === 'conflict') {
        // Somebody (or another device) changed this question since this page loaded: keep the server copy.
        removeLocalReviewerEdit(finalId);
        setNotice('');
        setError(
          'Cette question a été modifiée entre-temps sur un autre appareil : votre enregistrement n’a PAS été appliqué pour ne rien écraser. La liste est rechargée ; refaites votre modification si besoin.'
        );
        await load();
      }
      // Other errors: saved locally in writeLocalReviewerEdit so the user never loses their work
    }
  };

  const remove = async (row) => {
    if (!window.confirm('Supprimer cette question du quiz ? (Elle reste récupérable depuis la liste « Supprimées ».)')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await call(password, { action: 'delete', id: row.id });
      const deletedAt = new Date().toISOString();
      const locDel = readLocalDeleted();
      locDel[row.id] = {
        deleted_at: deletedAt,
        chapter: row.chapter,
        position: row.position || 0,
        data: row.data || row.q,
      };
      writeLocalDeleted(locDel);
      removeLocalReviewerEdit(row.id);
      setRows((prev) =>
        (prev || []).map((r) =>
          r.id === row.id ? { ...r, deleted_at: deletedAt } : r
        )
      );
      resetQuestionsCache();
      setNotice('Question supprimée.');
      setEditing(null);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const restore = async (row) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await call(password, { action: 'save', id: row.id, chapter: row.chapter, position: row.position, question: row.data });
      const locDel = readLocalDeleted();
      if (locDel[row.id]) {
        delete locDel[row.id];
        writeLocalDeleted(locDel);
      }
      setRows((prev) =>
        (prev || []).map((r) =>
          r.id === row.id ? { ...r, deleted_at: null } : r
        )
      );
      resetQuestionsCache();
      setNotice('Question rétablie.');
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (rows === null && !editing) return <p className="admin-empty">Chargement…</p>;

  if (editing) {
    return (
      <Editor
        editing={editing}
        setEditing={setEditing}
        busy={busy}
        aiBusy={aiBusy}
        error={error}
        onSave={() => save(null)}
        onSaveAndReview={() => save(true)}
        onRegenerateAi={editing.aiContext ? () => runAiGenerator(editing.aiContext) : null}
        onCancel={() => { setEditing(null); setPreview(false); setError(''); }}
        onDelete={editing.isNew ? null : () => remove(editing)}
        preview={preview}
        setPreview={setPreview}
        password={password}
        reviewerName={reviewerName}
        setReviewerName={setReviewerName}
      />
    );
  }

  return (
    <div className="qa">
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="qa-notice" role="status">{notice}</p>}

      <div className="qa-review-summary">
        <div className="qa-reviewer-bar">
          <span className="qa-reviewer-label">Correcteur actif (« Relu par… ») :</span>
          <div className="qa-reviewer-pills" role="group" aria-label="Sélectionner le nom du correcteur">
            {REVIEWERS.map((rev) => (
              <button
                key={rev}
                type="button"
                className={`qa-reviewer-pill ${reviewerName === rev ? 'on' : ''}`}
                onClick={() => setReviewerName(rev)}
              >
                {reviewerName === rev ? `✓ ${rev}` : rev}
              </button>
            ))}
          </div>
        </div>

        <div className="qa-review-head">
          <div>
            <strong>Suivi de relecture des questions</strong>
            <span>
              <b>{reviewedTotal}</b> / {allLive.length} questions relues et validées ({globalPct} %)
            </span>
          </div>
        </div>
        <div className="cq-bar qa-review-bar">
          <div style={{ width: `${globalPct}%` }} />
        </div>
      </div>

      {(() => {
        const currentTheme = themes.find((t) => t.chapters.some((c) => c.id === chapter)) || themes[0];

        return (
          <div className="qa-nav" aria-label="Navigation par thème et chapitre">
            <div className="qa-nav-section">
              <div className="qa-nav-label">1. Choisir une région anatomique</div>
              <div className="qa-theme-tabs" role="tablist" aria-label="Thèmes">
                {themes.map((t) => {
                  const isActiveTheme = t.id === currentTheme.id;
                  const firstNum = chapterNumber(t.chapters[0]?.id);
                  const lastNum = chapterNumber(t.chapters[t.chapters.length - 1]?.id);
                  const themeStats = t.chapters.reduce(
                    (acc, c) => {
                      const st = chapterCounts[c.id] || { total: 0, reviewed: 0 };
                      acc.total += st.total;
                      acc.reviewed += st.reviewed;
                      return acc;
                    },
                    { total: 0, reviewed: 0 }
                  );
                  const themeDone = themeStats.total > 0 && themeStats.reviewed === themeStats.total;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={isActiveTheme}
                      className={`qa-theme-tab ${isActiveTheme ? 'on' : ''}`}
                      onClick={() => {
                        if (!t.chapters.some((c) => c.id === chapter) && t.chapters[0]) {
                          setChapter(t.chapters[0].id);
                        }
                      }}
                    >
                      <span className="qa-theme-tab-title">{t.title}</span>
                      <span className="qa-theme-tab-meta">
                        <span>Ch. {firstNum}–{lastNum}</span>
                        {themeStats.total > 0 && (
                          <em className={themeDone ? 'is-done' : ''}>
                            {themeDone ? `✓ ${themeStats.reviewed}/${themeStats.total}` : `${themeStats.reviewed}/${themeStats.total}`}
                          </em>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="qa-nav-section">
              <div className="qa-nav-label">
                2. Chapitres — <strong>{currentTheme.title}</strong>
              </div>
              <div className="qa-chapter-grid" role="tablist" aria-label={`Chapitres de ${currentTheme.title}`}>
                {currentTheme.chapters.map((c) => {
                  const k = c.id;
                  const num = chapterNumber(k);
                  const st = chapterCounts[k] || { total: 0, reviewed: 0 };
                  const allDone = st.total > 0 && st.reviewed === st.total;
                  const isSelected = chapter === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      className={`qa-chapter-card ${isSelected ? 'on' : ''}`}
                      onClick={() => setChapter(k)}
                    >
                      <div className="qa-chapter-card-top">
                        <span className="qa-chapter-num">Chapitre {num}</span>
                        <span className={`qa-chip-count ${allDone ? 'is-done' : ''}`}>
                          {st.total > 0
                            ? allDone
                              ? `✓ ${st.reviewed}/${st.total}`
                              : `${st.reviewed}/${st.total}`
                            : '0 question'}
                        </span>
                      </div>
                      <div className="qa-chapter-card-title">{c.title}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      <div className="qa-bar">
        <div className="qa-bar-info">
          <strong className="qa-bar-chapter">{chapterFullLabel(chapter)}</strong>
          <span>
            {live.length} question(s) · <b>{chapterReviewedCount}</b> relue(s) sur {live.length}
          </span>
        </div>
        <div className="qa-bar-actions">
          <button
            type="button"
            className="btn btn-small qa-ai-btn"
            onClick={openAiGenerator}
            disabled={busy}
          >
            ✨ Générer une question par IA
          </button>
          <button className="btn btn-small" onClick={create}>+ Nouvelle question</button>
        </div>
      </div>

      {aiModalOpen && (
        <div className="qa-ai-panel" role="region" aria-label="Générer une question par l’IA">
          <div className="qa-ai-panel-head">
            <div>
              <strong>✨ Générer une nouvelle question à partir du livre (IA Gemini)</strong>
              <p>
                L’IA lit directement le chapitre choisi dans l’ouvrage <em>Imagerie musculosquelettique – Pathologies locorégionales</em> et rédige une question sourcée en évitant de répéter les{' '}
                <b>{(chapterCounts[aiChapter]?.total || 0)}</b> question(s) déjà présentes dans ce chapitre.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setAiModalOpen(false)}
              disabled={aiBusy}
            >
              ✕ Fermer
            </button>
          </div>

          <div className="qa-grid qa-ai-grid">
            <label>1. Choisir le chapitre du livre (1 à 36)
              <select
                className="admin-input"
                value={aiChapter}
                onChange={(e) => setAiChapter(e.target.value)}
                disabled={aiBusy}
              >
                {themes.map((t) => (
                  <optgroup key={t.id} label={t.title}>
                    {t.chapters.map((c) => (
                      <option key={c.id} value={c.id}>
                        Chapitre {chapterNumber(c.id)} — {c.title} ({chapterCounts[c.id]?.total || 0} q.)
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            <label>2. Type de question
              <select
                className="admin-input"
                value={aiType}
                onChange={(e) => setAiType(e.target.value)}
                disabled={aiBusy}
              >
                <option value="AUTO">Au choix de l’IA (QCU ou QRM)</option>
                <option value="QCU">QCU (1 seule bonne réponse)</option>
                <option value="QRM">QRM (plusieurs bonnes réponses)</option>
              </select>
            </label>

            <label>3. Niveau de difficulté
              <div className="qa-diff-picker" role="group" aria-label="Niveau de difficulté IA">
                {[1, 2, 3].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    className={`qa-diff-btn qa-diff-${lvl} ${aiDifficulty === lvl ? 'on' : ''}`}
                    onClick={() => setAiDifficulty(lvl)}
                    disabled={aiBusy}
                  >
                    Niveau {lvl}
                  </button>
                ))}
              </div>
            </label>
          </div>

          <label className="qa-field">
            4. Notion ou sous-thème particulier à cibler (facultatif — laissez vide pour que l’IA choisisse une partie non traitée du chapitre)
            <input
              className="admin-input"
              value={aiTopicHint}
              maxLength={120}
              placeholder="Ex. : Classification de Patte, conflit postérosupérieur, critères IRM d’instabilité…"
              onChange={(e) => setAiTopicHint(e.target.value)}
              disabled={aiBusy}
            />
          </label>

          <div className="qa-ai-actions">
            <button
              type="button"
              className="btn qa-ai-submit-btn"
              onClick={() => runAiGenerator()}
              disabled={aiBusy}
            >
              {aiBusy ? '✨ Lecture du chapitre et rédaction en cours…' : `✨ Générer la question (${chapterFullLabel(aiChapter)})`}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAiModalOpen(false)}
              disabled={aiBusy}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {filteredLive.length === 0 ? (
        <p className="admin-empty">
          {live.length === 0
            ? 'Aucune question dans ce chapitre pour le moment.'
            : reviewFilter === 'todo'
            ? 'Toutes les questions de ce chapitre ont été relues et validées !'
            : 'Aucune question relue dans ce chapitre pour le moment.'}
        </p>
      ) : (
        <ol className="qa-list">
          {filteredLive.map((r) => {
            const idxInChapter = live.findIndex((x) => x.id === r.id);
            const checked = isRowReviewed(r);
            const rReviewer = getRowReviewer(r);
            return (
              <li key={r.id} className={`qa-list-item ${checked ? 'is-reviewed' : ''}`}>
                <label className={`qa-review-check ${checked ? 'on' : ''}`} title="Marquer comme relue et validée">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleReviewed(r, e.target.checked)}
                  />
                  <span>
                    {checked ? (rReviewer ? `Relue · ${rReviewer}` : 'Relue') : 'À relire'}
                  </span>
                </label>
                <button className="qa-row" onClick={() => edit(r)}>
                  <b>{idxInChapter + 1}</b>
                  <span className="qa-text">{r.data.enonce}</span>
                  <span className={`qa-diff qa-diff-${resolveDifficulty(r.id, r.data?.difficulty)}`}>
                    Niv. {resolveDifficulty(r.id, r.data?.difficulty)}
                  </span>
                  <span className={`qa-type qa-${r.data.type}`}>{r.data.type}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {deleted.length > 0 && (
        <details className="qa-deleted">
          <summary>{deleted.length} supprimée(s)</summary>
          <ul>
            {deleted.map((r) => (
              <li key={r.id}>
                <span className="qa-text">{r.data.enonce}</span>
                <button className="link-btn" onClick={() => restore(r)} disabled={busy}>Rétablir</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Editor({ editing, setEditing, busy, aiBusy, error, onSave, onSaveAndReview, onRegenerateAi, onCancel, onDelete, preview, setPreview, password, reviewerName, setReviewerName }) {
  const q = editing.q;
  const set = (patch) => setEditing((e) => ({ ...e, q: { ...e.q, ...patch } }));
  const setItem = (i, patch) => set({ items: q.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) });
  const setFigure = (i, patch) =>
    set({ correction_figures: q.correction_figures.map((f, k) => (k === i ? { ...f, ...patch } : f)) });
  const moveFigure = (i, d) => {
    const next = [...q.correction_figures];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set({ correction_figures: next });
  };

  const changeType = (type) => {
    // QCU keeps a single correct answer.
    let items = q.items;
    if (type === 'QCU') {
      const first = items.findIndex((it) => it.correct);
      items = items.map((it, k) => ({ ...it, correct: k === (first === -1 ? 0 : first) }));
    }
    set({ type, items });
  };
  const toggleCorrect = (i) => {
    if (q.type === 'QCU') set({ items: q.items.map((it, k) => ({ ...it, correct: k === i })) });
    else setItem(i, { correct: !q.items[i].correct });
  };
  const addItem = () => {
    if (q.items.length >= 6) return;
    set({ items: [...q.items, { id: LETTERS[q.items.length], texte: '', correct: false }] });
  };
  const removeItem = (i) => {
    if (q.items.length <= 2) return;
    set({ items: q.items.filter((_, k) => k !== i).map((it, k) => ({ ...it, id: LETTERS[k] })) });
  };

  const previewQuestions = useMemo(() => [{ id: editing.id, ...q }], [editing.id, q]);

  if (preview) {
    return (
      <div className="qa">
        {editing.aiContext ? (
          <div className="admin-report-banner qa-ai-banner">
            <div className="qa-ai-banner-top">
              <div>
                <strong>
                  ✨ Aperçu de la question générée par l’IA · {chapterFullLabel(editing.chapter)} (p. {q.source?.page || '—'})
                </strong>
                <p>
                  Testez la question ci-dessous telle que la verront les étudiants. Vous pouvez la <strong>soumettre directement</strong>, passer en <strong>mode édition</strong> pour la modifier, ou la <strong>supprimer</strong>.
                </p>
              </div>
              <div className="qa-ai-banner-actions">
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={onSave}
                  disabled={busy || aiBusy}
                >
                  {busy && !aiBusy ? 'Enregistrement…' : '✓ Soumettre et publier'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => setPreview(false)}
                  disabled={busy || aiBusy}
                >
                  ✎ Passer en mode édition
                </button>
                {onRegenerateAi && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={onRegenerateAi}
                    disabled={busy || aiBusy}
                  >
                    {aiBusy ? '✨ Génération…' : '↻ Régénérer une autre'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-small qa-danger"
                  onClick={onCancel}
                  disabled={busy || aiBusy}
                >
                  ✕ Supprimer
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="qa-bar">
            <span>Aperçu : voilà ce que verront les élèves (rien n’est enregistré)</span>
            <div className="qa-ai-banner-actions">
              <button className="btn btn-ghost btn-small" onClick={() => setPreview(false)}>← Retour à l’édition</button>
              <button className="btn btn-ghost btn-small qa-danger" onClick={onCancel}>✕ Annuler / Fermer</button>
            </div>
          </div>
        )}
        {error && <p className="admin-error" role="alert">{error}</p>}
        <div className="qa-preview">
          <QuizPlayer
            key={`${editing.id}-${(q.enonce || '').slice(0, 24)}`}
            chapterKey={`preview-${editing.chapter}`}
            meta={CHAPTERS[editing.chapter].chapitre}
            questions={previewQuestions}
            preview
          />
        </div>
      </div>
    );
  }

  return (
    <div className="qa qa-editor">
      <div className="qa-bar">
        <span>{editing.isNew ? 'Nouvelle question' : `Question ${editing.id}`} · {chapterFullLabel(editing.chapter)}</span>
        <div className="qa-editor-review-controls">
          <label className="qa-editor-reviewer-select">
            <span>Relu par :</span>
            <select
              className="admin-input"
              value={q.reviewed_by || reviewerName || REVIEWERS[0]}
              onChange={(e) => {
                const val = e.target.value;
                setReviewerName?.(val);
                set({ reviewed_by: val, reviewed: true });
              }}
            >
              {REVIEWERS.map((rev) => (
                <option key={rev} value={rev}>
                  {rev}
                </option>
              ))}
            </select>
          </label>
          <label className={`qa-review-check ${q.reviewed ? 'on' : ''}`}>
            <input
              type="checkbox"
              checked={Boolean(q.reviewed)}
              onChange={(e) =>
                set({
                  reviewed: e.target.checked,
                  reviewed_by: e.target.checked
                    ? q.reviewed_by || reviewerName || REVIEWERS[0]
                    : q.reviewed_by,
                })
              }
            />
            <span>{q.reviewed ? `Relu par ${q.reviewed_by || reviewerName}` : 'Marquer comme relue'}</span>
          </label>
        </div>
      </div>
      {editing.reportContext?.reportMessage && (
        <div className="admin-report-banner">
          <strong>Retour de {editing.reportContext.reportAuthor || 'Anonyme'} :</strong>
          <p>« {editing.reportContext.reportMessage} »</p>
        </div>
      )}
      {editing.submissionContext && (
        <div className="admin-report-banner admin-submission-banner">
          <strong>
            ✦ Proposition de question de {editing.submissionContext.author || 'Anonyme'} · {chapterFullLabel(editing.chapter)}
          </strong>
          <p>
            Vous pouvez modifier cette question avant de l’enregistrer. L’enregistrement publiera la question dans le chapitre et attribuera{' '}
            <strong>+10 points de contribution</strong> à {editing.submissionContext.author || 'l’auteur'}.
          </p>
        </div>
      )}
      {editing.aiContext && (
        <div className="admin-report-banner qa-ai-banner">
          <div className="qa-ai-banner-top">
            <div>
              <strong>
                ✨ Question générée par l’IA à partir du livre · {chapterFullLabel(editing.chapter)} (p. {q.source?.page || '—'})
              </strong>
              <p>
                Rédigée à partir du chapitre officiel sans répéter les questions existantes. Vous pouvez relire ou modifier les champs ci-dessous, puis <strong>soumettre</strong> la question pour l’ajouter au chapitre ou la <strong>supprimer</strong>.
              </p>
            </div>
            <div className="qa-ai-banner-actions">
              <button
                type="button"
                className="btn btn-small"
                onClick={onSave}
                disabled={busy || aiBusy}
              >
                {busy && !aiBusy ? 'Enregistrement…' : '✓ Soumettre et publier'}
              </button>
              {onRegenerateAi && (
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={onRegenerateAi}
                  disabled={busy || aiBusy}
                >
                  {aiBusy ? '✨ Génération…' : '↻ Régénérer une autre'}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-small qa-danger"
                onClick={onCancel}
                disabled={busy || aiBusy}
              >
                ✕ Supprimer ce brouillon
              </button>
            </div>
          </div>
        </div>
      )}
      {error && <p className="admin-error" role="alert">{error}</p>}

      <div className="qa-grid">
        <label>Type
          <select className="admin-input" value={q.type} onChange={(e) => changeType(e.target.value)}>
            <option value="QCU">QCU (une seule bonne réponse)</option>
            <option value="QRM">QRM (plusieurs bonnes réponses)</option>
          </select>
        </label>
        <label>Niveau de difficulté
          <div className="qa-diff-picker" role="group" aria-label="Niveau de difficulté">
            {[1, 2, 3].map((lvl) => {
              const currentDiff = resolveDifficulty(editing.id, q.difficulty);
              return (
                <button
                  key={lvl}
                  type="button"
                  className={`qa-diff-btn qa-diff-${lvl} ${currentDiff === lvl ? 'on' : ''}`}
                  onClick={() => set({ difficulty: lvl })}
                >
                  Niveau {lvl}
                </button>
              );
            })}
          </div>
        </label>
        <label>Sous-thème
          <input className="admin-input" value={q.theme} maxLength={80} onChange={(e) => set({ theme: e.target.value })} />
        </label>
      </div>

      <fieldset className="qa-items">
        <legend>Image avant la question (question d’iconographie)</legend>
        {q.enonce_image ? (
          <div className="qa-fig">
            <img src={imageSrc(editing.chapter, q.enonce_image)} alt="" />
            <div className="qa-fig-body">
              <label>Description de l’image (lue par les lecteurs d’écran, ne donnez pas la réponse)
                <input className="admin-input" value={q.enonce_image.alt || ''} maxLength={300}
                  onChange={(e) => set({ enonce_image: { ...q.enonce_image, alt: e.target.value } })} />
              </label>
              <div className="qa-fig-actions">
                <ImagePicker
                  password={password}
                  label="Remplacer l’image"
                  compact
                  disabled={busy}
                  onPicked={(picked) =>
                    setEditing((e) => ({
                      ...e,
                      q: { ...e.q, enonce_image: { ...picked, alt: e.q.enonce_image?.alt || '' } },
                    }))
                  }
                />
                <button className="link-btn" onClick={() => set({ enonce_image: null })}>Retirer l’image</button>
              </div>
            </div>
          </div>
        ) : (
          <ImagePicker
            password={password}
            label="+ Ajouter une image avant la question"
            disabled={busy}
            onPicked={(picked) =>
              setEditing((e) => ({
                ...e,
                q: { ...e.q, enonce_image: { ...picked, alt: '' } },
              }))
            }
          />
        )}
      </fieldset>

      <label className="qa-field">Énoncé
        <textarea
          className="admin-input"
          rows={Math.max(3, Math.ceil((q.enonce || '').length / 80))}
          value={q.enonce}
          maxLength={1500}
          onChange={(e) => set({ enonce: e.target.value })}
        />
      </label>

      <fieldset className="qa-items">
        <legend>Réponses — cochez {q.type === 'QCU' ? 'la bonne réponse' : 'les bonnes réponses'}</legend>
        {q.items.map((it, i) => (
          <div key={it.id} className="qa-item">
            <input
              type={q.type === 'QCU' ? 'radio' : 'checkbox'}
              name="correct"
              checked={it.correct}
              onChange={() => toggleCorrect(i)}
              aria-label={`Réponse ${it.id} correcte`}
            />
            <b>{it.id}</b>
            <textarea
              className="admin-input qa-item-textarea"
              rows={Math.max(2, Math.ceil((it.texte || '').length / 75))}
              value={it.texte}
              maxLength={400}
              onChange={(e) => setItem(i, { texte: e.target.value })}
            />
            <button className="link-btn" onClick={() => removeItem(i)} disabled={q.items.length <= 2} aria-label={`Retirer la réponse ${it.id}`}>Retirer</button>
          </div>
        ))}
        <button className="btn btn-ghost btn-small" onClick={addItem} disabled={q.items.length >= 6}>+ Ajouter une réponse</button>
      </fieldset>

      <label className="qa-field">Explication (affichée dans la correction)
        <textarea className="admin-input" rows={9} value={q.explication} maxLength={6000} onChange={(e) => set({ explication: e.target.value })} />
      </label>

      <fieldset className="qa-items">
        <legend>Figures de la correction</legend>
        {q.correction_figures.length === 0 && <p className="admin-empty">Aucune figure.</p>}
        {q.correction_figures.map((f, i) => (
          <div key={(f.upload || f.file || 'fig') + i} className="qa-fig">
            <img src={imageSrc(editing.chapter, f)} alt="" loading="lazy" />
            <div className="qa-fig-body">
              <small>{f.upload || f.dataUrl ? 'Image envoyée' : f.file}</small>
              <textarea className="admin-input" rows={3} value={f.caption} maxLength={1200} onChange={(e) => setFigure(i, { caption: e.target.value })} />
              <div className="qa-fig-actions">
                <ImagePicker
                  password={password}
                  label="Remplacer l’image"
                  compact
                  disabled={busy}
                  onPicked={(picked) =>
                    setFigure(i, {
                      upload: picked.upload,
                      dataUrl: picked.dataUrl,
                      file: undefined,
                    })
                  }
                />
                <button className="link-btn" onClick={() => moveFigure(i, -1)} disabled={i === 0}>↑ Monter</button>
                <button className="link-btn" onClick={() => moveFigure(i, 1)} disabled={i === q.correction_figures.length - 1}>↓ Descendre</button>
                <button className="link-btn" onClick={() => set({ correction_figures: q.correction_figures.filter((_, k) => k !== i) })}>Retirer</button>
              </div>
            </div>
          </div>
        ))}
        <ImagePicker
          password={password}
          label="+ Ajouter une image à la correction"
          multiple
          disabled={busy || q.correction_figures.length >= 6}
          onPicked={(picked) =>
            setEditing((e) => {
              const curFigs = e.q.correction_figures || [];
              if (curFigs.length >= 6) return e;
              return {
                ...e,
                q: { ...e.q, correction_figures: [...curFigs, { ...picked, caption: '' }] },
              };
            })
          }
        />
        <p className="privacy">Les captures d’écran (PNG/JPEG jusqu’à 1,45 Mo) sont conservées dans leur qualité originale sans perte. N’envoyez que des images que vous avez le droit de publier.</p>
      </fieldset>

      <fieldset className="qa-items">
        <legend>Référence (cartouche sous la correction)</legend>
        <div className="qa-grid">
          <label>Page du livre
            <input className="admin-input" type="number" min={1} max={9999} value={q.source.page}
              onChange={(e) => set({ source: { ...q.source, page: Number.parseInt(e.target.value, 10) || 0 } })} />
          </label>
          <label>Élément (Figure, Tableau, Encadré, Texte)
            <input className="admin-input" value={q.source.element} maxLength={80}
              onChange={(e) => set({ source: { ...q.source, element: e.target.value } })} />
          </label>
          <label>Références entre crochets
            <input className="admin-input" value={q.source.refs} maxLength={200} placeholder="[12, 45]"
              onChange={(e) => set({ source: { ...q.source, refs: e.target.value } })} />
          </label>
        </div>
      </fieldset>

      {error && <p className="admin-error" role="alert">{error}</p>}
      <div className="qa-actions">
        <button className="btn" onClick={onSave} disabled={busy || aiBusy}>
          {busy && !aiBusy
            ? 'Enregistrement…'
            : editing.submissionContext
            ? '✓ Enregistrer et publier (+10 pts)'
            : editing.aiContext
            ? '✓ Soumettre et enregistrer la question'
            : 'Enregistrer'}
        </button>
        {!q.reviewed && onSaveAndReview && (
          <button className="btn btn-ghost" onClick={onSaveAndReview} disabled={busy || aiBusy}>
            ✓ Enregistrer et valider la relecture
          </button>
        )}
        {onRegenerateAi && (
          <button className="btn btn-ghost" onClick={onRegenerateAi} disabled={busy || aiBusy}>
            {aiBusy ? '✨ Génération en cours…' : '↻ Régénérer une autre question'}
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => setPreview(true)} disabled={busy || aiBusy}>Aperçu</button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy || aiBusy}>
          {editing.aiContext ? '✕ Supprimer / Ignorer' : 'Annuler'}
        </button>
        {onDelete && <button className="btn btn-ghost qa-danger" onClick={onDelete} disabled={busy || aiBusy}>Supprimer</button>}
      </div>
    </div>
  );
}
