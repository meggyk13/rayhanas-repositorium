import { json, error } from '../lib/http.js';

// GET /api/users/search?q=…  — for the "invite an existing user" picker.
// Signed-in only. Matches name or email prefix/substring, capped at 10.
export async function onRequestGet(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const q = (new URL(context.request.url).searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return json({ users: [] });

  const like = `%${q}%`;
  const { results } = await context.env.DEFTER_DB.prepare(
    `SELECT id, name, email FROM users
      WHERE id != ? AND (lower(email) LIKE ? OR lower(name) LIKE ?)
      ORDER BY name LIMIT 10`
  )
    .bind(user.id, like, like)
    .all();

  return json({ users: results });
}
