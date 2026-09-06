import { json, error, readJson } from '../lib/http.js';
import { requireProject } from '../lib/projects.js';
import { PROJECT_TYPES, STATUSES, pick, isNonEmptyString } from '../lib/validate.js';

// GET /api/projects/:id — full bundle for the detail view.
export async function onRequestGet(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'viewer');
  if (g.fail) return g.fail;

  const db = context.env.DEFTER_DB;
  const project = await db.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
  const steps = (await db.prepare(
    'SELECT * FROM project_steps WHERE project_id = ? ORDER BY sort_order, created_at'
  ).bind(id).all()).results;
  const supplies = (await db.prepare(
    'SELECT * FROM project_supplies WHERE project_id = ? ORDER BY created_at'
  ).bind(id).all()).results;
  const journal = (await db.prepare(
    `SELECT j.*, u.name AS author_name
       FROM project_journal j JOIN users u ON u.id = j.user_id
      WHERE j.project_id = ? ORDER BY j.created_at DESC`
  ).bind(id).all()).results;
  const collaborators = (await db.prepare(
    `SELECT pc.user_id, pc.role, pc.added_at, u.name, u.email
       FROM project_collaborators pc JOIN users u ON u.id = pc.user_id
      WHERE pc.project_id = ? ORDER BY pc.added_at`
  ).bind(id).all()).results;

  return json({ project: { ...project, role: g.role }, steps, supplies, journal, collaborators });
}

// PATCH /api/projects/:id — editors and up.
export async function onRequestPatch(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'editor');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body) return error(400, 'Body required');

  const fields = pick(body, ['title', 'description', 'status', 'deadline', 'project_type']);
  if ('title' in fields && !isNonEmptyString(fields.title)) return error(400, 'Title cannot be empty');
  if ('title' in fields) fields.title = fields.title.trim();
  if ('status' in fields && !STATUSES.includes(fields.status)) return error(400, 'Invalid status');
  if ('project_type' in fields && !PROJECT_TYPES.includes(fields.project_type)) {
    return error(400, 'Invalid project_type');
  }
  if (Object.keys(fields).length === 0) return error(400, 'Nothing to update');

  const cols = Object.keys(fields);
  const set = cols.map((c) => `${c} = ?`).join(', ');
  await context.env.DEFTER_DB.prepare(
    `UPDATE projects SET ${set}, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(...cols.map((c) => fields[c]), id)
    .run();

  const project = await context.env.DEFTER_DB.prepare('SELECT * FROM projects WHERE id = ?')
    .bind(id)
    .first();
  return json({ project: { ...project, role: g.role } });
}

// DELETE /api/projects/:id — owner only. Children cascade.
export async function onRequestDelete(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'owner');
  if (g.fail) return g.fail;

  await context.env.DEFTER_DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
