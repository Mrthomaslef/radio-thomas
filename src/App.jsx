import { useEffect, useState } from 'react';
import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import Stats from './components/Stats.jsx';
import Courses from './components/Courses.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import Quiz from './components/Quiz.jsx';
import Footer from './components/Footer.jsx';
import CoursePage from './components/CoursePage.jsx';
import AdminPage from './components/AdminPage.jsx';
import { coursCoiffe } from './data/coursCoiffe.js';

// Tiny hash router: "#/cours/<slug>" shows a course page, anything else is the landing page.
const coursesBySlug = { [coursCoiffe.slug]: coursCoiffe };

const isAdminRoute = () => window.location.hash === '#/admin';

function parseRoute() {
  const m = window.location.hash.match(/^#\/cours\/([\w-]+)/);
  return m && coursesBySlug[m[1]] ? coursesBySlug[m[1]] : null;
}

export default function App() {
  const [course, setCourse] = useState(parseRoute);
  const [admin, setAdmin] = useState(isAdminRoute);

  useEffect(() => {
    const onHash = () => {
      setCourse(parseRoute());
      setAdmin(isAdminRoute());
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
          <>
            <Hero />
            <Stats />
            <Courses />
            <HowItWorks />
            <Quiz />
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
