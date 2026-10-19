import { useCallback, useEffect, useMemo, useState } from 'react';
import { QuizPlayer } from './ChapterQuiz.jsx';
import { CHAPTERS, CHAPTER_KEYS, bundledQuestions, resetQuestionsCache, imageSrc } from '../data/useQuestions.js';

const MAX_SIDE = 1400; // images are shrunk before sending: lighter pages, and well under the size limit

// Reads a picture, shrinks it, and returns { mime, data (base64) } ready to upload.
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
      resolve({ mime: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de lire cette image.'));
    };
    img.src = url;
  });
}

// Picks a file, uploads it, and hands back { upload } (plus a text field handled by the caller).
function ImagePicker({ password, label, onPicked, disabled }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const onChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allows picking the same file again
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const { mime, data } = await prepareImage(file);
      const out = await call(password, { action: 'upload', mime, data });
      onPicked(out.id);
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

const blankQuestion = () => ({
  type: 'QCU',
  theme: '',
  enonce: '',
  enonce_image: null,
  items: LETTERS.slice(0, 4).map((id, i) => ({ id, texte: '', correct: i === 0 })),
  explication: '',
  correction_figures: [],
  source: { page: 1, element: 'Texte', refs: '' },
});

const newId = (chapter, rows) => {
  const used = new Set(rows.map((r) => r.id));
  for (let n = rows.length + 1; n < 1000; n++) {
    const id = `${chapter.replace('ch', 'c')}-q${String(n).padStart(2, '0')}`;
    if (!used.has(id)) return id;
  }
  return `${chapter}-${Date.now()}`;
};

export default function QuestionsAdmin({ password, editTarget = null, onClearEditTarget = null, onResolveReport = null }) {
  const [rows, setRows] = useState(null);
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
      setRows(data.questions);
    } catch (e) {
      setError(e.message);
      setRows([]);
    }
  }, [password]);

  useEffect(() => { load(); }, [load]);

  // Open a specific question directly when arriving from a user report
  useEffect(() => {
    if (!editTarget?.questionId || rows === null) return;
    const found =
      rows.find((r) => r.id === editTarget.questionId) ||
      bundledQuestions.find((b) => b.id === editTarget.questionId);
    if (found) {
      setChapter(found.chapter);
      setEditing({
        id: found.id,
        chapter: found.chapter,
        position: found.position,
        q: structuredClone(found.data),
        isNew: false,
        reportContext: editTarget,
      });
    } else if (editTarget.chapter) {
      setChapter(editTarget.chapter);
    }
    onClearEditTarget?.();
  }, [editTarget, rows, onClearEditTarget]);

  const live = useMemo(
    () => (rows || []).filter((r) => !r.deleted_at && r.chapter === chapter).sort((a, b) => a.position - b.position),
    [rows, chapter]
  );
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

  const edit = (row) => setEditing({ id: row.id, chapter: row.chapter, position: row.position, q: structuredClone(row.data), isNew: false });
  const create = () => {
    const position = live.length ? Math.max(...live.map((r) => r.position)) + 1 : 0;
    setEditing({ id: newId(chapter, rows || []), chapter, position, q: blankQuestion(), isNew: true });
  };

  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await call(password, { action: 'save', id: editing.id, chapter: editing.chapter, position: editing.position, question: editing.q });
      if (editing.reportContext && onResolveReport) {
        await onResolveReport(editing.reportContext);
      }
      resetQuestionsCache();
      setNotice('Question enregistrée. Elle apparaît sur le site d’ici une trentaine de secondes.');
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

  if (rows === null) return <p className="admin-empty">Chargement…</p>;

  if (editing) {
    return (
      <Editor
        editing={editing}
        setEditing={setEditing}
        busy={busy}
        error={error}
        onSave={save}
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

      {rows.length === 0 && (
        <div className="qa-import">
          <p>La base ne contient encore aucune question. Importez les 40 questions du site pour pouvoir les modifier.</p>
          <button className="btn" onClick={importBundled} disabled={busy}>
            {busy ? 'Import…' : 'Importer les 40 questions'}
          </button>
        </div>
      )}

      <div className="cq-chips" role="tablist" aria-label="Chapitres">
        {CHAPTER_KEYS.map((k) => (
          <button key={k} className={chapter === k ? 'on' : ''} onClick={() => setChapter(k)}>
            {CHAPTER_LABELS[k]}
          </button>
        ))}
      </div>

      <div className="qa-bar">
        <span>{live.length} question(s) dans « {CHAPTER_LABELS[chapter]} »</span>
        <button className="btn btn-small" onClick={create}>+ Nouvelle question</button>
      </div>

      <ol className="qa-list">
        {live.map((r, i) => (
          <li key={r.id}>
            <button className="qa-row" onClick={() => edit(r)}>
              <b>{i + 1}</b>
              <span className="qa-text">{r.data.enonce}</span>
              <span className={`qa-type qa-${r.data.type}`}>{r.data.type}</span>
            </button>
          </li>
        ))}
      </ol>

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

function Editor({ editing, setEditing, busy, error, onSave, onCancel, onDelete, preview, setPreview, password }) {
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
      </div>
      {editing.reportContext?.reportMessage && (
        <div className="admin-report-banner">
          <strong>Retour de {editing.reportContext.reportAuthor || 'Anonyme'} :</strong>
          <p>« {editing.reportContext.reportMessage} »</p>
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
                  onPicked={(id) => set({ enonce_image: { upload: id, alt: q.enonce_image.alt || '' } })} />
                <button className="link-btn" onClick={() => set({ enonce_image: null })}>Retirer l’image</button>
              </div>
            </div>
          </div>
        ) : (
          <ImagePicker password={password} label="+ Ajouter une image avant la question" disabled={busy}
            onPicked={(id) => set({ enonce_image: { upload: id, alt: '' } })} />
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
          <div key={(f.upload || f.file) + i} className="qa-fig">
            <img src={imageSrc(editing.chapter, f)} alt="" loading="lazy" />
            <div className="qa-fig-body">
              <small>{f.upload ? 'Image envoyée depuis l’admin' : f.file}</small>
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
          onPicked={(id) => set({ correction_figures: [...q.correction_figures, { upload: id, caption: '' }] })} />
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
        <button className="btn" onClick={onSave} disabled={busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button className="btn btn-ghost" onClick={() => setPreview(true)}>Aperçu</button>
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Annuler</button>
        {onDelete && <button className="btn btn-ghost qa-danger" onClick={onDelete} disabled={busy}>Supprimer</button>}
      </div>
    </div>
  );
}
