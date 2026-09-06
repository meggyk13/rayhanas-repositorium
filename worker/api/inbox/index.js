import { json, error, readJson } from '../lib/http.js';
import { uuid } from '../lib/id.js';
import { isNonEmptyString } from '../lib/validate.js';

export async function onRequestGet(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const { results } = await context.env.DB.prepare(
    'SELECT * FROM inbox_items WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(user.id)
    .all();
  return json({ items: results });
}

export async function onRequestPost(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const body = await readJson(context.request);
  if (!body || !isNonEmptyString(body.text)) return error(400, 'Text required');

  const id = uuid();
  await context.env.DB.prepare(
    'INSERT INTO inbox_items (id, user_id, text) VALUES (?, ?, ?)'
  )
    .bind(id, user.id, body.text.trim())
    .run();

  const item = await context.env.DB.prepare('SELECT * FROM inbox_items WHERE id = ?')
    .bind(id)
    .first();
  return json({ item }, { status: 201 });
}
