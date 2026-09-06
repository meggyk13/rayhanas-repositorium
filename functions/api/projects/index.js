import { json, error, readJson } from '../lib/http.js';
import { uuid } from '../lib/id.js';
import { PROJECT_TYPES, STATUSES, isNonEmptyString } from '../lib/validate.js';

// GET /api/projects — every project the signed-in user collaborates on.
export async function onRequestGet(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const { results } = await context.env.DEFTER_DB.prepare(
    `SELECT p.*, pc.role,
            (SELECT COUNT(*) FROM project_steps s WHERE s.project_id = p.id) AS step_count,
            (SELECT COUNT(*) FROM project_steps s WHERE s.project_id = p.id AND s.completed = 1) AS step_done
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

  if (!PROJECT_TYPES.includes(body.project_type)) {
    return error(400, `project_type must be one of: ${PROJECT_TYPES.join(', ')}`);
  }
  if (!isNonEmptyString(body.title)) return error(400, 'Title required');

  const status = body.status ?? 'Active';
  if (!STATUSES.includes(status)) {
    return error(400, `status must be one of: ${STATUSES.join(', ')}`);
  }

  const id = uuid();
  await context.env.DEFTER_DB.batch([
    context.env.DEFTER_DB.prepare(
      `INSERT INTO projects (id, owner_id, project_type, title, description, status, deadline)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      user.id,
      body.project_type,
      body.title.trim(),
      body.description ?? null,
      status,
      body.deadline ?? null
    ),
    context.env.DEFTER_DB.prepare(
      "INSERT INTO project_collaborators (project_id, user_id, role) VALUES (?, ?, 'owner')"
    ).bind(id, user.id),
  ]);

  const project = await context.env.DEFTER_DB.prepare('SELECT * FROM projects WHERE id = ?')
    .bind(id)
    .first();

  return json({ project: { ...project, role: 'owner', step_count: 0, step_done: 0 } }, { status: 201 });
}
