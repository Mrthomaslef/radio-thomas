import { useEffect, useMemo, useState } from 'react';
import { themes } from '../data/themes.js';
import { CHAPTERS, imageSrc, useQuestions } from '../data/useQuestions.js';
import { readName, saveName, subscribePlayer } from '../data/player.js';
import { submitQuestionProposal, validateProposedQuestion } from '../data/reports.js';
import { QuizPlayer } from './ChapterQuiz.jsx';
import Icon from './Icons.jsx';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const MAX_PROPOSAL_SIDE = 720;

// Reads a PNG/JPEG/WebP file, shrinks and compresses it into a compact JPEG dataUrl (< 42 KB).
function prepareProposedImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      reject(new Error('Format non pris en charge : utilisez une image PNG, JPEG ou WebP.'));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let maxSide = MAX_PROPOSAL_SIDE;
      let quality = 0.72;
      let dataUrl = '';

      for (let attempt = 0; attempt < 4; attempt++) {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= 24000) break;
        maxSide = Math.round(maxSide * 0.8);
        quality = Math.max(0.5, quality - 0.1);
      }

      if (dataUrl.length > 44000) {
        reject(new Error('Cette image est trop lourde. Essayez une image plus simple ou recadrée.'));
        return;
      }
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Impossible de lire cette image.'));
    };
    img.src = url;
  });
}

function ProposalImagePicker({ label, onPicked, disabled }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const onChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setErr('');
    try {
      const dataUrl = await prepareProposedImage(file);
      onPicked(dataUrl);
    } catch (ex) {
      setErr(ex.message || 'Impossible de charger cette image.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <span className="qa-pick">
      <label className={`btn btn-ghost btn-small${busy || disabled ? ' is-disabled' : ''}`}>
        {busy ? 'Préparation…' : label}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onChange}
          disabled={busy || disabled}
          hidden
        />
      </label>
      {err && <span className="admin-error" role="alert">{err}</span>}
    </span>
  );
}

const blankProposedQuestion = () => ({
  type: 'QCU',
  theme: '',
  enonce: '',
  enonce_image: null,
  items: LETTERS.slice(0, 4).map((id, i) => ({ id, texte: '', correct: i === 0 })),
  explication: '',
  correction_figures: [],
  source: { page: 1, element: 'Texte', refs: '' },
});

export default function ProposeQuestionPage() {
  const { byChapter } = useQuestions();
  const [pseudo, setPseudo] = useState(readName);
  const [draftPseudo, setDraftPseudo] = useState(pseudo);
  const [editingPseudo, setEditingPseudo] = useState(!pseudo);

  const [chapter, setChapter] = useState('');
  const [q, setQ] = useState(blankProposedQuestion);
  const [noPersonalData, setNoPersonalData] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    return subscribePlayer(() => {
      const curr = readName();
      setPseudo(curr);
      if (curr) setDraftPseudo(curr);
    });
  }, []);

  // Existing sub-themes in the selected chapter to help the user with autocomplete suggestions
  const existingSubthemes = useMemo(() => {
    if (!chapter || !byChapter?.[chapter]) return [];
    return [...new Set(byChapter[chapter].map((item) => item.theme).filter(Boolean))];
  }, [chapter, byChapter]);

  const setField = (patch) => setQ((prev) => ({ ...prev, ...patch }));

  const setItem = (idx, patch) =>
    setField({
      items: q.items.map((it, k) => (k === idx ? { ...it, ...patch } : it)),
    });

  const setFigure = (idx, patch) =>
    setField({
      correction_figures: q.correction_figures.map((f, k) => (k === idx ? { ...f, ...patch } : f)),
    });

  const moveFigure = (idx, dir) => {
    const next = [...q.correction_figures];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setField({ correction_figures: next });
  };

  const changeType = (type) => {
    let items = q.items;
    if (type === 'QCU') {
      const first = items.findIndex((it) => it.correct);
      items = items.map((it, k) => ({ ...it, correct: k === (first === -1 ? 0 : first) }));
    }
    setField({ type, items });
  };

  const toggleCorrect = (idx) => {
    if (q.type === 'QCU') {
      setField({ items: q.items.map((it, k) => ({ ...it, correct: k === idx })) });
    } else {
      setItem(idx, { correct: !q.items[idx].correct });
    }
  };

  const addItem = () => {
    if (q.items.length >= 6) return;
    setField({
      items: [...q.items, { id: LETTERS[q.items.length], texte: '', correct: false }],
    });
  };

  const removeItem = (idx) => {
    if (q.items.length <= 2) return;
    setField({
      items: q.items
        .filter((_, k) => k !== idx)
        .map((it, k) => ({ ...it, id: LETTERS[k] })),
    });
  };

  const handleSavePseudo = (e) => {
    e.preventDefault();
    const clean = draftPseudo.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    saveName(clean);
    setPseudo(clean);
    setEditingPseudo(false);
  };

  const handleOpenPreview = () => {
    setError('');
    if (!chapter) {
      setError('Veuillez d’abord choisir un chapitre pour afficher l’aperçu.');
      return;
    }
    const check = validateProposedQuestion(q, { noPersonalDataConfirmed: true });
    if (check.error) {
      setError(check.error);
      return;
    }
    setPreview(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const activePseudo = (pseudo || draftPseudo || '').trim().replace(/\s+/g, ' ');
    if (!activePseudo) {
      setError('Veuillez renseigner votre pseudo avant de soumettre la question.');
      return;
    }
    if (activePseudo !== pseudo) {
      saveName(activePseudo);
      setPseudo(activePseudo);
    }
    if (!chapter) {
      setError('Veuillez choisir le chapitre dans lequel vous souhaitez ajouter cette question.');
      return;
    }

    setBusy(true);
    try {
      await submitQuestionProposal({
        name: activePseudo,
        chapter,
        question: q,
        noPersonalDataConfirmed: noPersonalData,
      });
      setSubmitted(true);
      setPreview(false);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(err.message || 'Impossible d’envoyer la proposition, réessayez.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setQ(blankProposedQuestion());
    setNoPersonalData(false);
    setError('');
    setSubmitted(false);
    setPreview(false);
  };

  const selectedChapterMeta = chapter && CHAPTERS[chapter] ? CHAPTERS[chapter].chapitre : CHAPTERS.ch1.chapitre;
  const previewQuestions = useMemo(() => [{ id: 'apercu-proposition', ...q }], [q]);

  if (submitted) {
    return (
      <section className="prog propose-page">
        <header className="prog-head">
          <div className="cq-top-links">
            <a href="#/" className="cq-back">← Accueil</a>
            <a href="#/contributeurs" className="cq-back">Classement Contributeurs →</a>
          </div>
          <h1>
            <span className="grad">Merci</span> pour votre contribution !
          </h1>
        </header>
        <div className="cq-card propose-success-card">
          <div className="propose-success-badge">✦ Proposition envoyée à l’administrateur</div>
          <h2>Votre question est en attente de validation</h2>
          <p>
            L’administrateur a reçu une notification et va relire votre question pour le chapitre{' '}
            <strong>« {selectedChapterMeta.titre} »</strong>.
          </p>
          <p className="propose-pts-info">
            🏆 Dès que votre question sera validée par l’administrateur, <strong>{pseudo}</strong> recevra{' '}
            <strong>+10 points de contribution</strong> dans le classement Contributeurs !
          </p>
          <div className="qa-actions" style={{ justifyContent: 'center', marginTop: 20 }}>
            <button type="button" className="btn" onClick={handleReset}>
              + Proposer une autre question
            </button>
            <a href="#/contributeurs" className="btn btn-ghost">
              Voir le classement Contributeurs
            </a>
            <a href="#/" className="btn btn-ghost">
              Retour à l’accueil
            </a>
          </div>
        </div>
      </section>
    );
  }

  if (preview) {
    return (
      <section className="prog propose-page">
        <header className="prog-head">
          <div className="cq-top-links">
            <button type="button" className="link-btn cq-back" onClick={() => setPreview(false)}>
              ← Retour à l’édition de la question
            </button>
          </div>
          <h1>
            Aperçu de votre <span className="grad">Question</span>
          </h1>
          <p className="lb-rule">
            Voici comment votre question s’affichera dans le chapitre <strong>« {selectedChapterMeta.titre} »</strong>.
          </p>
        </header>
        <div className="qa-preview">
          <QuizPlayer
            chapterKey={`preview-prop-${chapter || 'ch1'}`}
            meta={selectedChapterMeta}
            questions={previewQuestions}
            preview
          />
        </div>
        <div className="qa-actions" style={{ marginTop: 20 }}>
          <button type="button" className="btn" onClick={() => setPreview(false)}>
            ← Retourner au formulaire pour soumettre
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="prog propose-page">
      <header className="prog-head">
        <div className="cq-top-links">
          <a href="#/" className="cq-back">← Accueil</a>
          <a href="#/contributeurs" className="cq-back">Classement Contributeurs →</a>
        </div>
        <h1>
          Proposer une <span className="grad">Question</span>
        </h1>
        <p className="lb-rule">
          Enrichissez le quiz en proposant une nouvelle question QCU ou QRM. Une fois votre question{' '}
          <strong>validée par l’administrateur</strong>, vous gagnez <strong>10 points de contribution</strong>&nbsp;!
        </p>

        {editingPseudo ? (
          <form className="home-panel name-step prog-name-form" onSubmit={handleSavePseudo}>
            <label htmlFor="prop-pseudo">Votre pseudo (pour recevoir vos 10 points après validation)</label>
            <input
              id="prop-pseudo"
              className="name-input"
              type="text"
              value={draftPseudo}
              onChange={(e) => setDraftPseudo(e.target.value)}
              placeholder="Votre pseudo"
              maxLength={80}
              autoComplete="nickname"
              autoFocus
              required
            />
            <button className="btn btn-small" type="submit" disabled={!draftPseudo.trim()}>
              Valider mon pseudo <Icon name="arrow" size={16} />
            </button>
          </form>
        ) : (
          <p className="home-hello">
            Contribution au nom de <strong>{pseudo}</strong> ·{' '}
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setDraftPseudo(pseudo);
                setEditingPseudo(true);
              }}
            >
              Changer de pseudo
            </button>
          </p>
        )}
      </header>

      <div className="propose-privacy-warning" role="note">
        <strong>⚠️ Secret médical & absence de données personnelles</strong>
        <p>
          Votre question ne doit contenir <strong>aucune information personnelle ou identifiante sur un patient</strong>{' '}
          (nom, prénom, initiales, date de naissance, numéro de dossier / IPP, nom d’établissement ou date précise d’examen).
          Les cas cliniques doivent rester strictement anonymes et génériques (ex.&nbsp;: <em>« Un patient de 45 ans consulte pour… »</em>).
        </p>
      </div>

      <form className="cq-card qa qa-editor propose-form" onSubmit={handleSubmit}>
        <div className="qa-bar">
          <span>Nouvelle proposition de question</span>
          <span className="propose-reward-pill">🏆 +10 pts après validation</span>
        </div>

        {error && (
          <p className="admin-error" role="alert">
            {error}
          </p>
        )}

        <label className="qa-field">
          Chapitre dans lequel ajouter la question *
          <select
            className="admin-input"
            value={chapter}
            onChange={(e) => setChapter(e.target.value)}
            required
          >
            <option value="">— Choisir un chapitre —</option>
            {themes.map((t) => (
              <optgroup key={t.id} label={t.title}>
                {t.chapters.map((c, idx) => (
                  <option key={c.id} value={c.id}>
                    Chapitre {c.id.replace('ch', '')} — {c.title} ({idx + 1}/{t.chapters.length})
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <div className="qa-grid">
          <label>
            Type de question *
            <select className="admin-input" value={q.type} onChange={(e) => changeType(e.target.value)}>
              <option value="QCU">QCU (une seule bonne réponse)</option>
              <option value="QRM">QRM (plusieurs bonnes réponses)</option>
            </select>
          </label>
          <label>
            Sous-thème *
            <input
              className="admin-input"
              list="propose-subthemes"
              value={q.theme}
              maxLength={80}
              placeholder="Ex. : Anatomie : coiffe des rotateurs"
              onChange={(e) => setField({ theme: e.target.value })}
              required
            />
            {existingSubthemes.length > 0 && (
              <datalist id="propose-subthemes">
                {existingSubthemes.map((st) => (
                  <option key={st} value={st} />
                ))}
              </datalist>
            )}
          </label>
        </div>

        <fieldset className="qa-items">
          <legend>Image avant la question (question d’iconographie, optionnel)</legend>
          {q.enonce_image ? (
            <div className="qa-fig">
              <img src={imageSrc(chapter || 'ch1', q.enonce_image)} alt="" />
              <div className="qa-fig-body">
                <label>
                  Description de l’image (optionnel, lue par les lecteurs d’écran — ne donnez pas la réponse)
                  <input
                    className="admin-input"
                    value={q.enonce_image.alt || ''}
                    maxLength={300}
                    placeholder="Ex. : Coupe échographique transversale de la face antérieure de l’épaule"
                    onChange={(e) =>
                      setField({ enonce_image: { ...q.enonce_image, alt: e.target.value } })
                    }
                  />
                </label>
                <div className="qa-fig-actions">
                  <ProposalImagePicker
                    label="Remplacer l’image"
                    disabled={busy}
                    onPicked={(dataUrl) =>
                      setField({ enonce_image: { dataUrl, alt: q.enonce_image.alt || '' } })
                    }
                  />
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => setField({ enonce_image: null })}
                  >
                    Retirer l’image
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <ProposalImagePicker
              label="+ Ajouter une image avant la question"
              disabled={busy}
              onPicked={(dataUrl) => setField({ enonce_image: { dataUrl, alt: '' } })}
            />
          )}
          <p className="privacy">
            Recadrez ou masquez impérativement tout nom, date de naissance ou identifiant patient visible sur le cliché.
          </p>
        </fieldset>

        <label className="qa-field">
          Énoncé de la question *
          <textarea
            className="admin-input"
            rows={4}
            value={q.enonce}
            maxLength={1500}
            placeholder="Rédigez l’énoncé de la question (sans aucune donnée personnelle de patient)…"
            onChange={(e) => setField({ enonce: e.target.value })}
            required
          />
        </label>

        <fieldset className="qa-items">
          <legend>
            Réponses — cochez {q.type === 'QCU' ? 'la bonne réponse' : 'les bonnes réponses'} *
          </legend>
          {q.items.map((it, i) => (
            <div key={it.id} className="qa-item">
              <input
                type={q.type === 'QCU' ? 'radio' : 'checkbox'}
                name="propose-correct"
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
                placeholder={`Proposition ${it.id}…`}
                onChange={(e) => setItem(i, { texte: e.target.value })}
                required
              />
              <button
                type="button"
                className="link-btn"
                onClick={() => removeItem(i)}
                disabled={q.items.length <= 2}
                aria-label={`Retirer la réponse ${it.id}`}
              >
                Retirer
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={addItem}
            disabled={q.items.length >= 6}
          >
            + Ajouter une réponse
          </button>
        </fieldset>

        <label className="qa-field">
          Explication détaillée (affichée dans la correction) *
          <textarea
            className="admin-input"
            rows={6}
            value={q.explication}
            maxLength={6000}
            placeholder="Expliquez pourquoi la ou les réponses cochées sont exactes et pourquoi les autres sont fausses…"
            onChange={(e) => setField({ explication: e.target.value })}
            required
          />
        </label>

        <fieldset className="qa-items">
          <legend>Figures de la correction (optionnel)</legend>
          {q.correction_figures.length === 0 && <p className="admin-empty">Aucune figure de correction ajoutée.</p>}
          {q.correction_figures.map((f, i) => (
            <div key={(f.upload || f.file || 'fig') + i} className="qa-fig">
              <img src={imageSrc(chapter || 'ch1', f)} alt="" loading="lazy" />
              <div className="qa-fig-body">
                <small>Figure {i + 1} de la correction — Légende obligatoire *</small>
                <textarea
                  className="admin-input"
                  rows={3}
                  value={f.caption}
                  maxLength={1200}
                  placeholder="Légende explicative affichée sous l’image lors de la correction…"
                  onChange={(e) => setFigure(i, { caption: e.target.value })}
                  required
                />
                <div className="qa-fig-actions">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => moveFigure(i, -1)}
                    disabled={i === 0}
                  >
                    ↑ Monter
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => moveFigure(i, 1)}
                    disabled={i === q.correction_figures.length - 1}
                  >
                    ↓ Descendre
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() =>
                      setField({
                        correction_figures: q.correction_figures.filter((_, k) => k !== i),
                      })
                    }
                  >
                    Retirer
                  </button>
                </div>
              </div>
            </div>
          ))}
          <ProposalImagePicker
            label="+ Ajouter une image à la correction"
            disabled={busy || q.correction_figures.length >= 4}
            onPicked={(dataUrl) =>
              setField({
                correction_figures: [...q.correction_figures, { dataUrl, caption: '' }],
              })
            }
          />
          <p className="privacy">
            Les images sont réduites et compressées automatiquement. Vérifiez qu’aucune donnée nominative de patient n’y figure et que vous disposez des droits de publication.
          </p>
        </fieldset>

        <fieldset className="qa-items">
          <legend>Référence du livre (optionnel)</legend>
          <div className="qa-grid">
            <label>
              Page du livre
              <input
                className="admin-input"
                type="number"
                min={1}
                max={9999}
                value={q.source.page}
                onChange={(e) =>
                  setField({
                    source: { ...q.source, page: Number.parseInt(e.target.value, 10) || 1 },
                  })
                }
              />
            </label>
            <label>
              Élément (Texte, Encadré, Tableau, Figure)
              <input
                className="admin-input"
                value={q.source.element}
                maxLength={80}
                placeholder="Texte"
                onChange={(e) => setField({ source: { ...q.source, element: e.target.value } })}
              />
            </label>
            <label>
              Références entre crochets
              <input
                className="admin-input"
                value={q.source.refs}
                maxLength={200}
                placeholder="[12, 45]"
                onChange={(e) => setField({ source: { ...q.source, refs: e.target.value } })}
              />
            </label>
          </div>
        </fieldset>

        <label className="propose-consent-check">
          <input
            type="checkbox"
            checked={noPersonalData}
            onChange={(e) => setNoPersonalData(e.target.checked)}
            required
          />
          <span>
            Je certifie que cette question est anonymisée et <strong>ne contient aucune information personnelle sur un patient</strong>.
          </span>
        </label>

        <div className="qa-actions">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Envoi en cours…' : 'Soumettre ma question (+10 pts après validation)'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleOpenPreview} disabled={busy}>
            Aperçu
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleReset} disabled={busy}>
            Réinitialiser
          </button>
        </div>
      </form>
    </section>
  );
}
