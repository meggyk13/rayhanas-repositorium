import { json, error, readJson } from '../../lib/http.js';
import { uuid } from '../../lib/id.js';
import { requireProject } from '../../lib/projects.js';
import { COLLAB_ROLES } from '../../lib/validate.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// GET — current collaborators plus outstanding email invites.
export async function onRequestGet(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'viewer');
  if (g.fail) return g.fail;

  const db = context.env.DEFTER_DB;
  const collaborators = (await db.prepare(
    `SELECT pc.user_id, pc.role, pc.added_at, u.name, u.email
       FROM project_collaborators pc JOIN users u ON u.id = pc.user_id
      WHERE pc.project_id = ? ORDER BY pc.added_at`
  ).bind(id).all()).results;
  const invites = (await db.prepare(
    'SELECT id, email, role, created_at FROM pending_invites WHERE project_id = ? AND accepted_at IS NULL'
  ).bind(id).all()).results;

  return json({ collaborators, invites });
}

// POST — owner adds someone by userId or by email. { userId?, email?, role }
export async function onRequestPost(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'owner');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body || !COLLAB_ROLES.includes(body.role)) {
    return error(400, `role must be one of: ${COLLAB_ROLES.join(', ')}`);
  }
  const db = context.env.DEFTER_DB;

  let targetUserId = body.userId ?? null;
  if (!targetUserId && typeof body.email === 'string' && EMAIL_RE.test(body.email.trim())) {
    const email = body.email.trim().toLowerCase();
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) {
      targetUserId = existing.id;
    } else {
      await db.prepare(
        `INSERT INTO pending_invites (id, project_id, email, role, invited_by) VALUES (?, ?, ?, ?, ?)`
      ).bind(uuid(), id, email, body.role, g.user.id).run();
      return json({ ok: true, pending: true, email });
    }
  }
  if (!targetUserId) return error(400, 'Provide userId or a valid email');
  if (targetUserId === g.user.id) return error(400, "You're already the owner");

  const user = await db.prepare('SELECT id, name, email FROM users WHERE id = ?')
    .bind(targetUserId)
    .first();
  if (!user) return error(404, 'User not found');

  await db.prepare(
    `INSERT INTO project_collaborators (project_id, user_id, role) VALUES (?, ?, ?)
     ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role`
  ).bind(id, targetUserId, body.role).run();

  return json({ collaborator: { user_id: user.id, name: user.name, email: user.email, role: body.role } });
}

// PATCH — owner changes a collaborator's role. { userId, role }
export async function onRequestPatch(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'owner');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body || !body.userId || !COLLAB_ROLES.includes(body.role)) {
    return error(400, 'userId and a valid role are required');
  }
  if (body.userId === g.user.id) return error(400, "Use transfer to change the owner");

  const res = await context.env.DEFTER_DB.prepare(
    "UPDATE project_collaborators SET role = ? WHERE project_id = ? AND user_id = ? AND role != 'owner'"
  )
    .bind(body.role, id, body.userId)
    .run();
  if (!res.meta.changes) return error(404, 'Collaborator not found');
  return json({ ok: true });
}

// DELETE — owner removes a collaborator. { userId } in body.
export async function onRequestDelete(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'owner');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body || !body.userId) return error(400, 'userId required');
  if (body.userId === g.user.id) return error(400, "The owner can't be removed; transfer first");

  const res = await context.env.DEFTER_DB.prepare(
    "DELETE FROM project_collaborators WHERE project_id = ? AND user_id = ? AND role != 'owner'"
  )
    .bind(id, body.userId)
    .run();
  if (!res.meta.changes) return error(404, 'Collaborator not found');
  return json({ ok: true });
}
