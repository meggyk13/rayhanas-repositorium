import { json, error } from './lib/http.js';

// GET /api/review — the weekly-review payload: every project the user is on
// with status Active or Waiting For, each with its incomplete steps.
export async function onRequestGet(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const db = context.env.DEFTER_DB;
  const projects = (await db.prepare(
    `SELECT p.id, p.title, p.project_type, p.status, p.deadline, pc.role
       FROM projects p
       JOIN project_collaborators pc ON pc.project_id = p.id AND pc.user_id = ?
      WHERE p.status IN ('Active', 'Waiting For')
      ORDER BY p.status, p.updated_at DESC`
  ).bind(user.id).all()).results;

  if (projects.length) {
    const ids = projects.map((p) => p.id);
    const placeholders = ids.map(() => '?').join(', ');
    const steps = (await db.prepare(
      `SELECT id, project_id, title, context
         FROM project_steps
        WHERE completed = 0 AND project_id IN (${placeholders})
        ORDER BY sort_order, created_at`
    ).bind(...ids).all()).results;

    const byProject = {};
    for (const s of steps) (byProject[s.project_id] ||= []).push(s);
    for (const p of projects) p.open_steps = byProject[p.id] || [];
  }

  return json({
    active: projects.filter((p) => p.status === 'Active'),
    waiting: projects.filter((p) => p.status === 'Waiting For'),
  });
}
