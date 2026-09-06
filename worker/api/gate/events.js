import { json, error, readJson } from '../lib/http.js';
import { uuid } from '../lib/id.js';
import { isNonEmptyString } from '../lib/validate.js';

// GET /api/gate/events — saved gate events the signed-in user can see.
export async function onRequestGet(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const { results } = await context.env.DB.prepare(
    `SELECT e.*, gc.role,
            (SELECT COUNT(*) FROM gate_log_entries l WHERE l.gate_event_id = e.id) AS entry_count,
            (SELECT COALESCE(SUM(l.amount), 0) FROM gate_log_entries l WHERE l.gate_event_id = e.id) AS total
       FROM gate_events e
       JOIN gate_event_collaborators gc ON gc.gate_event_id = e.id AND gc.user_id = ?
      ORDER BY e.created_at DESC`
  )
    .bind(user.id)
    .all();

  return json({ events: results });
}

// POST /api/gate/events — { event_name, event_date?, float_amount? }
// Owner collaborator row written in the same batch.
export async function onRequestPost(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const body = await readJson(context.request);
  if (!body || !isNonEmptyString(body.event_name)) return error(400, 'event_name required');

  const id = uuid();
  await context.env.DB.batch([
    context.env.DB.prepare(
      'INSERT INTO gate_events (id, owner_id, event_name, event_date, float_amount) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      id,
      user.id,
      body.event_name.trim(),
      body.event_date ?? null,
      body.float_amount == null ? null : Number(body.float_amount)
    ),
    context.env.DB.prepare(
      "INSERT INTO gate_event_collaborators (gate_event_id, user_id, role) VALUES (?, ?, 'owner')"
    ).bind(id, user.id),
  ]);

  const event = await context.env.DB.prepare('SELECT * FROM gate_events WHERE id = ?')
    .bind(id)
    .first();
  return json({ event: { ...event, role: 'owner', entry_count: 0, total: 0 } }, { status: 201 });
}
