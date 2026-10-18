import Navbar from './components/Navbar.jsx';
import Hero from './components/Hero.jsx';
import Stats from './components/Stats.jsx';
import Courses from './components/Courses.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import Quiz from './components/Quiz.jsx';
import Footer from './components/Footer.jsx';

export default function App() {
  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      <Navbar />
      <main>
        <Hero />
        <Stats />
        <Courses />
        <HowItWorks />
        <Quiz />
      </main>
      <Footer />
    </>
  );
}
