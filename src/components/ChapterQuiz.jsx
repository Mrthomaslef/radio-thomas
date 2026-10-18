import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icons.jsx';
import { readName } from '../data/player.js';

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
const figUrl = (key, file) => encodeURI(`/figures/${key}/${file}`);

const store = (key) => ({
  read: () => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } },
  write: (v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(key); } catch { /* ignore */ } },
});

export default function ChapterQuiz({ chapter }) {
  const { key, data } = chapter;
  const storage = useMemo(() => store(`quiz-cotten:v1:${key}`), [key]);
  const saved = useMemo(() => storage.read(), [storage]);

  const questions = useMemo(() => data.questions.map((q) => ({ ...q, shown: mixItems(q) })), [data]);
  const themes = useMemo(() => [...new Set(questions.map((q) => q.theme))], [questions]);

  const [filter, setFilter] = useState(saved.filter && themes.includes(saved.filter) ? saved.filter : 'all');
  const [answers, setAnswers] = useState(saved.answers || {}); // qid -> picked item ids
  const [sent, setSent] = useState(Boolean(saved.sent));
  const [picked, setPicked] = useState([]);
  const [zoom, setZoom] = useState(null);
  const [saveState, setSaveState] = useState('idle');
  const topRef = useRef(null);

  const list = useMemo(() => (filter === 'all' ? questions : questions.filter((q) => q.theme === filter)), [questions, filter]);
  const firstOpen = (l, a) => { const i = l.findIndex((q) => !a[q.id]); return i === -1 ? l.length : i; };
  const [idx, setIdx] = useState(() => firstOpen(list, answers));

  useEffect(() => { storage.write({ filter, answers, sent }); }, [storage, filter, answers, sent]);

  const q = list[idx];
  const validated = q ? answers[q.id] : null;
  const finished = idx >= list.length;

  const answeredAll = questions.filter((x) => answers[x.id]);
  const score = answeredAll.filter((x) => isPerfect(x, answers[x.id])).length;
  const total = questions.length;
  const listDone = list.filter((x) => answers[x.id]).length;

  const changeFilter = (f) => {
    setFilter(f);
    const l = f === 'all' ? questions : questions.filter((x) => x.theme === f);
    setIdx(firstOpen(l, answers));
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
    setIdx((i) => i + 1);
    setPicked([]);
    topRef.current?.scrollIntoView({ block: 'start' });
  };

  const restart = () => {
    storage.clear();
    setAnswers({}); setSent(false); setPicked([]); setFilter('all'); setIdx(0); setSaveState('idle');
  };

  // Send the result once, when every question of the chapter has been answered.
  const sendResult = async () => {
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

  const c = data.chapitre;
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
        <div className="cq-chips" role="tablist" aria-label="Sous-thèmes">
          <button className={filter === 'all' ? 'on' : ''} onClick={() => changeFilter('all')}>Tous</button>
          {themes.map((t) => (
            <button key={t} className={filter === t ? 'on' : ''} onClick={() => changeFilter(t)}>{t}</button>
          ))}
        </div>
      </header>

      {finished ? (
        <section className="cq-card cq-end">
          <h2>{listDone === list.length && filter === 'all' ? 'Quiz terminé !' : 'Série terminée'}</h2>
          <p className="cq-big">{score} / {total}</p>
          <p>{answeredAll.length < total
            ? `Il reste ${total - answeredAll.length} question(s) dans les autres sous-thèmes.`
            : 'Une question compte juste seulement si toutes les bonnes réponses (et elles seules) sont cochées.'}</p>
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
            <span>Question {idx + 1} / {list.length}</span>
            <span className={`cq-type cq-${q.type}`}>{q.type === 'QCU' ? 'Une seule réponse' : 'Plusieurs réponses possibles'}</span>
          </div>
          <h2 className="cq-q">{q.enonce}</h2>
          {q.enonce_image && (
            <figure className="cq-fig" onClick={() => setZoom({ src: figUrl(key, q.enonce_image.file), caption: q.enonce_image.alt })}>
              <img src={figUrl(key, q.enonce_image.file)} alt={q.enonce_image.alt || ''} />
            </figure>
          )}

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
                <figure key={f.file} className="cq-fig" onClick={() => setZoom({ src: figUrl(key, f.file), caption: f.caption })}>
                  <img src={figUrl(key, f.file)} alt={f.caption} loading="lazy" />
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
              {idx + 1 >= list.length ? 'Voir le résultat' : 'Question suivante'} <Icon name="arrow" size={18} />
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
