import { json, error, readJson } from '../../../lib/http.js';
import { uuid } from '../../../lib/id.js';
import { requireGate } from '../../../lib/gate.js';
import { numOrNull, intOrZero } from '../../../lib/validate.js';

export async function onRequestGet(context) {
  const { eventId } = context.params;
  const g = await requireGate(context, eventId, 'viewer');
  if (g.fail) return g.fail;

  const { results } = await context.env.DB.prepare(
    'SELECT * FROM gate_log_entries WHERE gate_event_id = ? ORDER BY created_at'
  )
    .bind(eventId)
    .all();
  return json({ entries: results });
}

// POST — { entry_type?, amount?, headcount?, meal_count?,
//          member_count?, nonmember_count?, under18_count?, notes? }
// entry_type defaults to 'group'.
export async function onRequestPost(context) {
  const { eventId } = context.params;
  const g = await requireGate(context, eventId, 'editor');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body) return error(400, 'Body required');

  const id = uuid();
  await context.env.DB.prepare(
    `INSERT INTO gate_log_entries
       (id, gate_event_id, entry_type, amount, headcount, meal_count,
        member_count, nonmember_count, under18_count, notes, logged_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      eventId,
      typeof body.entry_type === 'string' && body.entry_type.trim() ? body.entry_type.trim() : 'group',
      numOrNull(body.amount),
      numOrNull(body.headcount),
      numOrNull(body.meal_count),
      intOrZero(body.member_count),
      intOrZero(body.nonmember_count),
      intOrZero(body.under18_count),
      typeof body.notes === 'string' ? body.notes : null,
      g.user.id
    )
    .run();

  const entry = await context.env.DB.prepare('SELECT * FROM gate_log_entries WHERE id = ?')
    .bind(id)
    .first();
  return json({ entry }, { status: 201 });
}
