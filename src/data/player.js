// The player's pseudo, kept in the browser so it is asked only once.
const NAME_KEY = 'radio-thomas:name';

export const readName = () => {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
};

export const saveName = (n) => {
  try { localStorage.setItem(NAME_KEY, n); } catch { /* private mode: ignore */ }
};
