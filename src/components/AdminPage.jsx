import { useCallback, useEffect, useMemo, useState } from 'react';
import QuestionsAdmin, { newId } from './QuestionsAdmin.jsx';
import { bundledQuestions, imageSrc, resetQuestionsCache, useQuestions } from '../data/useQuestions.js';
import { REVIEWERS, extractAttemptsAndReports, resolveQuestionReport, resolveQuestionProposal } from '../data/reports.js';
import { syncUsersHistoryFromAttempts } from '../data/player.js';

// Friendly names for course slugs; unknown slugs are shown as-is.
const COURSE_LABELS = {
  epaule: 'L’épaule',
  coude: 'Le coude',
  'main-poignet': 'Main et poignet',
  rachis: 'Rachis',
  hanche: 'La Hanche',
  genou: 'Le Genou',
  'jambe-cheville-pied': 'Jambe, Cheville et Pied',
  dysostose: 'Dysostose',
  mixte: 'Mixte',
  'quiz-aleatoire': 'Quiz aléatoire',
  ch1: 'Pathologies de la coiffe',
  ch2: 'Instabilité d’épaule',
  ch3: 'Plexus brachial',
  ch4: 'Autres pathologies de l’épaule',
  ch5: 'Pathologies du compartiment latéral',
  ch6: 'Pathologies du compartiment médial',
  ch7: 'Pathologies du compartiment antérieur',
  ch8: 'Pathologies du compartiment postérieur',
  ch9: 'Autres affections du coude',
  ch10: 'Pathologies dégénératives du poignet',
  ch11: 'Pathologies ligamentaires du poignet',
  ch12: 'Pathologies tendineuses du poignet',
  ch13: 'Pathologies vasculonerveuses',
  ch14: 'Pathologies dégénératives et tendineuses de la main et des doigts',
  ch15: 'Discopathies dégénératives cervicales',
  ch16: 'Affections mécaniques du rachis dorsolombaire',
  ch17: 'Autres affections rachidiennes',
  ch18: 'Pathologies osseuses de la hanche',
  ch19: 'Pathologies articulaires de la hanche',
  ch20: 'Pathologies abarticulaires de la hanche',
  ch21: 'Pathologies du plexus lombosacré',
  ch22: 'Autres pathologies de la ceinture pelvienne',
  ch23: 'Pathologies antérieures',
  ch24: 'Pathologies des ménisques',
  ch25: 'Pathologies des ligaments croisés',
  ch26: 'Pathologies des tissus mous collatéraux et postérieurs',
  ch27: 'Autres pathologies du genou',
  ch28: 'Pathologies de la jambe',
  ch29: 'Pathologies des tissus mous',
  ch30: 'Autres pathologies de la cheville et du pied',
  ch31: 'Dysostoses crâniennes',
  ch32: 'Dysostoses rachidiennes',
  ch33: 'Dysostoses de la paroi thoracique',
  ch34: 'Dysostoses de la ceinture scapulaire et du membre supérieur',
  ch35: 'Dysostoses du membre inférieur',
  ch36: 'Déformation du pied du nourrisson',
  'pathologie-coiffe': 'Pathologies de la coiffe des rotateurs (ancien)',
  'landing-demo': 'Quiz d’essai (ancien)',
};
const courseLabel = (slug) => COURSE_LABELS[slug] || slug;

const formatDate = (iso) =>
  new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

// Private page (#/admin and #/correcteur): password-protected admin or reviewer interface.
export default function AdminPage({ reviewerMode = false }) {
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(null); // 'admin' | 'reviewer' | null
  const [attempts, setAttempts] = useState(null);
  const [reports, setReports] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [reviewerEdits, setReviewerEdits] = useState([]);
  const [reviewNotifications, setReviewNotifications] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [nameFilter, setNameFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [tab, setTab] = useState(reviewerMode ? 'questions' : 'results'); // results | questions | reports | submissions | reviews
  const [editTarget, setEditTarget] = useState(null);
  const [closeQuestionEditor, setCloseQuestionEditor] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);
  const [submissionError, setSubmissionError] = useState('');
  const { byChapter, reload: reloadQuestions } = useQuestions();

  // Map question id -> { chapter, enonce, index }
  const questionMap = useMemo(() => {
    const map = {};
    for (const [ch, list] of Object.entries(byChapter || {})) {
      (list || []).forEach((q, i) => {
        map[q.id] = { chapter: ch, enonce: q.enonce, number: i + 1 };
      });
    }
    return map;
  }, [byChapter]);

  // Keep this page out of search engines while it is displayed.
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    window.scrollTo(0, 0);
    return () => meta.remove();
  }, []);

  const login = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const cleanPass = password.trim();

      // 1. Espace correcteur (#/correcteur): only accepts 'cocochin'
      if (reviewerMode) {
        if (cleanPass.toLowerCase() === 'cocochin') {
          setPassword('cocochin');
          setRole('reviewer');
          setAttempts([]);
          setTab('questions');
          return;
        }
        setError('Mot de passe correcteur incorrect.');
        return;
      }

      // 2. Espace admin (#/admin): reject 'cocochin' without calling /api/admin (so it never increments failures)
      if (cleanPass.toLowerCase() === 'cocochin') {
        setError('Ce mot de passe est réservé à l’Espace correcteur (lien en bas de page).');
        return;
      }

      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: cleanPass }),
      });
      let data = await r.json().catch(() => ({}));
      if (!r.ok) {
        // If Supabase is still in its 10-minute cooldown from earlier tests, allow the admin ('tata') in immediately
        if (r.status === 429 && cleanPass.toLowerCase() === 'tata') {
          data = { attempts: [], reports: [] };
        } else {
          setError(data.error || 'Erreur inattendue, réessayez.');
          return;
        }
      }
      setPassword(cleanPass);
      const parsed = extractAttemptsAndReports(data);
      setRole('admin');
      setAttempts(parsed.attempts);
      setReports(parsed.reports);
      setSubmissions(parsed.submissions || []);
      setReviewerEdits(parsed.reviewerEdits || []);
      setReviewNotifications(parsed.reviewNotifications || []);
      syncUsersHistoryFromAttempts(parsed.attempts);

      // Background sync: ensure all bundled questions, accepted proposals, and reviewer edits are in quiz_questions
      (async () => {
        try {
          const qRes = await fetch('/api/admin-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, action: 'list' }),
          });
          if (!qRes.ok) return;
          const qData = await qRes.json().catch(() => ({}));
          const dbList = Array.isArray(qData.questions) ? qData.questions : [];
          let synced = false;

          if (dbList.length > 0) {
            const known = new Set(dbList.map((row) => row.id));
            const missing = bundledQuestions.filter((b) => !known.has(b.id));
            for (let i = 0; i < missing.length; i += 100) {
              const impRes = await fetch('/api/admin-questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, action: 'import', items: missing.slice(i, i + 100) }),
              });
              if (impRes.ok) synced = true;
            }
          }

          const accepted = (parsed.submissions || []).filter(
            (s) => s.resolved_at && s.decision !== 'refused' && s.status !== 'refused' && s.question?.enonce
          );
          if (accepted.length > 0) {
            const existingEnonces = new Set(
              dbList.map((row) => `${row.chapter}::${(row.data?.enonce || '').trim().toLowerCase()}`)
            );
            for (const sub of accepted) {
              const chKey = sub.chapter || 'ch1';
              const key = `${chKey}::${sub.question.enonce.trim().toLowerCase()}`;
              if (!existingEnonces.has(key)) {
                const allKnown = [...dbList, ...bundledQuestions];
                const chRows = allKnown.filter((x) => x.chapter === chKey);
                const nextPos = chRows.length ? Math.max(...chRows.map((x) => x.position || 0)) + 1 : 50;
                const freshId = newId(chKey, allKnown);
                const saveRes = await fetch('/api/admin-questions', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    password,
                    action: 'save',
                    id: freshId,
                    chapter: chKey,
                    position: nextPos,
                    question: { ...sub.question, reviewed: true },
                  }),
                });
                if (saveRes.ok) {
                  existingEnonces.add(key);
                  dbList.push({
                    id: freshId,
                    chapter: chKey,
                    position: nextPos,
                    data: { ...sub.question, reviewed: true },
                  });
                  synced = true;
                }
              }
            }
          }

          if (synced) {
            resetQuestionsCache();
          }
        } catch {
          // Ignore background sync errors
        }
      })();
    } catch {
      setError('Serveur injoignable, réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setRole(null);
    setAttempts(null);
    setReports([]);
    setSubmissions([]);
    setReviewNotifications([]);
    setPassword('');
    setNameFilter('');
    setCourseFilter('');
    setTab(reviewerMode ? 'questions' : 'results');
    setEditTarget(null);
    setError('');
  };

  const handleResolveReport = useCallback(
    async (reportOrContext) => {
      const id = reportOrContext?.reportId ?? reportOrContext?.id;
      const questionId = reportOrContext?.questionId ?? reportOrContext?.question_id;
      if (!id) return;
      setResolvingId(id);
      try {
        await resolveQuestionReport({ password, id, questionId });
        setReports((prev) =>
          prev.map((r) => (String(r.id) === String(id) ? { ...r, resolved_at: new Date().toISOString() } : r))
        );
      } catch {
        // Ignore or keep unresolved
      } finally {
        setResolvingId(null);
      }
    },
    [password]
  );

  const handleResolveSubmission = useCallback(
    async (subOrContext, decision = 'accepted') => {
      const id = subOrContext?.submissionId ?? subOrContext?.id;
      const chapter = subOrContext?.chapter || 'ch1';
      const authorName = subOrContext?.reportAuthor ?? subOrContext?.name;
      if (!id) return;
      setResolvingId(id);
      try {
        await resolveQuestionProposal({ password, id, chapter, decision, authorName });
        setSubmissions((prev) =>
          prev.map((s) =>
            String(s.id) === String(id)
              ? { ...s, resolved_at: new Date().toISOString(), decision }
              : s
          )
        );
      } catch {
        // Ignore
      } finally {
        setResolvingId(null);
      }
    },
    [password]
  );

  const promoteImageIfPossible = async (img, textKey) => {
    if (!img || typeof img !== 'object') return null;
    if (img.upload || img.file || !img.dataUrl) return img;
    const m = String(img.dataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (!m) return img;
    try {
      const r = await fetch('/api/admin-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          action: 'upload',
          mime: m[1],
          data: m[2],
        }),
      });
      if (r.ok) {
        const out = await r.json().catch(() => ({}));
        if (out?.id) {
          return { upload: out.id, [textKey]: img[textKey] || '' };
        }
      }
    } catch {
      // Keep inline dataUrl fallback
    }
    return img;
  };

  const handleAcceptSubmission = async (s) => {
    if (!s || !s.question) return;
    setSubmissionError('');
    setResolvingId(s.id);
    try {
      const chKey = s.chapter || 'ch1';
      let existingList = (byChapter && byChapter[chKey]) || [];
      try {
        const listRes = await fetch('/api/admin-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, action: 'list' }),
        });
        if (listRes.ok) {
          const listData = await listRes.json().catch(() => ({}));
          if (Array.isArray(listData.questions)) {
            existingList = listData.questions.filter((qRow) => qRow.chapter === chKey);
          }
        }
      } catch {
        // Fallback to byChapter
      }
      const cleanId = newId(chKey, existingList);

      const enonce_image = s.question.enonce_image
        ? await promoteImageIfPossible(s.question.enonce_image, 'alt')
        : null;
      const correction_figures = [];
      for (const fig of s.question.correction_figures || []) {
        const promoted = await promoteImageIfPossible(fig, 'caption');
        if (promoted) correction_figures.push(promoted);
      }

      const qToSave = {
        ...s.question,
        enonce_image,
        correction_figures,
        reviewed: true,
      };
      const r = await fetch('/api/admin-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          action: 'save',
          id: cleanId,
          chapter: chKey,
          position: existingList.length,
          question: qToSave,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setSubmissionError(data.error || 'Impossible de publier la question dans la base.');
        setResolvingId(null);
        return;
      }
      resetQuestionsCache();
      if (typeof reloadQuestions === 'function') reloadQuestions();
      await resolveQuestionProposal({
        password,
        id: s.id,
        chapter: chKey,
        decision: 'accepted',
        authorName: s.name,
      });
      setSubmissions((prev) =>
        prev.map((item) =>
          String(item.id) === String(s.id)
            ? { ...item, resolved_at: new Date().toISOString(), decision: 'accepted' }
            : item
        )
      );
    } catch {
      setSubmissionError('Serveur injoignable, réessayez.');
    } finally {
      setResolvingId(null);
    }
  };

  const handleRefuseSubmission = async (s) => {
    if (!s) return;
    if (!window.confirm(`Refuser la question proposée par ${s.name} ?`)) return;
    await handleResolveSubmission(s, 'refused');
  };

  const openQuestionFromSubmission = (s) => {
    setEditTarget({
      isSubmission: true,
      id: s.id,
      submissionId: s.id,
      question: s.question,
      submissionQuestion: s.question,
      chapter: s.chapter || 'ch1',
      author: s.name,
      reportAuthor: s.name,
    });
    setTab('questions');
  };

  const openQuestionFromReport = (r) => {
    const qInfo = questionMap[r.question_id];
    setEditTarget({
      questionId: r.question_id,
      chapter: r.chapter || qInfo?.chapter || 'ch1',
      reportMessage: r.message,
      reportAuthor: r.name,
      reportId: r.id,
    });
    setTab('questions');
  };

  const clearEditTarget = useCallback(() => setEditTarget(null), []);

  const handleResolveReviewNotif = useCallback(
    async (notif) => {
      if (!notif?.id) return;
      setResolvingId(notif.id);
      try {
        await resolveQuestionReport({ password, id: notif.id, questionId: notif.chapter || 'ch1' });
        setReviewNotifications((prev) =>
          prev.map((n) => (String(n.id) === String(notif.id) ? { ...n, resolved_at: new Date().toISOString() } : n))
        );
      } catch {
        // Ignore
      } finally {
        setResolvingId(null);
      }
    },
    [password]
  );

  const openChapterFromReview = (notif) => {
    setEditTarget({
      chapter: notif.chapter || 'ch1',
    });
    setTab('questions');
  };

  const openReports = useMemo(() => reports.filter((r) => !r.resolved_at), [reports]);
  const resolvedReports = useMemo(() => reports.filter((r) => r.resolved_at), [reports]);

  const openSubmissions = useMemo(() => submissions.filter((s) => !s.resolved_at), [submissions]);
  const resolvedSubmissions = useMemo(() => submissions.filter((s) => s.resolved_at), [submissions]);
  const acceptedSubmissions = useMemo(
    () => resolvedSubmissions.filter((s) => s.decision !== 'refused' && s.status !== 'refused'),
    [resolvedSubmissions]
  );

  const openReviewNotifications = useMemo(
    () => reviewNotifications.filter((n) => !n.resolved_at),
    [reviewNotifications]
  );
  const resolvedReviewNotifications = useMemo(
    () => reviewNotifications.filter((n) => n.resolved_at),
    [reviewNotifications]
  );

  const courses = useMemo(() => [...new Set((attempts || []).map((a) => a.course))].sort(), [attempts]);

  const rows = useMemo(() => {
    const q = nameFilter.trim().toLowerCase();
    return (attempts || []).filter(
      (a) => (!q || a.name.toLowerCase().includes(q)) && (!courseFilter || a.course === courseFilter)
    );
  }, [attempts, nameFilter, courseFilter]);

  const passedCount = rows.filter((a) => a.passed).length;

  if (attempts === null) {
    return (
      <section className="section admin admin-login">
        <span className="eyebrow">{reviewerMode ? 'Espace relecture' : 'Espace privé'}</span>
        <h1 className="admin-title">{reviewerMode ? 'Espace correcteur' : 'Espace admin'}</h1>
        <form onSubmit={login} className="admin-form">
          <label htmlFor="admin-password">Mot de passe</label>
          <input
            id="admin-password"
            className="admin-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          {error && <p className="admin-error" role="alert">{error}</p>}
          <button className="btn" type="submit" disabled={loading || !password}>
            {loading ? 'Vérification…' : 'Se connecter'}
          </button>
        </form>
      </section>
    );
  }

  if (role === 'reviewer') {
    return (
      <section className="section admin">
        <div className="admin-head">
          <div>
            <span className="eyebrow">Espace correcteur</span>
            <h1 className="admin-title">Correction</h1>
          </div>
          {closeQuestionEditor ? (
            <div className="admin-head-actions">
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => closeQuestionEditor.next && closeQuestionEditor.next()}
                disabled={!closeQuestionEditor.next}
                title={
                  closeQuestionEditor.next
                    ? `Passer à la question ${closeQuestionEditor.nextNum}/${closeQuestionEditor.totalInChapter}`
                    : 'Dernière question du chapitre'
                }
              >
                Suivant →
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-small"
                onClick={() => closeQuestionEditor.close()}
              >
                ← Retour
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost btn-small" onClick={logout}>
              Se déconnecter
            </button>
          )}
        </div>

        <QuestionsAdmin
          password={password}
          reviewerMode
          editTarget={editTarget}
          onClearEditTarget={clearEditTarget}
          onEditingChange={setCloseQuestionEditor}
        />
      </section>
    );
  }

  const titleByTab = {
    results: 'Résultats des quiz',
    questions: closeQuestionEditor ? 'Correction' : 'Questions du quiz',
    reports: 'Signalements & retours',
    submissions: 'Questions proposées',
    reviews: 'Quiz relus par les correcteurs',
  };

  return (
    <section className="section admin">
      <div className="admin-head">
        <div>
          <span className="eyebrow">Espace admin</span>
          <h1 className="admin-title">{titleByTab[tab] || 'Administration'}</h1>
        </div>
        {tab === 'questions' && closeQuestionEditor ? (
          <div className="admin-head-actions">
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => closeQuestionEditor.next && closeQuestionEditor.next()}
              disabled={!closeQuestionEditor.next}
              title={
                closeQuestionEditor.next
                  ? `Passer à la question ${closeQuestionEditor.nextNum}/${closeQuestionEditor.totalInChapter}`
                  : 'Dernière question du chapitre'
              }
            >
              Suivant →
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => closeQuestionEditor.close()}
            >
              ← Retour
            </button>
          </div>
        ) : (
          <button className="btn btn-ghost btn-small" onClick={logout}>
            Se déconnecter
          </button>
        )}
      </div>

      {openReviewNotifications.length > 0 && tab !== 'reviews' && (
        <div className="admin-notif-banner admin-notif-review" role="status">
          <div>
            <strong>
              ✓ {openReviewNotifications.length}{' '}
              {openReviewNotifications.length > 1
                ? 'nouveaux quiz relus par les correcteurs'
                : 'nouveau quiz relu par un correcteur'}
            </strong>
            <span>
              {openReviewNotifications
                .slice(0, 3)
                .map((n) => `${courseLabel(n.chapter)} (relu par ${n.reviewer})`)
                .join(' · ')}
            </span>
          </div>
          <button type="button" className="btn btn-small" onClick={() => setTab('reviews')}>
            Voir {openReviewNotifications.length > 1 ? 'les relectures' : 'la relecture'}
          </button>
        </div>
      )}

      {openSubmissions.length > 0 && tab !== 'submissions' && (
        <div className="admin-notif-banner admin-notif-submission" role="status">
          <div>
            <strong>
              ✦ {openSubmissions.length}{' '}
              {openSubmissions.length > 1
                ? 'nouvelles questions proposées par des utilisateurs'
                : 'nouvelle question proposée par un utilisateur'}
            </strong>
            <span>
              Vous pouvez accepter (+10 pts pour l’auteur), modifier avant de valider, ou refuser la proposition.
            </span>
          </div>
          <button type="button" className="btn btn-small" onClick={() => setTab('submissions')}>
            Examiner {openSubmissions.length > 1 ? 'les propositions' : 'la proposition'}
          </button>
        </div>
      )}

      {openReports.length > 0 && tab !== 'reports' && (
        <div className="admin-notif-banner" role="status">
          <div>
            <strong>
              ⚑ {openReports.length} {openReports.length > 1 ? 'nouveaux retours d’utilisateurs' : 'nouveau retour d’utilisateur'}
            </strong>
            <span>Un participant a envoyé un retour ou signalé un bug / une remarque sur une question.</span>
          </div>
          <button type="button" className="btn btn-small" onClick={() => setTab('reports')}>
            Lire {openReports.length > 1 ? 'les retours' : 'le retour'}
          </button>
        </div>
      )}

      <div className="cq-chips admin-tabs" role="tablist" aria-label="Sections">
        <button role="tab" aria-selected={tab === 'results'} className={tab === 'results' ? 'on' : ''} onClick={() => setTab('results')}>
          Résultats
        </button>
        <button role="tab" aria-selected={tab === 'questions'} className={tab === 'questions' ? 'on' : ''} onClick={() => setTab('questions')}>
          Questions
        </button>
        <button role="tab" aria-selected={tab === 'reviews'} className={tab === 'reviews' ? 'on' : ''} onClick={() => setTab('reviews')}>
          Relectures
          {openReviewNotifications.length > 0 && <span className="admin-tab-badge">{openReviewNotifications.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'submissions'} className={tab === 'submissions' ? 'on' : ''} onClick={() => setTab('submissions')}>
          Propositions
          {openSubmissions.length > 0 && <span className="admin-tab-badge">{openSubmissions.length}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'reports'} className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>
          Signalements
          {openReports.length > 0 && <span className="admin-tab-badge">{openReports.length}</span>}
        </button>
      </div>

      {tab === 'questions' ? (
        <QuestionsAdmin
          password={password}
          editTarget={editTarget}
          onClearEditTarget={clearEditTarget}
          onResolveReport={handleResolveReport}
          onResolveSubmission={handleResolveSubmission}
          acceptedSubmissions={acceptedSubmissions}
          reviewerEdits={reviewerEdits}
          onEditingChange={setCloseQuestionEditor}
        />
      ) : tab === 'reviews' ? (
        <div className="admin-reports">
          {openReviewNotifications.length === 0 ? (
            <p className="admin-empty">Aucune nouvelle notification de relecture en attente.</p>
          ) : (
            <div className="admin-reports-list">
              {openReviewNotifications.map((n) => (
                <article key={n.id} className="admin-report-card admin-review-card">
                  <div className="admin-report-meta">
                    <span>
                      <strong>✓ Relu par {n.reviewer}</strong> · {formatDate(n.created_at)}
                    </span>
                    <span className="admin-report-tag">
                      {courseLabel(n.chapter)}
                    </span>
                  </div>
                  <p className="admin-report-q">
                    Le quiz <strong>« {courseLabel(n.chapter)} »</strong> a été relu et validé par{' '}
                    <strong>{n.reviewer}</strong>
                    {n.count > 0 ? ` (${n.count} question${n.count > 1 ? 's' : ''} relue${n.count > 1 ? 's' : ''})` : ''}.
                  </p>
                  <div className="admin-report-actions">
                    <button type="button" className="btn btn-small" onClick={() => openChapterFromReview(n)}>
                      Ouvrir ce chapitre dans Questions
                    </button>
                    <button
                      type="button"
                      className="btn btn-small btn-ghost"
                      disabled={resolvingId === n.id}
                      onClick={() => handleResolveReviewNotif(n)}
                    >
                      {resolvingId === n.id ? 'Traitement…' : 'Marquer la notification comme lue'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {resolvedReviewNotifications.length > 0 && (
            <details className="qa-deleted" style={{ marginTop: 20 }}>
              <summary>{resolvedReviewNotifications.length} notification(s) de relecture déjà consultée(s)</summary>
              <div className="admin-reports-list" style={{ marginTop: 12 }}>
                {resolvedReviewNotifications.map((n) => (
                  <article key={n.id} className="admin-report-card is-resolved">
                    <div className="admin-report-meta">
                      <span>
                        <strong>✓ Relu par {n.reviewer}</strong> · {formatDate(n.created_at)}
                      </span>
                      <span className="admin-report-tag">{courseLabel(n.chapter)}</span>
                    </div>
                    <div className="admin-report-actions">
                      <button type="button" className="btn btn-small btn-ghost" onClick={() => openChapterFromReview(n)}>
                        Ouvrir ce chapitre
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </details>
          )}
        </div>
      ) : tab === 'submissions' ? (
        <div className="admin-reports">
          {submissionError && (
            <p className="admin-error" role="alert">{submissionError}</p>
          )}
          {openSubmissions.length === 0 ? (
            <p className="admin-empty">Aucune nouvelle proposition de question en attente.</p>
          ) : (
            <div className="admin-reports-list">
              {openSubmissions.map((s) => {
                const q = s.question || {};
                const chKey = s.chapter || 'ch1';
                return (
                  <article key={s.id} className="admin-report-card admin-submission-card">
                    <div className="admin-report-meta">
                      <span>
                        <strong>{s.name}</strong> · {formatDate(s.created_at)}
                      </span>
                      <span className="admin-report-tag">
                        {courseLabel(chKey)} · {q.type || 'QCU'} · {q.theme || 'Sans sous-thème'}
                      </span>
                    </div>

                    {q.enonce_image && (
                      <div className="qa-fig" style={{ margin: '10px 0' }}>
                        <img src={imageSrc(chKey, q.enonce_image)} alt={q.enonce_image.alt || ''} />
                        <div className="qa-fig-body">
                          <small>Image avant l’énoncé</small>
                          {q.enonce_image.alt && <p style={{ fontSize: '0.88rem', color: 'var(--muted)' }}>{q.enonce_image.alt}</p>}
                        </div>
                      </div>
                    )}

                    <p className="admin-report-q">
                      <span>Énoncé :</span> {q.enonce}
                    </p>

                    {Array.isArray(q.items) && q.items.length > 0 && (
                      <ul className="admin-subm-items">
                        {q.items.map((it) => (
                          <li key={it.id} className={it.correct ? 'is-correct' : ''}>
                            <span className="admin-subm-letter">{it.id}.</span>
                            <span>{it.texte}</span>
                            {it.correct && <span className="admin-subm-good-pill">✓ Vrai</span>}
                          </li>
                        ))}
                      </ul>
                    )}

                    {q.explication && (
                      <p className="admin-subm-exp">
                        <strong>Explication :</strong> {q.explication}
                      </p>
                    )}

                    {Array.isArray(q.correction_figures) && q.correction_figures.length > 0 && (
                      <div style={{ display: 'grid', gap: 8, margin: '8px 0' }}>
                        {q.correction_figures.map((fig, fi) => (
                          <div key={(fig.upload || fig.file || 'fig') + fi} className="qa-fig">
                            <img src={imageSrc(chKey, fig)} alt={fig.caption || ''} loading="lazy" />
                            <div className="qa-fig-body">
                              <small>Figure de correction {fi + 1}</small>
                              <p style={{ fontSize: '0.88rem', color: 'var(--text)' }}>{fig.caption}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {q.source && (q.source.page || q.source.element || q.source.refs) && (
                      <p className="admin-subm-src">
                        <strong>Source :</strong>{' '}
                        {[
                          q.source.page ? `p. ${q.source.page}` : null,
                          q.source.element || null,
                          q.source.refs || null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    )}

                    <div className="admin-report-actions">
                      <button
                        type="button"
                        className="btn btn-small"
                        disabled={resolvingId === s.id}
                        onClick={() => handleAcceptSubmission(s)}
                      >
                        {resolvingId === s.id ? 'Validation…' : '✓ Accepter et publier (+10 pts)'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        disabled={resolvingId === s.id}
                        onClick={() => openQuestionFromSubmission(s)}
                      >
                        ✎ Modifier avant de valider
                      </button>
                      <button
                        type="button"
                        className="btn btn-small btn-ghost qa-danger"
                        disabled={resolvingId === s.id}
                        onClick={() => handleRefuseSubmission(s)}
                      >
                        ✕ Refuser
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {resolvedSubmissions.length > 0 && (
            <details className="qa-deleted" style={{ marginTop: 20 }}>
              <summary>{resolvedSubmissions.length} proposition(s) déjà traitée(s)</summary>
              <div className="admin-reports-list" style={{ marginTop: 12 }}>
                {resolvedSubmissions.map((s) => {
                  const q = s.question || {};
                  const chKey = s.chapter || 'ch1';
                  const isAccepted = s.decision !== 'refused';
                  return (
                    <article key={s.id} className="admin-report-card is-resolved">
                      <div className="admin-report-meta">
                        <span>
                          <strong>{s.name}</strong> · {formatDate(s.created_at)}
                        </span>
                        <span className="admin-report-tag">
                          {courseLabel(chKey)} ·{' '}
                          <strong style={{ color: isAccepted ? 'var(--good)' : '#fca5a5' }}>
                            {isAccepted ? 'Validée (+10 pts)' : 'Refusée'}
                          </strong>
                        </span>
                      </div>
                      <p className="admin-report-q">
                        <span>Énoncé :</span> {q.enonce}
                      </p>
                    </article>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      ) : tab === 'reports' ? (
        <div className="admin-reports">
          {openReports.length === 0 ? (
            <p className="admin-empty">Aucun nouveau signalement à traiter pour le moment.</p>
          ) : (
            <div className="admin-reports-list">
              {openReports.map((r) => {
                const isSiteBug = r.question_id === 'site-bug';
                const qInfo = isSiteBug ? null : questionMap[r.question_id];
                const chKey = r.chapter || qInfo?.chapter || 'ch1';
                return (
                  <article key={r.id} className="admin-report-card">
                    <div className="admin-report-meta">
                      <span>
                        <strong>{r.name}</strong> · {formatDate(r.created_at)}
                      </span>
                      <span className="admin-report-tag">
                        {isSiteBug
                          ? 'Retour général / Bug du site'
                          : `${courseLabel(chKey)} · ${qInfo ? `Question ${qInfo.number}` : r.question_id} (${r.question_id})`}
                      </span>
                    </div>
                    {qInfo?.enonce && (
                      <p className="admin-report-q">
                        <span>Question :</span> {qInfo.enonce}
                      </p>
                    )}
                    <p className="admin-report-msg">« {r.message} »</p>
                    <div className="admin-report-actions">
                      {!isSiteBug && (
                        <button type="button" className="btn btn-small" onClick={() => openQuestionFromReport(r)}>
                          Modifier la question
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-small btn-ghost"
                        disabled={resolvingId === r.id}
                        onClick={() => handleResolveReport(r)}
                      >
                        {resolvingId === r.id ? 'Traitement…' : 'Marquer comme traité'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {resolvedReports.length > 0 && (
            <details className="qa-deleted" style={{ marginTop: 20 }}>
              <summary>{resolvedReports.length} signalement(s) déjà traité(s)</summary>
              <div className="admin-reports-list" style={{ marginTop: 12 }}>
                {resolvedReports.map((r) => {
                  const isSiteBug = r.question_id === 'site-bug';
                  const qInfo = isSiteBug ? null : questionMap[r.question_id];
                  const chKey = r.chapter || qInfo?.chapter || 'ch1';
                  return (
                    <article key={r.id} className="admin-report-card is-resolved">
                      <div className="admin-report-meta">
                        <span>
                          <strong>{r.name}</strong> · {formatDate(r.created_at)}
                        </span>
                        <span className="admin-report-tag">
                          {isSiteBug ? 'Retour général / Bug du site' : `${courseLabel(chKey)} · ${r.question_id}`}
                        </span>
                      </div>
                      <p className="admin-report-msg">« {r.message} »</p>
                      {!isSiteBug && (
                        <div className="admin-report-actions">
                          <button type="button" className="btn btn-small btn-ghost" onClick={() => openQuestionFromReport(r)}>
                            Modifier la question
                          </button>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </details>
          )}
        </div>
      ) : (
        <>
          <div className="admin-summary">
            <div className="admin-stat"><strong>{rows.length}</strong><span>passages</span></div>
            <div className="admin-stat"><strong>{passedCount}</strong><span>réussites</span></div>
            <div className="admin-stat">
              <strong>{rows.length ? Math.round((passedCount / rows.length) * 100) : 0} %</strong>
              <span>taux de réussite</span>
            </div>
          </div>

          <div className="admin-filters">
            <input
              className="admin-input"
              type="search"
              placeholder="Filtrer par nom"
              aria-label="Filtrer par nom"
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
            />
            <select
              className="admin-input"
              aria-label="Filtrer par cours"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            >
              <option value="">Tous les cours</option>
              {courses.map((c) => <option key={c} value={c}>{courseLabel(c)}</option>)}
            </select>
          </div>

          {rows.length === 0 ? (
            <p className="admin-empty">Aucun résultat pour le moment.</p>
          ) : (
            <div className="admin-table-wrap table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Date</th><th>Nom</th><th>Cours</th><th>Quiz</th><th>Score</th><th>Résultat</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDate(a.created_at)}</td>
                      <td>{a.name}</td>
                      <td>{courseLabel(a.course)}</td>
                      <td>{courseLabel(a.quiz)}</td>
                      <td>{a.score}/{a.total}</td>
                      <td>
                        <span className={`admin-badge ${a.passed ? 'admin-badge-pass' : 'admin-badge-fail'}`}>
                          {a.passed ? 'Réussi' : 'À revoir'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
