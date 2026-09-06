import { json, error, readJson } from '../../lib/http.js';
import { uuid } from '../../lib/id.js';
import { requireProject, touchStmt } from '../../lib/projects.js';
import { isNonEmptyString } from '../../lib/validate.js';

// Viewers can read the journal; editors and up can post. (Locked decision.)
export async function onRequestGet(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'viewer');
  if (g.fail) return g.fail;

  const { results } = await context.env.DB.prepare(
    `SELECT j.*, u.name AS author_name
       FROM project_journal j JOIN users u ON u.id = j.user_id
      WHERE j.project_id = ? ORDER BY j.created_at DESC`
  )
    .bind(id)
    .all();
  return json({ journal: results });
}

export async function onRequestPost(context) {
  const { id } = context.params;
  const g = await requireProject(context, id, 'editor');
  if (g.fail) return g.fail;

  const body = await readJson(context.request);
  if (!body || !isNonEmptyString(body.text)) return error(400, 'Text required');

  const entryId = uuid();
  await context.env.DB.batch([
    context.env.DB.prepare(
      'INSERT INTO project_journal (id, project_id, user_id, text) VALUES (?, ?, ?, ?)'
    ).bind(entryId, id, g.user.id, body.text.trim()),
    touchStmt(context.env, id),
  ]);

  const entry = await context.env.DB.prepare(
    `SELECT j.*, u.name AS author_name
       FROM project_journal j JOIN users u ON u.id = j.user_id
      WHERE j.id = ?`
  )
    .bind(entryId)
    .first();
  return json({ entry }, { status: 201 });
}
