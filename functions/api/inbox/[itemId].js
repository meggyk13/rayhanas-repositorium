import { json, error, readJson } from '../lib/http.js';
import { isNonEmptyString } from '../lib/validate.js';

export async function onRequestPatch(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const body = await readJson(context.request);
  if (!body || !isNonEmptyString(body.text)) return error(400, 'Text required');

  const res = await context.env.DEFTER_DB.prepare(
    'UPDATE inbox_items SET text = ? WHERE id = ? AND user_id = ?'
  )
    .bind(body.text.trim(), context.params.itemId, user.id)
    .run();
  if (!res.meta.changes) return error(404, 'Item not found');
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const res = await context.env.DEFTER_DB.prepare(
    'DELETE FROM inbox_items WHERE id = ? AND user_id = ?'
  )
    .bind(context.params.itemId, user.id)
    .run();
  if (!res.meta.changes) return error(404, 'Item not found');
  return json({ ok: true });
}
