import { json, error, readJson } from '../lib/http.js';
import { uuid } from '../lib/id.js';
import { STATUSES, isNonEmptyString } from '../lib/validate.js';

// GET /api/projects — every project the signed-in user collaborates on.
export async function onRequestGet(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  // Counts and the time-left sum are leaf-only: a step that has sub-steps is a
  // container whose state is derived, so it must not be tallied itself.
  const NOT_CONTAINER =
    's.id NOT IN (SELECT parent_step_id FROM project_steps WHERE parent_step_id IS NOT NULL)';
  const { results } = await context.env.DB.prepare(
    `SELECT p.*, pc.role,
            (SELECT COUNT(*) FROM project_steps s
              WHERE s.project_id = p.id AND ${NOT_CONTAINER}) AS step_count,
            (SELECT COUNT(*) FROM project_steps s
              WHERE s.project_id = p.id AND s.completed = 1 AND ${NOT_CONTAINER}) AS step_done,
            (SELECT COALESCE(SUM(s.estimate_minutes), 0) FROM project_steps s
              WHERE s.project_id = p.id AND s.completed = 0 AND ${NOT_CONTAINER}) AS open_estimate_minutes
       FROM projects p
       JOIN project_collaborators pc ON pc.project_id = p.id AND pc.user_id = ?
      ORDER BY p.updated_at DESC`
  )
    .bind(user.id)
    .all();

  return json({ projects: results });
}

// POST /api/projects — create a project; owner collaborator row is written in
// the same batch (the invariant SQLite can't enforce).
export async function onRequestPost(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const body = await readJson(context.request);
  if (!body) return error(400, 'Body required');

  if (!isNonEmptyString(body.title)) return error(400, 'Title required');

  const status = body.status ?? 'Active';
  if (!STATUSES.includes(status)) {
    return error(400, `status must be one of: ${STATUSES.join(', ')}`);
  }
  const category =
    typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null;

  const id = uuid();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO projects (id, owner_id, category, title, description, status, deadline, pickup_note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      user.id,
      category,
      body.title.trim(),
      body.description ?? null,
      status,
      body.deadline ?? null,
      body.pickup_note ?? null
    ),
    context.env.DB.prepare(
      "INSERT INTO project_collaborators (project_id, user_id, role) VALUES (?, ?, 'owner')"
    ).bind(id, user.id),
  ]);

  const project = await context.env.DB.prepare('SELECT * FROM projects WHERE id = ?')
    .bind(id)
    .first();

  return json(
    {
      project: {
        ...project,
        role: 'owner',
        step_count: 0,
        step_done: 0,
        open_estimate_minutes: 0,
      },
    },
    { status: 201 }
  );
}
