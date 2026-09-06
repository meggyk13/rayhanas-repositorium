import { json, error, readJson } from '../lib/http.js';
import { isNonEmptyString } from '../lib/validate.js';

// PATCH — rename. The new name is propagated to the owner's projects that
// carry the old name (projects.category is denormalized).
export async function onRequestPatch(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');
  const body = await readJson(context.request);
  if (!body || !isNonEmptyString(body.name)) return error(400, 'Name required');
  const newName = body.name.trim();
  const db = context.env.DB;
  const { categoryId } = context.params;

  const cat = await db
    .prepare('SELECT name FROM categories WHERE id = ? AND user_id = ?')
    .bind(categoryId, user.id)
    .first();
  if (!cat) return error(404, 'Category not found');
  if (newName === cat.name) return json({ ok: true });

  const clash = await db
    .prepare('SELECT 1 FROM categories WHERE user_id = ? AND name = ? AND id != ?')
    .bind(user.id, newName, categoryId)
    .first();
  if (clash) return error(409, 'You already have a category with that name');

  await db.batch([
    db.prepare('UPDATE categories SET name = ? WHERE id = ? AND user_id = ?').bind(newName, categoryId, user.id),
    db.prepare('UPDATE projects SET category = ? WHERE owner_id = ? AND category = ?').bind(newName, user.id, cat.name),
  ]);
  return json({ ok: true });
}

// DELETE — removes the category; the owner's projects that used it become
// uncategorized.
export async function onRequestDelete(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');
  const db = context.env.DB;
  const { categoryId } = context.params;

  const cat = await db
    .prepare('SELECT name FROM categories WHERE id = ? AND user_id = ?')
    .bind(categoryId, user.id)
    .first();
  if (!cat) return error(404, 'Category not found');

  await db.batch([
    db.prepare('DELETE FROM categories WHERE id = ? AND user_id = ?').bind(categoryId, user.id),
    db.prepare('UPDATE projects SET category = NULL WHERE owner_id = ? AND category = ?').bind(user.id, cat.name),
  ]);
  return json({ ok: true });
}
