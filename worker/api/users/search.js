import { json, error } from '../lib/http.js';

// GET /api/users/search?q=…  — for the "invite an existing user" picker.
// Signed-in only. Matches on name only and never returns email: an email you
// already know is invited through the exact-match path in collaborators.js, so
// there's no reason to let a signed-in user resolve or enumerate addresses here.
export async function onRequestGet(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const q = (new URL(context.request.url).searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return json({ users: [] });

  const like = `%${q}%`;
  const { results } = await context.env.DB.prepare(
    `SELECT id, name FROM users
      WHERE id != ? AND name IS NOT NULL AND lower(name) LIKE ?
      ORDER BY name LIMIT 10`
  )
    .bind(user.id, like)
    .all();

  return json({ users: results });
}
