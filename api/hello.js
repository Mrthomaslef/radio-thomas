export default async function handler(req, res) {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  const r = await fetch(`${SUPABASE_URL}/rest/v1/hello?select=message&order=id.desc&limit=1`, {
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
  });
  if (!r.ok) {
    return res.status(502).json({ error: `Supabase error ${r.status}` });
  }

  const [row] = await r.json();
  res.status(200).json({ message: row ? row.message : 'Hello World (no rows)' });
}
