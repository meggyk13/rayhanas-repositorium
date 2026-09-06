import { error } from './http.js';

const RANK = { viewer: 1, editor: 2, owner: 3 };

// 'owner' | 'editor' | 'viewer' | null
export async function projectRole(env, projectId, userId) {
  if (!userId) return null;
  const row = await env.DEFTER_DB.prepare(
    'SELECT role FROM project_collaborators WHERE project_id = ? AND user_id = ?'
  )
    .bind(projectId, userId)
    .first();
  return row ? row.role : null;
}

// Guard for project routes. Returns { user, role } on success, or { fail: Response }.
// A caller with no role gets 404, not 403, so project existence doesn't leak.
export async function requireProject(context, projectId, min = 'viewer') {
  const user = context.data.user;
  if (!user) return { fail: error(401, 'Not signed in') };
  const role = await projectRole(context.env, projectId, user.id);
  if (!role) return { fail: error(404, 'Project not found') };
  if (RANK[role] < RANK[min]) return { fail: error(403, 'Not allowed') };
  return { user, role };
}

// Statement that marks a project as just-touched; add to a batch on child writes.
export const touchStmt = (env, projectId) =>
  env.DEFTER_DB
    .prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?")
    .bind(projectId);
