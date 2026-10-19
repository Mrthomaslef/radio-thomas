import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Home from './components/Home.jsx';
import Footer from './components/Footer.jsx';
import ChapterQuiz from './components/ChapterQuiz.jsx';
import AdminPage from './components/AdminPage.jsx';
import { CHAPTERS as chapters } from './data/useQuestions.js';

// Tiny hash router: "#/quiz/<key>" plays a chapter quiz, "#/<theme>" opens a theme, anything else is the home page.

const isAdminRoute = () => window.location.hash === '#/admin';
const parseTheme = () => (window.location.hash.match(/^#\/([\w-]+)$/) || [])[1] || null;

function parseRoute() {
  const m = window.location.hash.match(/^#\/quiz\/([\w-]+)/);
  return m && chapters[m[1]] ? { key: m[1], data: chapters[m[1]] } : null;
}

export default function App() {
  const [course, setCourse] = useState(parseRoute);
  const [admin, setAdmin] = useState(isAdminRoute);
  const [theme, setTheme] = useState(parseTheme);

  useEffect(() => {
    const onHash = () => {
      setCourse(parseRoute());
      setAdmin(isAdminRoute());
      setTheme(parseTheme());
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [course, admin, theme]);

  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      <Navbar />
      <main>
        {admin ? (
          <AdminPage />
        ) : course ? (
          <ChapterQuiz key={course.key} chapter={course} />
        ) : (
          <Home openTheme={theme} />
        )}
      </main>
      <Footer />
    </>
  );
}
