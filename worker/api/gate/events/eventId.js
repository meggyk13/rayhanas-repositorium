import { json, error, readJson } from '../../lib/http.js';
import { requireGate } from '../../lib/gate.js';
import { pick, isNonEmptyString, numOrNull } from '../../lib/validate.js';

// GET — event bundle: event + role + entries + collaborators.
export async function onRequestGet(context) {
  const { eventId } = context.params;
  const g = await requireGate(context, eventId, 'viewer');
  if (g.fail) return g.fail;

  const db = context.env.DB;
  const event = await db.prepare('SELECT * FROM gate_events WHERE id = ?').bind(eventId).first();
  const entries = (await db.prepare(
    'SELECT * FROM gate_log_entries WHERE gate_event_id = ? ORDER BY created_at'
  ).bind(eventId).all()).results;
  const collaborators = (await db.prepare(
    `SELECT gc.user_id, gc.role, gc.added_at, u.name, u.email
       FROM gate_event_collaborators gc JOIN users u ON u.id = gc.user_id
      WHERE gc.gate_event_id = ? ORDER BY gc.added_at`
  ).bind(eventId).all()).results;

  return json({ event: { ...event, role: g.role }, entries, collaborators });
}

// PATCH — editors and up. event_name / event_date / float_amount.
export async function onRequestPatch(context) {
  const { eventId } = context.params;
  const g = await requireGate(context, eventId, 'editor');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body) return error(400, 'Body required');

  const fields = pick(body, ['event_name', 'event_date', 'float_amount']);
  if ('event_name' in fields && !isNonEmptyString(fields.event_name)) {
    return error(400, 'event_name cannot be empty');
  }
  if ('event_name' in fields) fields.event_name = fields.event_name.trim();
  if ('float_amount' in fields) {
    fields.float_amount = numOrNull(fields.float_amount);
  }
  if (Object.keys(fields).length === 0) return error(400, 'Nothing to update');

  const cols = Object.keys(fields);
  await context.env.DB.prepare(
    `UPDATE gate_events SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`
  )
    .bind(...cols.map((c) => fields[c]), eventId)
    .run();

  const event = await context.env.DB.prepare('SELECT * FROM gate_events WHERE id = ?')
    .bind(eventId)
    .first();
  return json({ event: { ...event, role: g.role } });
}

// DELETE — owner only. Entries and collaborators cascade.
export async function onRequestDelete(context) {
  const { eventId } = context.params;
  const g = await requireGate(context, eventId, 'owner');
  if (g.fail) return g.fail;

  await context.env.DB.prepare('DELETE FROM gate_events WHERE id = ?').bind(eventId).run();
  return json({ ok: true });
}
