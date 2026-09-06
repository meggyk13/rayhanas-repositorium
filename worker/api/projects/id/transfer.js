import { json, error, readJson } from '../../lib/http.js';
import { uuid } from '../../lib/id.js';
import { requireProject } from '../../lib/projects.js';

// POST /api/projects/:id/transfer  { toUserId }
// New owner is promoted, the old owner drops to editor, and the move is logged.
export async function onRequestPost(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'owner');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body || !body.toUserId) return error(400, 'toUserId required');
  if (body.toUserId === g.user.id) return error(400, "You're already the owner");

  const db = context.env.DB;
  const target = await db.prepare(
    'SELECT role FROM project_collaborators WHERE project_id = ? AND user_id = ?'
  )
    .bind(id, body.toUserId)
    .first();
  if (!target) return error(400, 'That person must be a collaborator first');

  await db.batch([
    db.prepare('UPDATE projects SET owner_id = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(body.toUserId, id),
    db.prepare(
      `INSERT INTO project_collaborators (project_id, user_id, role) VALUES (?, ?, 'owner')
       ON CONFLICT(project_id, user_id) DO UPDATE SET role = 'owner'`
    ).bind(id, body.toUserId),
    db.prepare(
      "UPDATE project_collaborators SET role = 'editor' WHERE project_id = ? AND user_id = ?"
    ).bind(id, g.user.id),
    db.prepare(
      `INSERT INTO ownership_transfer_log (id, project_id, from_user_id, to_user_id)
       VALUES (?, ?, ?, ?)`
    ).bind(uuid(), id, g.user.id, body.toUserId),
  ]);

  return json({ ok: true, owner_id: body.toUserId });
}
