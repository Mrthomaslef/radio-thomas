import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icons.jsx';
import { readName } from '../data/player.js';
import { useQuestions, imageSrc } from '../data/useQuestions.js';

// ---------- helpers ----------
const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const seeded = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// Items are mixed, but always in the same order for a given question (stable across reloads).
const mixItems = (q) => {
  const items = [...q.items];
  const rnd = seeded(hash(q.id));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
};
const isPerfect = (q, picked) => {
  const good = q.items.filter((i) => i.correct).map((i) => i.id).sort().join();
  return good === [...picked].sort().join();
};
// (figure URLs: see imageSrc in data/useQuestions.js)

const store = (key) => ({
  read: () => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } },
  write: (v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(key); } catch { /* ignore */ } },
});

// Loads the live questions (editable from the admin page), then plays them.
export default function ChapterQuiz({ chapter }) {
  const { key, data } = chapter;
  const { byChapter, loading } = useQuestions();
  const questions = byChapter[key] || [];

  if (loading) {
    return <div className="cq"><p className="cq-loading" role="status">Chargement des questions…</p></div>;
  }
  if (questions.length === 0) {
    return (
      <div className="cq">
        <a href="#/epaule" className="cq-back">← Chapitres</a>
        <p className="cq-loading">Ce chapitre ne contient plus de questions pour le moment.</p>
      </div>
    );
  }
  return <QuizPlayer chapterKey={key} meta={data.chapitre} questions={questions} />;
}

// `preview` (admin): no saved progress and no result sent to the database.
export function QuizPlayer({ chapterKey: key, meta, questions: rawQuestions, preview = false }) {
  const storage = useMemo(() => store(`quiz-cotten:v1:${key}`), [key]);
  const saved = useMemo(() => (preview ? {} : storage.read()), [storage, preview]);

  const questions = useMemo(() => rawQuestions.map((q) => ({ ...q, shown: mixItems(q) })), [rawQuestions]);

  const [answers, setAnswers] = useState(saved.answers || {}); // qid -> picked item ids
  const [sent, setSent] = useState(Boolean(saved.sent));
  const [picked, setPicked] = useState([]);
  const [zoom, setZoom] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const topRef = useRef(null);

  const firstOpen = (l, a) => { const i = l.findIndex((q) => !a[q.id]); return i === -1 ? l.length : i; };
  const [idx, setIdx] = useState(() => firstOpen(questions, answers));

  useEffect(() => { if (!preview) storage.write({ answers, sent }); }, [storage, preview, answers, sent]);

  const q = questions[idx];
  const validated = q ? answers[q.id] : null;
  const finished = idx >= questions.length;

  const answeredAll = questions.filter((x) => answers[x.id]);
  const score = answeredAll.filter((x) => isPerfect(x, answers[x.id])).length;
  const total = questions.length;

  const goTo = (i) => {
    setIdx(i);
    setPicked([]);
  };

  const toggle = (id) => {
    if (validated) return;
    if (q.type === 'QCU') setPicked([id]);
    else setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const validate = () => {
    if (!picked.length) return;
    setAnswers((a) => ({ ...a, [q.id]: picked }));
  };

  const next = () => {
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
    } else {
      setIdx(firstOpen(questions, answers));
    }
    setPicked([]);
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  const restart = () => {
    if (!preview) storage.clear();
    setAnswers({}); setSent(false); setPicked([]); setIdx(0); setSaveState('idle');
  };

  // Send the result once, when every question of the chapter has been answered.
  const sendResult = async () => {
    if (preview) return;
    const name = readName();
    if (!name) return;
    setSaveState('saving');
    try {
      const r = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, course: 'epaule', quiz: key, score, total, passed: score / total >= 0.6 }),
      });
      if (!r.ok) throw new Error(String(r.status));
      setSent(true); setSaveState('saved');
    } catch { setSaveState('error'); }
  };
  useEffect(() => {
    if (answeredAll.length === total && !sent && saveState === 'idle') sendResult();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answeredAll.length]);

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => e.key === 'Escape' && setZoom(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoom]);

  const c = meta;
  const ref = (s) =>
    `Chapitre ${c.numero} (${c.titre}, ${c.auteurs}), Page ${s.page}, ${s.element}${s.refs ? ` ${s.refs}` : ''}`;

  const state = (item) => {
    if (!validated) return picked.includes(item.id) ? 'sel' : '';
    const on = validated.includes(item.id);
    if (on && item.correct) return 'ok';
    if (on && !item.correct) return 'ko';
    if (!on && item.correct) return q.type === 'QRM' ? 'miss' : 'miss-qcu';
    return 'dim';
  };
  const mark = { ok: '✓', ko: '✗', miss: '!', 'miss-qcu': '✓' };

  const dotStatus = (question) => {
    const a = answers[question.id];
    if (!a) return { cls: 'pending', label: 'non validée' };
    return isPerfect(question, a)
      ? { cls: 'ok', label: 'bonne réponse' }
      : { cls: 'ko', label: 'erreur' };
  };

  return (
    <div className="cq" ref={topRef}>
      <header className="cq-head">
        <a href="#/epaule" className="cq-back">← Chapitres</a>
        <h1>{c.titre}</h1>
        <div className="cq-stats" aria-live="polite">
          <span>Score <b>{score}</b> / {answeredAll.length || 0}</span>
          <span>{answeredAll.length} / {total} questions</span>
        </div>
        <div className="cq-bar"><div style={{ width: `${(answeredAll.length / total) * 100}%` }} /></div>
        <div className="cq-dots" role="navigation" aria-label="Progression des questions">
          {questions.map((item, i) => {
            const { cls, label } = dotStatus(item);
            const active = !finished && idx === i;
            return (
              <button
                key={item.id}
                type="button"
                className={`cq-dot ${cls}${active ? ' on' : ''}`}
                onClick={() => goTo(i)}
                aria-label={`Question ${i + 1} (${label})`}
                aria-current={active ? 'step' : undefined}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </header>

      {finished ? (
        <section className="cq-card cq-end">
          <h2>Quiz terminé !</h2>
          <p className="cq-big">{score} / {total}</p>
          <p>Une question compte juste seulement si toutes les bonnes réponses (et elles seules) sont cochées.</p>
          {answeredAll.length === total && (
            <p className={`cq-save cq-save-${saveState}`} role="status">
              {sent && '✓ Résultat enregistré'}
              {saveState === 'saving' && 'Enregistrement du résultat…'}
              {saveState === 'error' && <>Impossible d’enregistrer. <button className="link-btn" onClick={sendResult}>Réessayer</button></>}
            </p>
          )}
          <div className="cq-end-actions">
            <button className="btn btn-ghost" onClick={restart}>Recommencer</button>
            <a className="btn" href="#/epaule">Autres chapitres</a>
          </div>
        </section>
      ) : (
        <section className="cq-card" key={q.id}>
          <div className="cq-meta">
            <span>Question {idx + 1} / {questions.length}</span>
            <span className={`cq-type cq-${q.type}`}>{q.type === 'QCU' ? 'Une seule réponse' : 'Plusieurs réponses possibles'}</span>
          </div>
          {q.enonce_image && (
            <figure className="cq-fig cq-fig-top" onClick={() => setZoom({ src: imageSrc(key, q.enonce_image), caption: q.enonce_image.alt })}>
              <img src={imageSrc(key, q.enonce_image)} alt={q.enonce_image.alt || ''} />
            </figure>
          )}
          <h2 className="cq-q">{q.enonce}</h2>

          <div className="cq-items">
            {q.shown.map((it, i) => {
              const s = state(it);
              return (
                <button key={it.id} className={`cq-item ${s}`} onClick={() => toggle(it.id)} aria-pressed={picked.includes(it.id)} disabled={Boolean(validated)}>
                  <span className="cq-key">{String.fromCharCode(65 + i)}</span>
                  <span className="cq-text">{it.texte}</span>
                  {mark[s] && <span className="cq-mark" aria-hidden="true">{mark[s]}</span>}
                </button>
              );
            })}
          </div>

          {validated && (
            <div className="cq-correction">
              <p className="cq-legend">
                <span className="lg ok">✓ Bonne réponse cochée</span>
                <span className="lg ko">✗ Cochée à tort</span>
                {q.type === 'QRM' && <span className="lg miss">! Oubliée</span>}
              </p>
              <p className="cq-verdict">{isPerfect(q, validated) ? 'Exact.' : 'Pas tout à fait.'}</p>
              <p className="cq-expl">{q.explication}</p>
              {q.correction_figures?.map((f) => (
                <figure key={f.upload || f.file} className="cq-fig" onClick={() => setZoom({ src: imageSrc(key, f), caption: f.caption })}>
                  <img src={imageSrc(key, f)} alt={f.caption} loading="lazy" />
                  <figcaption>{f.caption}<span className="cq-zoom"> · toucher pour agrandir</span></figcaption>
                </figure>
              ))}
              <p className="cq-ref"><strong>Référence</strong>{ref(q.source)}</p>
            </div>
          )}
        </section>
      )}

      {!finished && (
        <div className="cq-bottom">
          {!validated ? (
            <button className="btn cq-main" onClick={validate} disabled={!picked.length}>Valider</button>
          ) : (
            <button className="btn cq-main" onClick={next}>
              {idx + 1 >= questions.length && answeredAll.length === total ? 'Voir le résultat' : 'Question suivante'} <Icon name="arrow" size={18} />
            </button>
          )}
        </div>
      )}

      {zoom && (
        <div className="cq-zoomed" onClick={() => setZoom(null)} role="dialog" aria-modal="true">
          <button className="cq-close" aria-label="Fermer">✕</button>
          <img src={zoom.src} alt={zoom.caption || ''} />
          {zoom.caption && <p>{zoom.caption}</p>}
        </div>
      )}
    </div>
  );
}
