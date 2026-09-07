import { json, error, readJson } from '../../lib/http.js';
import { uuid } from '../../lib/id.js';
import { requireProject, touchStmt } from '../../lib/projects.js';
import { isNonEmptyString, STEP_ESTIMATES } from '../../lib/validate.js';

export async function onRequestGet(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'viewer');
  if (g.fail) return g.fail;

  const { results } = await context.env.DB.prepare(
    'SELECT * FROM project_steps WHERE project_id = ? ORDER BY sort_order, created_at'
  )
    .bind(id)
    .all();
  return json({ steps: results });
}

export async function onRequestPost(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'editor');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body || !isNonEmptyString(body.title)) return error(400, 'Title required');

  // Optional: attach as a sub-step. Parent must be in this project and itself
  // top-level — steps nest one level only.
  let parentStepId = null;
  if (body.parent_step_id != null && body.parent_step_id !== '') {
    const parent = await context.env.DB.prepare(
      'SELECT parent_step_id FROM project_steps WHERE id = ? AND project_id = ?'
    )
      .bind(body.parent_step_id, id)
      .first();
    if (!parent) return error(400, 'parent_step_id is not a step in this project');
    if (parent.parent_step_id) return error(400, 'Steps only nest one level deep');
    parentStepId = body.parent_step_id;
  }

  let estimate = null;
  if (body.estimate_minutes != null && body.estimate_minutes !== '') {
    const n = Number(body.estimate_minutes);
    if (!STEP_ESTIMATES.includes(n)) return error(400, 'Invalid estimate_minutes');
    estimate = n;
  }

  const stepId = uuid();
  const batch = [
    context.env.DB.prepare(
      `INSERT INTO project_steps
         (id, project_id, parent_step_id, title, due_date, notes, estimate_minutes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      stepId,
      id,
      parentStepId,
      body.title.trim(),
      body.due_date ?? null,
      body.notes ?? null,
      estimate,
      Number(body.sort_order) || 0
    ),
    touchStmt(context.env, id),
  ];
  // A new open child means the parent can't be "all done".
  if (parentStepId) {
    batch.push(
      context.env.DB.prepare(
        "UPDATE project_steps SET completed = 0, completed_at = NULL WHERE id = ?"
      ).bind(parentStepId)
    );
  }
  await context.env.DB.batch(batch);

  const step = await context.env.DB.prepare('SELECT * FROM project_steps WHERE id = ?')
    .bind(stepId)
    .first();
  return json({ step }, { status: 201 });
}
