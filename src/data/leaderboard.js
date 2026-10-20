// Leaderboards are computed by the database (SQL functions get_leaderboard / get_contributors_leaderboard),
// so there is nothing to record or merge on the client: just read the two lists.

async function fetchEntries(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data?.entries) ? data.entries : [];
  } catch {
    return [];
  }
}

// Quiz points: 1 point per correct answer of each passed quiz.
export function fetchLeaderboard() {
  return fetchEntries('/api/leaderboard');
}

// Contributor points: 1 per question report, 10 per accepted proposed question.
export function fetchContributorsLeaderboard() {
  return fetchEntries('/api/leaderboard?type=contributors');
}
