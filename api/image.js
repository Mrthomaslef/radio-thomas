// GET /api/image?id=<32 hex> — serves an image uploaded from the admin page.
// The id is random and secret-by-obscurity; the table itself is not readable from the API.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }

  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!/^[a-f0-9]{32}$/.test(id)) return res.status(404).end();

  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return res.status(500).end();

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_quiz_image`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_id: id }),
    });
    if (!r.ok) return res.status(502).end();
    const row = await r.json();
    if (!row || !row.data_b64) return res.status(404).end();

    const bytes = Buffer.from(row.data_b64, 'base64');
    res.setHeader('Content-Type', row.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'");
    // The id never points to different bytes, so the browser may keep it for a year.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.status(200).send(bytes);
  } catch {
    return res.status(502).end();
  }
}
