import { json, error, readJson } from '../../lib/http.js';
import { uuid } from '../../lib/id.js';
import { requireProject, touchStmt } from '../../lib/projects.js';
import { isNonEmptyString } from '../../lib/validate.js';

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

  const stepId = uuid();
  await context.env.DB.batch([
    context.env.DB.prepare(
      `INSERT INTO project_steps (id, project_id, title, due_date, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      stepId,
      id,
      body.title.trim(),
      body.due_date ?? null,
      body.notes ?? null,
      Number(body.sort_order) || 0
    ),
    touchStmt(context.env, id),
  ]);

  const step = await context.env.DB.prepare('SELECT * FROM project_steps WHERE id = ?')
    .bind(stepId)
    .first();
  return json({ step }, { status: 201 });
}
