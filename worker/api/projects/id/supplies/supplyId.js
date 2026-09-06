import { json, error, readJson } from '../../../lib/http.js';
import { requireProject, touchStmt } from '../../../lib/projects.js';
import { pick, isNonEmptyString } from '../../../lib/validate.js';

export async function onRequestPatch(context) {
  const { id, supplyId } = context.params;
  const g = await requireProject(context, id, 'editor');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body) return error(400, 'Body required');

  const fields = pick(body, ['name', 'acquired', 'cost', 'source', 'url']);
  if ('name' in fields && !isNonEmptyString(fields.name)) return error(400, 'Name cannot be empty');
  if ('name' in fields) fields.name = fields.name.trim();
  if ('acquired' in fields) fields.acquired = fields.acquired ? 1 : 0;
  if ('cost' in fields) fields.cost = fields.cost == null ? null : Number(fields.cost);
  if (Object.keys(fields).length === 0) return error(400, 'Nothing to update');

  const owned = await context.env.DB.prepare(
    'SELECT id FROM project_supplies WHERE id = ? AND project_id = ?'
  )
    .bind(supplyId, id)
    .first();
  if (!owned) return error(404, 'Supply not found');

  const cols = Object.keys(fields);
  await context.env.DB.batch([
    context.env.DB.prepare(
      `UPDATE project_supplies SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`
    ).bind(...cols.map((c) => fields[c]), supplyId),
    touchStmt(context.env, id),
  ]);

  const supply = await context.env.DB.prepare('SELECT * FROM project_supplies WHERE id = ?')
    .bind(supplyId)
    .first();
  return json({ supply });
}

export async function onRequestDelete(context) {
  const { id, supplyId } = context.params;
  const g = await requireProject(context, id, 'editor');
  if (g.fail) return g.fail;

  const res = await context.env.DB.prepare(
    'DELETE FROM project_supplies WHERE id = ? AND project_id = ?'
  )
    .bind(supplyId, id)
    .run();
  if (!res.meta.changes) return error(404, 'Supply not found');

  await touchStmt(context.env, id).run();
  return json({ ok: true });
}
