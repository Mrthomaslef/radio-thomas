import { useEffect, useRef, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import BottomNav from './components/BottomNav.jsx';
import DailyPathPage from './components/DailyPathPage.jsx';
import Home from './components/Home.jsx';
import Footer from './components/Footer.jsx';
import ChapterQuiz from './components/ChapterQuiz.jsx';
import AdminPage from './components/AdminPage.jsx';
import ProgressPage from './components/ProgressPage.jsx';
import LeaderboardPage from './components/LeaderboardPage.jsx';
import RandomQuiz from './components/RandomQuiz.jsx';
import ProposeQuestionPage from './components/ProposeQuestionPage.jsx';
import { CHAPTERS as chapters, resetQuestionsCache } from './data/useQuestions.js';
import { syncProgressFromServer } from './data/player.js';

// Tiny hash router:
// - "#/" opens the daily progression path (Accueil)
// - "#/chapitres" or "#/<theme>" opens the chapter/theme list (Quiz tab)
// - "#/quiz/<key>" (or "#/quiz/<key>?q=<1-based>") plays a chapter quiz
// - "#/aleatoire" opens the random quiz builder & player
// - "#/proposer" opens the user question proposal form
// - "#/progression" shows the player's progress page
// - "#/classement" (or "#/leaderboard") shows the leaderboard
// - "#/admin" opens the password-protected trainer page
const isAdminRoute = () => window.location.hash === '#/admin';
const isReviewerRoute = () => window.location.hash === '#/correcteur';
const isProgressRoute = () => window.location.hash === '#/progression';
const isLeaderboardRoute = () =>
  window.location.hash === '#/classement' ||
  window.location.hash === '#/leaderboard' ||
  window.location.hash === '#/contributeurs' ||
  window.location.hash === '#/etoiles';
const isRandomRoute = () => window.location.hash === '#/aleatoire';
const isProposeRoute = () => window.location.hash === '#/proposer';
const isChaptersListRoute = () => window.location.hash === '#/chapitres';
const parseTheme = () => {
  const m = window.location.hash.match(/^#\/([\w-]+)$/);
  if (
    !m ||
    m[1] === 'chapitres' ||
    m[1] === 'admin' ||
    m[1] === 'correcteur' ||
    m[1] === 'progression' ||
    m[1] === 'classement' ||
    m[1] === 'leaderboard' ||
    m[1] === 'contributeurs' ||
    m[1] === 'etoiles' ||
    m[1] === 'aleatoire' ||
    m[1] === 'proposer'
  ) {
    return null;
  }
  return m[1];
};

function parseRoute() {
  const m = window.location.hash.match(/^#\/quiz\/([\w-]+)(?:\?(.+))?$/);
  if (!m || !chapters[m[1]]) return null;
  const params = new URLSearchParams(m[2] || '');
  const qRaw = params.get('q');
  const rndRaw = params.get('random');
  const qNum = qRaw ? parseInt(qRaw, 10) : null;
  const randomCount = rndRaw ? parseInt(rndRaw, 10) : null;
  return {
    key: m[1],
    data: chapters[m[1]],
    initialIdx: qNum && qNum >= 1 ? qNum - 1 : null,
    randomCount: randomCount && randomCount >= 1 ? randomCount : null,
  };
}

function isStandaloneApp() {
  if (typeof window === 'undefined') return false;
  if (window.navigator?.standalone === true) return true;
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
  if (window.matchMedia?.('(display-mode: fullscreen)')?.matches) return true;
  if (typeof document !== 'undefined' && document.referrer.includes('android-app://')) return true;
  return false;
}

export default function App() {
  const [course, setCourse] = useState(parseRoute);
  const [admin, setAdmin] = useState(isAdminRoute);
  const [reviewer, setReviewer] = useState(isReviewerRoute);
  const [progressPage, setProgressPage] = useState(isProgressRoute);
  const [leaderboardPage, setLeaderboardPage] = useState(isLeaderboardRoute);
  const [randomPage, setRandomPage] = useState(isRandomRoute);
  const [proposePage, setProposePage] = useState(isProposeRoute);
  const [chaptersListPage, setChaptersListPage] = useState(isChaptersListRoute);
  const [theme, setTheme] = useState(parseTheme);
  const [pullDist, setPullDist] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullDistRef = useRef(0);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const onHash = () => {
      setCourse(parseRoute());
      setAdmin(isAdminRoute());
      setReviewer(isReviewerRoute());
      setProgressPage(isProgressRoute());
      setLeaderboardPage(isLeaderboardRoute());
      setRandomPage(isRandomRoute());
      setProposePage(isProposeRoute());
      setChaptersListPage(isChaptersListRoute());
      setTheme(parseTheme());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let startY = null;
    let startX = null;

    const onTouchStart = (e) => {
      if (!isStandaloneApp()) return;
      if (refreshingRef.current) return;
      if (window.scrollY > 2) {
        startY = null;
        return;
      }
      const tag = e.target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') {
        startY = null;
        return;
      }
      const t = e.touches?.[0];
      if (!t) return;
      startY = t.clientY;
      startX = t.clientX;
    };

    const onTouchMove = (e) => {
      if (startY === null || refreshingRef.current) return;
      if (window.scrollY > 2) {
        startY = null;
        if (pullDistRef.current > 0) {
          pullDistRef.current = 0;
          setPullDist(0);
        }
        return;
      }
      const t = e.touches?.[0];
      if (!t) return;
      const dy = t.clientY - startY;
      const dx = Math.abs(t.clientX - (startX || 0));
      if (dy > 14 && dy > dx * 1.4) {
        const damped = Math.min(105, Math.round((dy - 14) * 0.55));
        pullDistRef.current = damped;
        setPullDist(damped);
      } else if (pullDistRef.current > 0) {
        pullDistRef.current = 0;
        setPullDist(0);
      }
    };

    const onTouchEnd = async () => {
      if (startY === null || refreshingRef.current) return;
      startY = null;
      const d = pullDistRef.current;
      if (d >= 56) {
        refreshingRef.current = true;
        setRefreshing(true);
        pullDistRef.current = 56;
        setPullDist(56);
        try {
          resetQuestionsCache();
          await syncProgressFromServer();
        } catch {
          // ignore
        }
        window.location.reload();
      } else if (d > 0) {
        pullDistRef.current = 0;
        setPullDist(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [course, admin, reviewer, progressPage, leaderboardPage, randomPage, proposePage, chaptersListPage]);

  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      {(pullDist > 0 || refreshing) && (
        <div
          className={`ptr-indicator ${pullDist >= 56 || refreshing ? 'is-ready' : ''}`}
          style={{ transform: `translate(-50%, ${Math.min(pullDist, 64)}px)` }}
          role="status"
          aria-live="polite"
          aria-label="Actualisation"
        >
          <span
            className={`ptr-icon ${refreshing ? 'is-spinning' : ''}`}
            style={!refreshing ? { transform: `rotate(${Math.round(pullDist * 4.5)}deg)` } : undefined}
          >
            ↻
          </span>
        </div>
      )}
      <Navbar />
      <main className="main-with-bottom-nav">
        {admin ? (
          <AdminPage key="admin" />
        ) : reviewer ? (
          <AdminPage key="correcteur" reviewerMode />
        ) : progressPage ? (
          <ProgressPage />
        ) : leaderboardPage ? (
          <LeaderboardPage />
        ) : randomPage ? (
          <RandomQuiz />
        ) : proposePage ? (
          <ProposeQuestionPage />
        ) : course ? (
          <ChapterQuiz key={`${course.key}:${course.initialIdx ?? 'auto'}:${course.randomCount ?? 'all'}`} chapter={course} />
        ) : chaptersListPage || theme ? (
          <Home openTheme={theme} />
        ) : (
          <DailyPathPage />
        )}
      </main>
      <Footer />
      <BottomNav />
    </>
  );
}
