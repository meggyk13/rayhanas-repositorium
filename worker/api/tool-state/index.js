import { json, error, readJson } from '../lib/http.js';
import { uuid } from '../lib/id.js';
import { isNonEmptyString } from '../lib/validate.js';

export const TOOLS = ['salvar', 'caftan', 'war-food', 'award-rec', 'packing-list'];

// GET /api/tool-state?tool=salvar — the user's saved presets for one tool.
export async function onRequestGet(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const tool = new URL(context.request.url).searchParams.get('tool');
  if (!TOOLS.includes(tool)) return error(400, 'Unknown tool');

  const { results } = await context.env.DB.prepare(
    'SELECT id, tool, name, data_json, created_at, updated_at FROM saved_tool_state WHERE user_id = ? AND tool = ? ORDER BY updated_at DESC'
  )
    .bind(user.id, tool)
    .all();

  return json({
    states: results.map((s) => ({ ...s, data: safeParse(s.data_json), data_json: undefined })),
  });
}

// POST /api/tool-state — { tool, name, data }
export async function onRequestPost(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const body = await readJson(context.request);
  if (!body || !TOOLS.includes(body.tool)) return error(400, 'Unknown tool');
  if (!isNonEmptyString(body.name)) return error(400, 'Name required');
  if (body.data == null || typeof body.data !== 'object') return error(400, 'data object required');

  const id = uuid();
  await context.env.DB.prepare(
    'INSERT INTO saved_tool_state (id, user_id, tool, name, data_json) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, user.id, body.tool, body.name.trim(), JSON.stringify(body.data))
    .run();

  const row = await context.env.DB.prepare(
    'SELECT id, tool, name, data_json, created_at, updated_at FROM saved_tool_state WHERE id = ?'
  )
    .bind(id)
    .first();
  return json({ state: { ...row, data: safeParse(row.data_json), data_json: undefined } }, { status: 201 });
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
