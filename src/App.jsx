import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Home from './components/Home.jsx';
import Footer from './components/Footer.jsx';
import ChapterQuiz from './components/ChapterQuiz.jsx';
import AdminPage from './components/AdminPage.jsx';
import ProgressPage from './components/ProgressPage.jsx';
import LeaderboardPage from './components/LeaderboardPage.jsx';
import RandomQuiz from './components/RandomQuiz.jsx';
import { CHAPTERS as chapters } from './data/useQuestions.js';

// Tiny hash router:
// - "#/quiz/<key>" (or "#/quiz/<key>?q=<1-based>") plays a chapter quiz
// - "#/aleatoire" opens the random quiz builder & player
// - "#/progression" shows the player's progress page
// - "#/classement" (or "#/leaderboard") shows the leaderboard
// - "#/admin" opens the password-protected trainer page
// - "#/<theme>" opens a theme on the home page
const isAdminRoute = () => window.location.hash === '#/admin';
const isProgressRoute = () => window.location.hash === '#/progression';
const isLeaderboardRoute = () =>
  window.location.hash === '#/classement' || window.location.hash === '#/leaderboard';
const isRandomRoute = () => window.location.hash === '#/aleatoire';
const parseTheme = () => {
  const m = window.location.hash.match(/^#\/([\w-]+)$/);
  if (
    !m ||
    m[1] === 'admin' ||
    m[1] === 'progression' ||
    m[1] === 'classement' ||
    m[1] === 'leaderboard' ||
    m[1] === 'aleatoire'
  ) {
    return null;
  }
  return m[1];
};

function parseRoute() {
  const m = window.location.hash.match(/^#\/quiz\/([\w-]+)(?:\?q=(\d+))?/);
  if (!m || !chapters[m[1]]) return null;
  const qNum = m[2] ? parseInt(m[2], 10) : null;
  return {
    key: m[1],
    data: chapters[m[1]],
    initialIdx: qNum && qNum >= 1 ? qNum - 1 : null,
  };
}

export default function App() {
  const [course, setCourse] = useState(parseRoute);
  const [admin, setAdmin] = useState(isAdminRoute);
  const [progressPage, setProgressPage] = useState(isProgressRoute);
  const [leaderboardPage, setLeaderboardPage] = useState(isLeaderboardRoute);
  const [randomPage, setRandomPage] = useState(isRandomRoute);
  const [theme, setTheme] = useState(parseTheme);

  useEffect(() => {
    const onHash = () => {
      setCourse(parseRoute());
      setAdmin(isAdminRoute());
      setProgressPage(isProgressRoute());
      setLeaderboardPage(isLeaderboardRoute());
      setRandomPage(isRandomRoute());
      setTheme(parseTheme());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [course, admin, progressPage, leaderboardPage, randomPage, theme]);

  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      <Navbar />
      <main>
        {admin ? (
          <AdminPage />
        ) : progressPage ? (
          <ProgressPage />
        ) : leaderboardPage ? (
          <LeaderboardPage />
        ) : randomPage ? (
          <RandomQuiz />
        ) : course ? (
          <ChapterQuiz key={`${course.key}:${course.initialIdx ?? 'auto'}`} chapter={course} />
        ) : (
          <Home openTheme={theme} />
        )}
      </main>
      <Footer />
    </>
  );
}
