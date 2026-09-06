import { json, error, readJson } from '../lib/http.js';
import { isNonEmptyString } from '../lib/validate.js';

export async function onRequestPatch(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const body = await readJson(context.request);
  if (!body || !isNonEmptyString(body.name)) return error(400, 'Name required');

  const res = await context.env.DB.prepare(
    'UPDATE saved_patterns SET name = ? WHERE id = ? AND user_id = ?'
  )
    .bind(body.name.trim(), context.params.patternId, user.id)
    .run();
  if (!res.meta.changes) return error(404, 'Pattern not found');
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const res = await context.env.DB.prepare(
    'DELETE FROM saved_patterns WHERE id = ? AND user_id = ?'
  )
    .bind(context.params.patternId, user.id)
    .run();
  if (!res.meta.changes) return error(404, 'Pattern not found');
  return json({ ok: true });
}
