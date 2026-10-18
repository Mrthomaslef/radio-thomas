import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Home from './components/Home.jsx';
import Footer from './components/Footer.jsx';
import CoursePage from './components/CoursePage.jsx';
import AdminPage from './components/AdminPage.jsx';

// Tiny hash router: "#/cours/<slug>" shows a course page, anything else is the landing page.
// Add a course here (slug -> course data) when its content is ready.
const coursesBySlug = {};

const isAdminRoute = () => window.location.hash === '#/admin';
// "#/epaule" opens that theme's chapter list on the home page.
const parseTheme = () => (window.location.hash.match(/^#\/([\w-]+)$/) || [])[1] || null;

function parseRoute() {
  const m = window.location.hash.match(/^#\/cours\/([\w-]+)/);
  return m && coursesBySlug[m[1]] ? coursesBySlug[m[1]] : null;
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

  // Coming back to the landing page with an anchor (e.g. #courses): scroll once it is rendered.
  useEffect(() => {
    if (course || admin) return;
    const id = window.location.hash.slice(1);
    if (id && !id.startsWith('/')) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    else if (!id) window.scrollTo(0, 0);
  }, [course, admin]);

  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      <Navbar />
      <main>
        {admin ? (
          <AdminPage />
        ) : course ? (
          <CoursePage course={course} />
        ) : (
          <Home openTheme={theme} />
        )}
      </main>
      <Footer />
    </>
  );
}
