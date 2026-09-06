import { json, error, readJson } from '../../lib/http.js';
import { uuid } from '../../lib/id.js';
import { requireProject, touchStmt } from '../../lib/projects.js';
import { isNonEmptyString } from '../../lib/validate.js';

export async function onRequestGet(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'viewer');
  if (g.fail) return g.fail;

  const { results } = await context.env.DEFTER_DB.prepare(
    'SELECT * FROM project_supplies WHERE project_id = ? ORDER BY created_at'
  )
    .bind(id)
    .all();
  return json({ supplies: results });
}

export async function onRequestPost(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'editor');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body || !isNonEmptyString(body.name)) return error(400, 'Name required');

  const supplyId = uuid();
  await context.env.DEFTER_DB.batch([
    context.env.DEFTER_DB.prepare(
      `INSERT INTO project_supplies (id, project_id, name, acquired, cost, source)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      supplyId,
      id,
      body.name.trim(),
      body.acquired ? 1 : 0,
      body.cost == null ? null : Number(body.cost),
      body.source ?? null
    ),
    touchStmt(context.env, id),
  ]);

  const supply = await context.env.DEFTER_DB.prepare('SELECT * FROM project_supplies WHERE id = ?')
    .bind(supplyId)
    .first();
  return json({ supply }, { status: 201 });
}
