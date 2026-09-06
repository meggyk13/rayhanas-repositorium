import { json, error, readJson } from '../lib/http.js';
import { uuid } from '../lib/id.js';
import { isNonEmptyString } from '../lib/validate.js';

const DEFAULTS = ['A&S', 'Research', 'Office', 'Event prep', 'Household'];

// GET /api/categories — the signed-in user's category pick list. Lazy-seeds a
// starter set the first time.
export async function onRequestGet(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');
  const db = context.env.DB;

  const q = 'SELECT id, name, sort_order FROM categories WHERE user_id = ? ORDER BY sort_order, name';
  let { results } = await db.prepare(q).bind(user.id).all();

  if (!results.length) {
    await db.batch(
      DEFAULTS.map((name, i) =>
        db
          .prepare(
            'INSERT OR IGNORE INTO categories (id, user_id, name, sort_order) VALUES (?, ?, ?, ?)'
          )
          .bind(uuid(), user.id, name, i)
      )
    );
    ({ results } = await db.prepare(q).bind(user.id).all());
  }
  return json({ categories: results });
}

// POST /api/categories — { name }. Idempotent on name.
export async function onRequestPost(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');
  const body = await readJson(context.request);
  if (!body || !isNonEmptyString(body.name)) return error(400, 'Name required');
  const name = body.name.trim();
  const db = context.env.DB;

  const existing = await db
    .prepare('SELECT id, name, sort_order FROM categories WHERE user_id = ? AND name = ?')
    .bind(user.id, name)
    .first();
  if (existing) return json({ category: existing });

  const row = await db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE user_id = ?')
    .bind(user.id)
    .first();
  const sort = (row.m ?? -1) + 1;
  const id = uuid();
  await db
    .prepare('INSERT INTO categories (id, user_id, name, sort_order) VALUES (?, ?, ?, ?)')
    .bind(id, user.id, name, sort)
    .run();
  return json({ category: { id, name, sort_order: sort } }, { status: 201 });
}
