import { useCallback, useEffect, useMemo, useState } from 'react';
import { QuizPlayer } from './ChapterQuiz.jsx';
import { CHAPTERS, CHAPTER_KEYS, bundledQuestions, resetQuestionsCache, imageSrc } from '../data/useQuestions.js';

const MAX_SIDE = 1400; // images are shrunk before sending: lighter pages, and well under the size limit

// Reads a picture, shrinks it, and returns { mime, data (base64), compactDataUrl } ready to upload.
function prepareImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      reject(new Error('Format non pris en charge : utilisez une image PNG, JPEG ou WebP.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // transparent areas become white (JPEG has no transparency)
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      // Also build a compact dataUrl (< 42 KB) as a fallback if quiz_images table is not migrated
      const compactScale = Math.min(1, 720 / Math.max(img.width, img.height));
      const c2 = document.createElement('canvas');
      c2.width = Math.max(1, Math.round(img.width * compactScale));
      c2.height = Math.max(1, Math.round(img.height * compactScale));
      const ctx2 = c2.getContext('2d');
      ctx2.fillStyle = '#fff';
      ctx2.fillRect(0, 0, c2.width, c2.height);
      ctx2.drawImage(img, 0, 0, c2.width, c2.height);
      const compactDataUrl = c2.toDataURL('image/jpeg', 0.68);

      resolve({
        mime: 'image/jpeg',
        data: dataUrl.slice(dataUrl.indexOf(',') + 1),
        compactDataUrl,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de lire cette image.'));
    };
    img.src = url;
  });
}

// Picks a file, uploads it, and hands back { upload } or { dataUrl } (plus a text field handled by the caller).
function ImagePicker({ password, label, onPicked, disabled }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const onChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allows picking the same file again
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const { mime, data, compactDataUrl } = await prepareImage(file);
      try {
        const out = await call(password, { action: 'upload', mime, data });
        onPicked({ upload: out.id });
      } catch {
        // Fallback to inline compactDataUrl if the quiz_images migration hasn't been applied yet
        if (compactDataUrl && compactDataUrl.length <= 44000) {
          onPicked({ dataUrl: compactDataUrl });
        } else {
          throw new Error('Impossible d’enregistrer cette image.');
        }
      }
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="qa-pick">
      <label className={`btn btn-ghost btn-small${busy || disabled ? ' is-disabled' : ''}`}>
        {busy ? 'Envoi…' : label}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onChange} disabled={busy || disabled} hidden />
      </label>
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
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

async function call(password, payload) {
  const r = await fetch('/api/admin-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, ...payload }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erreur inattendue, réessayez.');
  return data;
}

const REVIEW_STORAGE_KEY = 'radio-thomas:reviewed-questions';

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

const blankQuestion = () => ({
  type: 'QCU',
  theme: '',
  enonce: '',
  enonce_image: null,
  items: LETTERS.slice(0, 4).map((id, i) => ({ id, texte: '', correct: i === 0 })),
  explication: '',
  correction_figures: [],
  source: { page: 1, element: 'Texte', refs: '' },
  reviewed: false,
});

export const newId = (chapter, rows) => {
  const used = new Set(rows.map((r) => r.id));
  for (let n = 1; n < 1000; n++) {
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
}) {
  const [rows, setRows] = useState(null);
  const [localReviewed, setLocalReviewed] = useState(readLocalReviewed);
  const [reviewFilter, setReviewFilter] = useState('all'); // all | todo | done
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [chapter, setChapter] = useState('ch1');
  const [editing, setEditing] = useState(null); // { id, chapter, position, q, isNew, reportContext }
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      let data = await call(password, { action: 'list' });
      if (data.questions.length > 0) {
        const known = new Set(data.questions.map((r) => r.id));
        const missing = bundledQuestions.filter((b) => !known.has(b.id));
        if (missing.length > 0) {
          await call(password, { action: 'import', items: missing });
          resetQuestionsCache();
          data = await call(password, { action: 'list' });
        }
      }
      // Merge with bundledQuestions if DB is still empty so all bundled questions are visible
      const dbList = data.questions || [];
      const seen = new Set(dbList.map((r) => r.id));
      const merged = [...dbList, ...bundledQuestions.filter((b) => !seen.has(b.id))];
      setRows(merged);
    } catch (e) {
      setError(e.message);
      setRows(bundledQuestions);
    }
  }, [password]);

  useEffect(() => { load(); }, [load]);

  const isRowReviewed = useCallback(
    (row) => {
      if (!row) return false;
      if (localReviewed[row.id] !== undefined) return Boolean(localReviewed[row.id]);
      return Boolean(row.data?.reviewed);
    },
    [localReviewed]
  );

  const toggleReviewed = async (row, nextVal = !isRowReviewed(row)) => {
    const updatedMap = { ...localReviewed, [row.id]: nextVal };
    setLocalReviewed(updatedMap);
    writeLocalReviewed(updatedMap);
    setRows((prev) =>
      (prev || []).map((r) => (r.id === row.id ? { ...r, data: { ...r.data, reviewed: nextVal } } : r))
    );
    try {
      await call(password, {
        action: 'save',
        id: row.id,
        chapter: row.chapter,
        position: row.position,
        question: { ...row.data, reviewed: nextVal },
      });
      resetQuestionsCache();
    } catch {
      // Kept in localStorage even if offline or before backend deploy
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
        q: { ...structuredClone(found.data), reviewed: isRowReviewed(found) },
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
      const out = await call(password, { action: 'import', items: bundledQuestions });
      resetQuestionsCache();
      setNotice(`${out.imported} question(s) importée(s).`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const edit = (row) =>
    setEditing({
      id: row.id,
      chapter: row.chapter,
      position: row.position,
      q: { ...structuredClone(row.data), reviewed: isRowReviewed(row) },
      isNew: false,
    });
  const create = () => {
    const position = live.length ? Math.max(...live.map((r) => r.position)) + 1 : 0;
    setEditing({ id: newId(chapter, rows || []), chapter, position, q: blankQuestion(), isNew: true });
  };

  const save = async (forceReviewed = null) => {
    setBusy(true); setError(''); setNotice('');
    const nextReviewed = forceReviewed !== null ? forceReviewed : Boolean(editing.q.reviewed);
    const nextQ = { ...editing.q, reviewed: nextReviewed };
    const allRows = rows || bundledQuestions;
    const finalId =
      editing.isNew && allRows.some((r) => r.id === editing.id)
        ? newId(editing.chapter, allRows)
        : editing.id;
    const updatedMap = { ...localReviewed, [finalId]: nextReviewed };
    setLocalReviewed(updatedMap);
    writeLocalReviewed(updatedMap);
    try {
      await call(password, { action: 'save', id: finalId, chapter: editing.chapter, position: editing.position, question: nextQ });
      if (editing.reportContext && onResolveReport) {
        await onResolveReport(editing.reportContext);
      }
      if (editing.submissionContext && onResolveSubmission) {
        await onResolveSubmission(editing.submissionContext, 'accepted');
      }
      resetQuestionsCache();
      setNotice(
        editing.submissionContext
          ? `Question publiée et proposition de ${editing.submissionContext.author || 'l’utilisateur'} validée (+10 pts) !`
          : 'Question enregistrée. Elle apparaît sur le site d’ici une trentaine de secondes.'
      );
      setEditing(null); setPreview(false);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const remove = async (row) => {
    if (!window.confirm('Supprimer cette question du quiz ? (Elle reste récupérable depuis la liste « Supprimées ».)')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await call(password, { action: 'delete', id: row.id });
      resetQuestionsCache();
      setNotice('Question supprimée.');
      setEditing(null);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const restore = async (row) => {
    setBusy(true); setError(''); setNotice('');
    try {
      await call(password, { action: 'save', id: row.id, chapter: row.chapter, position: row.position, question: row.data });
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
        error={error}
        onSave={() => save( null )}
        onSaveAndReview={() => save(true)}
        onCancel={() => { setEditing(null); setPreview(false); setError(''); }}
        onDelete={editing.isNew ? null : () => remove(editing)}
        preview={preview}
        setPreview={setPreview}
        password={password}
      />
    );
  }

  return (
    <div className="qa">
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="qa-notice" role="status">{notice}</p>}

      <div className="qa-review-summary">
        <div className="qa-review-head">
          <div>
            <strong>Suivi de relecture des questions</strong>
            <span>
              <b>{reviewedTotal}</b> / {allLive.length} questions relues et validées ({globalPct} %)
            </span>
          </div>
          <div className="qa-review-filters" role="group" aria-label="Filtrer par état de relecture">
            <button
              type="button"
              className={`qa-filter-pill ${reviewFilter === 'all' ? 'on' : ''}`}
              onClick={() => setReviewFilter('all')}
            >
              Toutes ({live.length})
            </button>
            <button
              type="button"
              className={`qa-filter-pill ${reviewFilter === 'todo' ? 'on' : ''}`}
              onClick={() => setReviewFilter('todo')}
            >
              À relire ({live.length - chapterReviewedCount})
            </button>
            <button
              type="button"
              className={`qa-filter-pill ${reviewFilter === 'done' ? 'on' : ''}`}
              onClick={() => setReviewFilter('done')}
            >
              Relues ({chapterReviewedCount})
            </button>
          </div>
        </div>
        <div className="cq-bar qa-review-bar">
          <div style={{ width: `${globalPct}%` }} />
        </div>
      </div>

      <div className="cq-chips" role="tablist" aria-label="Chapitres">
        {CHAPTER_KEYS.map((k) => {
          const st = chapterCounts[k] || { total: 0, reviewed: 0 };
          const allDone = st.total > 0 && st.reviewed === st.total;
          return (
            <button key={k} className={chapter === k ? 'on' : ''} onClick={() => setChapter(k)}>
              {CHAPTER_LABELS[k]}
              {st.total > 0 && (
                <span className={`qa-chip-count ${allDone ? 'is-done' : ''}`}>
                  {allDone ? `✓ ${st.reviewed}/${st.total}` : `${st.reviewed}/${st.total}`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="qa-bar">
        <span>
          {live.length} question(s) dans « {CHAPTER_LABELS[chapter]} » · <b>{chapterReviewedCount}</b> relue(s) sur {live.length}
        </span>
        <button className="btn btn-small" onClick={create}>+ Nouvelle question</button>
      </div>

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
            return (
              <li key={r.id} className={`qa-list-item ${checked ? 'is-reviewed' : ''}`}>
                <label className={`qa-review-check ${checked ? 'on' : ''}`} title="Marquer comme relue et validée">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => toggleReviewed(r, e.target.checked)}
                  />
                  <span>{checked ? '✓ Relue' : 'À relire'}</span>
                </label>
                <button className="qa-row" onClick={() => edit(r)}>
                  <b>{idxInChapter + 1}</b>
                  <span className="qa-text">{r.data.enonce}</span>
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

function Editor({ editing, setEditing, busy, error, onSave, onSaveAndReview, onCancel, onDelete, preview, setPreview, password }) {
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
        <div className="qa-bar">
          <span>Aperçu : voilà ce que verront les élèves (rien n’est enregistré)</span>
          <button className="btn btn-ghost btn-small" onClick={() => setPreview(false)}>← Retour à l’édition</button>
        </div>
        <div className="qa-preview">
          <QuizPlayer chapterKey={`preview-${editing.chapter}`} meta={CHAPTERS[editing.chapter].chapitre} questions={previewQuestions} preview />
        </div>
      </div>
    );
  }

  return (
    <div className="qa qa-editor">
      <div className="qa-bar">
        <span>{editing.isNew ? 'Nouvelle question' : `Question ${editing.id}`} · {CHAPTER_LABELS[editing.chapter]}</span>
        <label className={`qa-review-check ${q.reviewed ? 'on' : ''}`}>
          <input
            type="checkbox"
            checked={Boolean(q.reviewed)}
            onChange={(e) => set({ reviewed: e.target.checked })}
          />
          <span>{q.reviewed ? '✓ Question relue et validée' : 'Marquer comme relue et validée'}</span>
        </label>
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
            ✦ Proposition de question de {editing.submissionContext.author || 'Anonyme'} · {CHAPTER_LABELS[editing.chapter]}
          </strong>
          <p>
            Vous pouvez modifier cette question avant de l’enregistrer. L’enregistrement publiera la question dans le chapitre et attribuera{' '}
            <strong>+10 points de contribution</strong> à {editing.submissionContext.author || 'l’auteur'}.
          </p>
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
                <ImagePicker password={password} label="Remplacer l’image" disabled={busy}
                  onPicked={(picked) => set({ enonce_image: { ...picked, alt: q.enonce_image.alt || '' } })} />
                <button className="link-btn" onClick={() => set({ enonce_image: null })}>Retirer l’image</button>
              </div>
            </div>
          </div>
        ) : (
          <ImagePicker password={password} label="+ Ajouter une image avant la question" disabled={busy}
            onPicked={(picked) => set({ enonce_image: { ...picked, alt: '' } })} />
        )}
      </fieldset>

      <label className="qa-field">Énoncé
        <textarea className="admin-input" rows={3} value={q.enonce} maxLength={1500} onChange={(e) => set({ enonce: e.target.value })} />
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
            <input className="admin-input" value={it.texte} maxLength={400} onChange={(e) => setItem(i, { texte: e.target.value })} />
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
                <button className="link-btn" onClick={() => moveFigure(i, -1)} disabled={i === 0}>↑ Monter</button>
                <button className="link-btn" onClick={() => moveFigure(i, 1)} disabled={i === q.correction_figures.length - 1}>↓ Descendre</button>
                <button className="link-btn" onClick={() => set({ correction_figures: q.correction_figures.filter((_, k) => k !== i) })}>Retirer</button>
              </div>
            </div>
          </div>
        ))}
        <ImagePicker password={password} label="+ Ajouter une image à la correction" disabled={busy || q.correction_figures.length >= 6}
          onPicked={(picked) => set({ correction_figures: [...q.correction_figures, { ...picked, caption: '' }] })} />
        <p className="privacy">Les images sont réduites automatiquement (1 400 px maximum) avant l’envoi. N’envoyez que des images que vous avez le droit de publier.</p>
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

      <div className="qa-actions">
        <button className="btn" onClick={onSave} disabled={busy}>
          {busy
            ? 'Enregistrement…'
            : editing.submissionContext
            ? '✓ Enregistrer et publier (+10 pts)'
            : 'Enregistrer'}
        </button>
        {!q.reviewed && onSaveAndReview && (
          <button className="btn btn-ghost" onClick={onSaveAndReview} disabled={busy}>
            ✓ Enregistrer et valider la relecture
          </button>
        )}
        <button className="btn btn-ghost" onClick={() => setPreview(true)}>Aperçu</button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        {onDelete && <button className="btn btn-ghost qa-danger" onClick={onDelete} disabled={busy}>Supprimer</button>}
      </div>
    </div>
  );
}
