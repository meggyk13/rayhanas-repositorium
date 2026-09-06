import { json, error, readJson } from '../../../lib/http.js';
import { requireProject, touchStmt } from '../../../lib/projects.js';
import { STEP_CONTEXTS, pick, isNonEmptyString } from '../../../lib/validate.js';

export async function onRequestPatch(context) {
  const { id, stepId } = context.params;
  const g = await requireProject(context, id, 'editor');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body) return error(400, 'Body required');

  const fields = pick(body, ['title', 'context', 'completed', 'due_date', 'notes', 'sort_order']);
  if ('title' in fields && !isNonEmptyString(fields.title)) return error(400, 'Title cannot be empty');
  if ('title' in fields) fields.title = fields.title.trim();
  if ('context' in fields && fields.context != null && !STEP_CONTEXTS.includes(fields.context)) {
    return error(400, 'Invalid context');
  }
  if ('completed' in fields) fields.completed = fields.completed ? 1 : 0;
  if ('sort_order' in fields) fields.sort_order = Number(fields.sort_order) || 0;
  if (Object.keys(fields).length === 0) return error(400, 'Nothing to update');

  const cols = Object.keys(fields);
  const owned = await context.env.DB.prepare(
    'SELECT id FROM project_steps WHERE id = ? AND project_id = ?'
  )
    .bind(stepId, id)
    .first();
  if (!owned) return error(404, 'Step not found');

  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE project_steps SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`
    ).bind(...cols.map((c) => fields[c]), stepId),
    touchStmt(context.env, id),
  ]);

  const step = await context.env.DB.prepare('SELECT * FROM project_steps WHERE id = ?')
    .bind(stepId)
    .first();
  return json({ step });
}

export async function onRequestDelete(context) {
  const { id, stepId } = context.params;
  const g = await requireProject(context, id, 'editor');
  if (g.fail) return g.fail;

  const res = await context.env.DB.prepare(
    'DELETE FROM project_steps WHERE id = ? AND project_id = ?'
  )
    .bind(stepId, id)
    .run();
  if (!res.meta.changes) return error(404, 'Step not found');

  await touchStmt(context.env, id).run();
  return json({ ok: true });
}
