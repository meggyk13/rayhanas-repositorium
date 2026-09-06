import { json, error, readJson } from '../../../lib/http.js';
import { requireGate } from '../../../lib/gate.js';
import { COLLAB_ROLES } from '../../../lib/validate.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// GET — current collaborators. (No pending-invite table for gate events, so an
// invite only works if the person already has an account.)
export async function onRequestGet(context) {
  const { eventId } = context.params;
  const g = await requireGate(context, eventId, 'viewer');
  if (g.fail) return g.fail;

  const { results } = await context.env.DB.prepare(
    `SELECT gc.user_id, gc.role, gc.added_at, u.name, u.email
       FROM gate_event_collaborators gc JOIN users u ON u.id = gc.user_id
      WHERE gc.gate_event_id = ? ORDER BY gc.added_at`
  )
    .bind(eventId)
    .all();
  return json({ collaborators: results });
}

// POST — owner adds an existing user by userId or email. { userId?, email?, role }
export async function onRequestPost(context) {
  const { eventId } = context.params;
  const g = await requireGate(context, eventId, 'owner');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body || !COLLAB_ROLES.includes(body.role)) {
    return error(400, `role must be one of: ${COLLAB_ROLES.join(', ')}`);
  }
  const db = context.env.DB;

  let targetUserId = body.userId ?? null;
  if (!targetUserId && typeof body.email === 'string' && EMAIL_RE.test(body.email.trim())) {
    const row = await db.prepare('SELECT id FROM users WHERE email = ?')
      .bind(body.email.trim().toLowerCase())
      .first();
    if (!row) return error(404, 'No account with that email. They need to sign in once first.');
    targetUserId = row.id;
  }
  if (!targetUserId) return error(400, 'Provide userId or a valid email');
  if (targetUserId === g.user.id) return error(400, "You're already the owner");

  const user = await db.prepare('SELECT id, name, email FROM users WHERE id = ?')
    .bind(targetUserId)
    .first();
  if (!user) return error(404, 'User not found');

  await db.prepare(
    `INSERT INTO gate_event_collaborators (gate_event_id, user_id, role) VALUES (?, ?, ?)
     ON CONFLICT(gate_event_id, user_id) DO UPDATE SET role = excluded.role`
  )
    .bind(eventId, targetUserId, body.role)
    .run();

  return json({ collaborator: { user_id: user.id, name: user.name, email: user.email, role: body.role } });
}

// PATCH — owner changes a role. { userId, role }
export async function onRequestPatch(context) {
  const { eventId } = context.params;
  const g = await requireGate(context, eventId, 'owner');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body || !body.userId || !COLLAB_ROLES.includes(body.role)) {
    return error(400, 'userId and a valid role are required');
  }
  if (body.userId === g.user.id) return error(400, 'Use transfer to change the owner');

  const res = await context.env.DB.prepare(
    "UPDATE gate_event_collaborators SET role = ? WHERE gate_event_id = ? AND user_id = ? AND role != 'owner'"
  )
    .bind(body.role, eventId, body.userId)
    .run();
  if (!res.meta.changes) return error(404, 'Collaborator not found');
  return json({ ok: true });
}

// DELETE — owner removes someone. { userId }
export async function onRequestDelete(context) {
  const { eventId } = context.params;
  const g = await requireGate(context, eventId, 'owner');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body || !body.userId) return error(400, 'userId required');
  if (body.userId === g.user.id) return error(400, "The owner can't be removed");

  const res = await context.env.DB.prepare(
    "DELETE FROM gate_event_collaborators WHERE gate_event_id = ? AND user_id = ? AND role != 'owner'"
  )
    .bind(eventId, body.userId)
    .run();
  if (!res.meta.changes) return error(404, 'Collaborator not found');
  return json({ ok: true });
}
