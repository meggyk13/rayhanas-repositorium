import { json, error, readJson } from '../lib/http.js';
import { isNonEmptyString } from '../lib/validate.js';

// PATCH /api/tool-state/:stateId — { name?, data? }
export async function onRequestPatch(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const body = await readJson(context.request);
  if (!body) return error(400, 'Body required');

  const sets = [];
  const args = [];
  if ('name' in body) {
    if (!isNonEmptyString(body.name)) return error(400, 'Name cannot be empty');
    sets.push('name = ?');
    args.push(body.name.trim());
  }
  if ('data' in body) {
    if (body.data == null || typeof body.data !== 'object') return error(400, 'data must be an object');
    sets.push('data_json = ?');
    args.push(JSON.stringify(body.data));
  }
  if (!sets.length) return error(400, 'Nothing to update');
  sets.push("updated_at = datetime('now')");

  const res = await context.env.DB.prepare(
    `UPDATE saved_tool_state SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`
  )
    .bind(...args, context.params.stateId, user.id)
    .run();
  if (!res.meta.changes) return error(404, 'Preset not found');
  return json({ ok: true });
}

export async function onRequestDelete(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const res = await context.env.DB.prepare(
    'DELETE FROM saved_tool_state WHERE id = ? AND user_id = ?'
  )
    .bind(context.params.stateId, user.id)
    .run();
  if (!res.meta.changes) return error(404, 'Preset not found');
  return json({ ok: true });
}
