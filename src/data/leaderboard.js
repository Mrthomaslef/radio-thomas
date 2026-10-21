// Leaderboards are computed by the database (SQL functions get_leaderboard / get_contributors_leaderboard),
// so there is nothing to record or merge on the client: just read the two lists.
// We keep a fast in-memory + sessionStorage cache (stale-while-revalidate) so the page renders instantaneously.

const CACHE_KEYS = {
  quiz: 'quiz-cotten:lb-cache:quiz',
  contributors: 'quiz-cotten:lb-cache:contributors',
};

const memCache = {
  quiz: null,
  contributors: null,
};

export function getCachedLeaderboard(type = 'quiz') {
  const key = type === 'contributors' ? 'contributors' : 'quiz';
  if (Array.isArray(memCache[key])) return memCache[key];
  try {
    const raw = sessionStorage.getItem(CACHE_KEYS[key]);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memCache[key] = parsed;
        return parsed;
      }
    }
  } catch {
    // Ignore storage errors
  }
  return null;
}

function setCachedLeaderboard(type, entries) {
  const key = type === 'contributors' ? 'contributors' : 'quiz';
  memCache[key] = entries;
  try {
    sessionStorage.setItem(CACHE_KEYS[key], JSON.stringify(entries));
  } catch {
    // Ignore storage errors
  }
}

async function fetchEntries(url, cacheType) {
  try {
    const r = await fetch(url);
    if (!r.ok) return getCachedLeaderboard(cacheType) || [];
    const data = await r.json();
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    setCachedLeaderboard(cacheType, entries);
    return entries;
  } catch {
    return getCachedLeaderboard(cacheType) || [];
  }
}

// Quiz points: 1 point per correct answer of each passed quiz.
export function fetchLeaderboard() {
  return fetchEntries('/api/leaderboard', 'quiz');
}

// Contributor points: 1 per question report, 10 per accepted proposed question.
export function fetchContributorsLeaderboard() {
  return fetchEntries('/api/leaderboard?type=contributors', 'contributors');
}

// Warm the cache in the background when the app loads so opening #/classement is instantaneous
if (typeof window !== 'undefined') {
  setTimeout(() => {
    fetchLeaderboard().catch(() => {});
    fetchContributorsLeaderboard().catch(() => {});
  }, 400);
}
