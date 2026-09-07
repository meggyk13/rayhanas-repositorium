import { error } from './http.js';

const RANK = { viewer: 1, editor: 2, owner: 3 };

// 'owner' | 'editor' | 'viewer' | null
export async function projectRole(env, projectId, userId) {
  if (!userId) return null;
  const row = await env.DB.prepare(
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
  env.DB
    .prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?")
    .bind(projectId);

// A container step (one with sub-steps) has no checkbox of its own — its
// completion follows its children. This statement recomputes that from the
// children's *current* rows, so add it to the batch AFTER the child write that
// triggered it. An emptied container reverts to a plain incomplete step.
// completed_at is preserved while it stays done, set on the transition to done,
// and cleared when it goes back to open.
export const parentRollupStmt = (env, parentStepId) =>
  env.DB
    .prepare(
      `UPDATE project_steps
          SET completed = (
                SELECT CASE
                         WHEN COUNT(*) > 0
                          AND SUM(CASE WHEN c.completed = 0 THEN 1 ELSE 0 END) = 0
                         THEN 1 ELSE 0 END
                  FROM project_steps c
                 WHERE c.parent_step_id = project_steps.id
              ),
              completed_at = CASE
                WHEN (
                  SELECT CASE
                           WHEN COUNT(*) > 0
                            AND SUM(CASE WHEN c.completed = 0 THEN 1 ELSE 0 END) = 0
                           THEN 1 ELSE 0 END
                    FROM project_steps c
                   WHERE c.parent_step_id = project_steps.id
                ) = 1
                THEN COALESCE(completed_at, datetime('now'))
                ELSE NULL
              END
        WHERE id = ?`
    )
    .bind(parentStepId);
