import { error } from './http.js';

const RANK = { viewer: 1, editor: 2, owner: 3 };

// 'owner' | 'editor' | 'viewer' | null — parallel to projectRole, since a gate
// event is not a project but shares the same collaboration shape.
export async function gateRole(env, eventId, userId) {
  if (!userId) return null;
  const row = await env.DB.prepare(
    'SELECT role FROM gate_event_collaborators WHERE gate_event_id = ? AND user_id = ?'
  )
    .bind(eventId, userId)
    .first();
  return row ? row.role : null;
}

export async function requireGate(context, eventId, min = 'viewer') {
  const user = context.data.user;
  if (!user) return { fail: error(401, 'Not signed in') };
  const role = await gateRole(context.env, eventId, user.id);
  if (!role) return { fail: error(404, 'Event not found') };
  if (RANK[role] < RANK[min]) return { fail: error(403, 'Not allowed') };
  return { user, role };
}
