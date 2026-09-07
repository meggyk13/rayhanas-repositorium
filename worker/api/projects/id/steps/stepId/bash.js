import { json, error, readJson } from '../../../../lib/http.js';
import { uuid } from '../../../../lib/id.js';
import { requireProject, touchStmt } from '../../../../lib/projects.js';

// POST /api/projects/:id/steps/:stepId/bash
// Break one step into sub-steps in a single round trip.
// Body: { titles: string[] } — one sub-step per entry. The target step becomes
// a container: its checkbox is derived from the children from here on.

const MAX_SUBSTEPS = 40;

export async function onRequestPost(context) {
  const { id, stepId } = context.params;
  const g = await requireProject(context, id, 'editor');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  const titles = Array.isArray(body?.titles)
    ? body.titles.map((t) => (typeof t === 'string' ? t.trim() : '')).filter(Boolean)
    : [];
  if (!titles.length) return error(400, 'Give at least one sub-step');
  if (titles.length > MAX_SUBSTEPS) {
    return error(400, `That's a lot — ${MAX_SUBSTEPS} sub-steps at most in one go`);
  }

  const target = await context.env.DB.prepare(
    'SELECT parent_step_id FROM project_steps WHERE id = ? AND project_id = ?'
  )
    .bind(stepId, id)
    .first();
  if (!target) return error(404, 'Step not found');
  if (target.parent_step_id) return error(400, "A sub-step can't be broken down further");

  // Append after any sub-steps this step already has.
  const row = await context.env.DB.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM project_steps WHERE parent_step_id = ?'
  )
    .bind(stepId)
    .first();
  let order = (row?.max_order ?? -1) + 1;

  const batch = titles.map((title) =>
    context.env.DB.prepare(
      `INSERT INTO project_steps (id, project_id, parent_step_id, title, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(uuid(), id, stepId, title, order++)
  );
  // Fresh open children -> the parent is no longer "done".
  batch.push(
    context.env.DB.prepare(
      "UPDATE project_steps SET completed = 0, completed_at = NULL WHERE id = ?"
    ).bind(stepId)
  );
  batch.push(touchStmt(context.env, id));
  await context.env.DB.batch(batch);

  const steps = (await context.env.DB.prepare(
    'SELECT * FROM project_steps WHERE project_id = ? ORDER BY sort_order, created_at'
  )
    .bind(id)
    .all()).results;
  return json({ steps }, { status: 201 });
}
