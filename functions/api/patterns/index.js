import { json, error, readJson } from '../lib/http.js';
import { uuid } from '../lib/id.js';
import { isNonEmptyString } from '../lib/validate.js';

const TOOLS = ['kaftan', 'salvar'];

// GET /api/patterns?tool=kaftan  — saved generator inputs for the signed-in user.
export async function onRequestGet(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const tool = new URL(context.request.url).searchParams.get('tool');
  const sql = tool
    ? 'SELECT * FROM saved_patterns WHERE user_id = ? AND tool = ? ORDER BY created_at DESC'
    : 'SELECT * FROM saved_patterns WHERE user_id = ? ORDER BY created_at DESC';
  const stmt = context.env.DEFTER_DB.prepare(sql);
  const { results } = await (tool ? stmt.bind(user.id, tool) : stmt.bind(user.id)).all();

  return json({
    patterns: results.map((p) => ({ ...p, input: safeParse(p.input_json) })),
  });
}

// POST — { tool, name, input }
export async function onRequestPost(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const body = await readJson(context.request);
  if (!body || !TOOLS.includes(body.tool)) return error(400, `tool must be one of: ${TOOLS.join(', ')}`);
  if (!isNonEmptyString(body.name)) return error(400, 'Name required');
  if (body.input == null || typeof body.input !== 'object') return error(400, 'input object required');

  const id = uuid();
  await context.env.DEFTER_DB.prepare(
    'INSERT INTO saved_patterns (id, user_id, tool, name, input_json) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, user.id, body.tool, body.name.trim(), JSON.stringify(body.input))
    .run();

  const row = await context.env.DEFTER_DB.prepare('SELECT * FROM saved_patterns WHERE id = ?')
    .bind(id)
    .first();
  return json({ pattern: { ...row, input: safeParse(row.input_json) } }, { status: 201 });
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
