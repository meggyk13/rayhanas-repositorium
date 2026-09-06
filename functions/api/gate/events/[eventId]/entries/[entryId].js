import { json, error, readJson } from '../../../../lib/http.js';
import { requireGate } from '../../../../lib/gate.js';
import { pick } from '../../../../lib/validate.js';

export async function onRequestPatch(context) {
  const { eventId, entryId } = context.params;
  const g = await requireGate(context, eventId, 'editor');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body) return error(400, 'Body required');

  const fields = pick(body, ['entry_type', 'amount', 'headcount', 'meal_count', 'notes']);
  for (const k of ['amount', 'headcount', 'meal_count']) {
    if (k in fields) fields[k] = fields[k] == null ? null : Number(fields[k]);
  }
  if (Object.keys(fields).length === 0) return error(400, 'Nothing to update');

  const owned = await context.env.DB.prepare(
    'SELECT id FROM gate_log_entries WHERE id = ? AND gate_event_id = ?'
  )
    .bind(entryId, eventId)
    .first();
  if (!owned) return error(404, 'Entry not found');

  const cols = Object.keys(fields);
  await context.env.DB.prepare(
    `UPDATE gate_log_entries SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`
  )
    .bind(...cols.map((c) => fields[c]), entryId)
    .run();

  const entry = await context.env.DB.prepare('SELECT * FROM gate_log_entries WHERE id = ?')
    .bind(entryId)
    .first();
  return json({ entry });
}

export async function onRequestDelete(context) {
  const { eventId, entryId } = context.params;
  const g = await requireGate(context, eventId, 'editor');
  if (g.fail) return g.fail;

  const res = await context.env.DB.prepare(
    'DELETE FROM gate_log_entries WHERE id = ? AND gate_event_id = ?'
  )
    .bind(entryId, eventId)
    .run();
  if (!res.meta.changes) return error(404, 'Entry not found');
  return json({ ok: true });
}
