import { json, error, readJson } from '../../../lib/http.js';
import { requireProject, touchStmt, parentRollupStmt } from '../../../lib/projects.js';
import { pick, isNonEmptyString, STEP_ESTIMATES } from '../../../lib/validate.js';

export async function onRequestPatch(context) {
  const { id, stepId } = context.params;
  const g = await requireProject(context, id, 'editor');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body) return error(400, 'Body required');

  const fields = pick(body, [
    'title',
    'completed',
    'due_date',
    'notes',
    'estimate_minutes',
    'sort_order',
  ]);
  if ('title' in fields && !isNonEmptyString(fields.title)) return error(400, 'Title cannot be empty');
  if ('title' in fields) fields.title = fields.title.trim();
  if ('completed' in fields) fields.completed = fields.completed ? 1 : 0;
  if ('sort_order' in fields) fields.sort_order = Number(fields.sort_order) || 0;
  if ('estimate_minutes' in fields) {
    if (fields.estimate_minutes == null || fields.estimate_minutes === '') {
      fields.estimate_minutes = null;
    } else {
      const n = Number(fields.estimate_minutes);
      if (!STEP_ESTIMATES.includes(n)) return error(400, 'Invalid estimate_minutes');
      fields.estimate_minutes = n;
    }
  }
  if (Object.keys(fields).length === 0) return error(400, 'Nothing to update');

  const step = await context.env.DB.prepare(
    'SELECT parent_step_id FROM project_steps WHERE id = ? AND project_id = ?'
  )
    .bind(stepId, id)
    .first();
  if (!step) return error(404, 'Step not found');

  const isContainer =
    (await context.env.DB.prepare(
      'SELECT 1 FROM project_steps WHERE parent_step_id = ? LIMIT 1'
    )
      .bind(stepId)
      .first()) != null;

  // A container's completion and estimate are derived from its sub-steps.
  if (isContainer && 'completed' in fields) {
    return error(400, "This step's completion follows its sub-steps");
  }
  if (isContainer && 'estimate_minutes' in fields) {
    return error(400, "This step's time estimate is the sum of its sub-steps");
  }

  const cols = Object.keys(fields);
  const assignments = cols.map((c) => `${c} = ?`);
  const binds = cols.map((c) => fields[c]);
  if ('completed' in fields) {
    // Stamp the completion time on the 0->1 transition, clear it on 1->0,
    // leave it alone if `completed` didn't actually change.
    assignments.push(
      `completed_at = CASE
         WHEN ? = 1 AND completed_at IS NULL THEN datetime('now')
         WHEN ? = 0 THEN NULL
         ELSE completed_at END`
    );
    binds.push(fields.completed, fields.completed);
  }

  const batch = [
    context.env.DB.prepare(
      `UPDATE project_steps SET ${assignments.join(', ')} WHERE id = ?`
    ).bind(...binds, stepId),
    touchStmt(context.env, id),
  ];
  // If this is a sub-step and its done-state moved, roll the parent up.
  if (step.parent_step_id && 'completed' in fields) {
    batch.push(parentRollupStmt(context.env, step.parent_step_id));
  }
  await context.env.DB.batch(batch);

  const updated = await context.env.DB.prepare('SELECT * FROM project_steps WHERE id = ?')
    .bind(stepId)
    .first();
  return json({ step: updated });
}

export async function onRequestDelete(context) {
  const { id, stepId } = context.params;
  const g = await requireProject(context, id, 'editor');
  if (g.fail) return g.fail;

  const step = await context.env.DB.prepare(
    'SELECT parent_step_id FROM project_steps WHERE id = ? AND project_id = ?'
  )
    .bind(stepId, id)
    .first();
  if (!step) return error(404, 'Step not found');

  const batch = [
    // Sub-steps first — don't rely on the self-referential FK cascade, which an
    // ALTER-added column may not enforce on an existing DB.
    context.env.DB.prepare('DELETE FROM project_steps WHERE parent_step_id = ?').bind(stepId),
    context.env.DB.prepare(
      'DELETE FROM project_steps WHERE id = ? AND project_id = ?'
    ).bind(stepId, id),
    touchStmt(context.env, id),
  ];
  if (step.parent_step_id) {
    batch.push(parentRollupStmt(context.env, step.parent_step_id));
  }
  await context.env.DB.batch(batch);

  return json({ ok: true });
}
