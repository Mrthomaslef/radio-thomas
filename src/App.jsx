import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Home from './components/Home.jsx';
import Footer from './components/Footer.jsx';
import ChapterQuiz from './components/ChapterQuiz.jsx';
import AdminPage from './components/AdminPage.jsx';
import ProgressPage from './components/ProgressPage.jsx';
import LeaderboardPage from './components/LeaderboardPage.jsx';
import RandomQuiz from './components/RandomQuiz.jsx';
import ProposeQuestionPage from './components/ProposeQuestionPage.jsx';
import { CHAPTERS as chapters } from './data/useQuestions.js';

// Tiny hash router:
// - "#/quiz/<key>" (or "#/quiz/<key>?q=<1-based>") plays a chapter quiz
// - "#/aleatoire" opens the random quiz builder & player
// - "#/proposer" opens the user question proposal form
// - "#/progression" shows the player's progress page
// - "#/classement" (or "#/leaderboard") shows the leaderboard
// - "#/admin" opens the password-protected trainer page
// - "#/<theme>" opens a theme on the home page
const isAdminRoute = () => window.location.hash === '#/admin';
const isReviewerRoute = () => window.location.hash === '#/correcteur';
const isProgressRoute = () => window.location.hash === '#/progression';
const isLeaderboardRoute = () =>
  window.location.hash === '#/classement' ||
  window.location.hash === '#/leaderboard' ||
  window.location.hash === '#/contributeurs';
const isRandomRoute = () => window.location.hash === '#/aleatoire';
const isProposeRoute = () => window.location.hash === '#/proposer';
const parseTheme = () => {
  const m = window.location.hash.match(/^#\/([\w-]+)$/);
  if (
    !m ||
    m[1] === 'admin' ||
    m[1] === 'correcteur' ||
    m[1] === 'progression' ||
    m[1] === 'classement' ||
    m[1] === 'leaderboard' ||
    m[1] === 'contributeurs' ||
    m[1] === 'aleatoire' ||
    m[1] === 'proposer'
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
  const [reviewer, setReviewer] = useState(isReviewerRoute);
  const [progressPage, setProgressPage] = useState(isProgressRoute);
  const [leaderboardPage, setLeaderboardPage] = useState(isLeaderboardRoute);
  const [randomPage, setRandomPage] = useState(isRandomRoute);
  const [proposePage, setProposePage] = useState(isProposeRoute);
  const [theme, setTheme] = useState(parseTheme);

  useEffect(() => {
    const onHash = () => {
      setCourse(parseRoute());
      setAdmin(isAdminRoute());
      setReviewer(isReviewerRoute());
      setProgressPage(isProgressRoute());
      setLeaderboardPage(isLeaderboardRoute());
      setRandomPage(isRandomRoute());
      setProposePage(isProposeRoute());
      setTheme(parseTheme());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [course, admin, reviewer, progressPage, leaderboardPage, randomPage, proposePage, theme]);

  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      <Navbar />
      <main>
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
          <ChapterQuiz key={`${course.key}:${course.initialIdx ?? 'auto'}`} chapter={course} />
        ) : (
          <Home openTheme={theme} />
        )}
      </main>
      <Footer />
    </>
  );
}
