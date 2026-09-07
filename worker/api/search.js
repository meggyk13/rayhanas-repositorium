import { json, error } from './lib/http.js';

// GET /api/search?q=… — projects, steps and inbox items the user can see.
export async function onRequestGet(context) {
  const user = context.data.user;
  if (!user) return error(401, 'Not signed in');

  const q = (new URL(context.request.url).searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return json({ projects: [], steps: [], inbox: [] });
  const like = `%${q}%`;
  const db = context.env.DB;

  // ?1 = user id, ?2 = LIKE pattern
  const projects = (await db.prepare(
    `SELECT p.id, p.title, p.category, p.status, p.deadline, pc.role,
            (SELECT COUNT(*) FROM project_steps s WHERE s.project_id = p.id) AS step_count,
            (SELECT COUNT(*) FROM project_steps s WHERE s.project_id = p.id AND s.completed = 1) AS step_done
       FROM projects p
       JOIN project_collaborators pc ON pc.project_id = p.id AND pc.user_id = ?1
      WHERE lower(p.title) LIKE ?2
         OR lower(COALESCE(p.description, '')) LIKE ?2
         OR lower(COALESCE(p.pickup_note, '')) LIKE ?2
         OR lower(COALESCE(p.category, '')) LIKE ?2
      ORDER BY p.updated_at DESC
      LIMIT 25`
  )
    .bind(user.id, like)
    .all()).results;

  const steps = (await db.prepare(
    `SELECT s.id, s.title, s.completed, s.due_date, s.project_id, p.title AS project_title
       FROM project_steps s
       JOIN projects p ON p.id = s.project_id
       JOIN project_collaborators pc ON pc.project_id = p.id AND pc.user_id = ?1
      WHERE lower(s.title) LIKE ?2 OR lower(COALESCE(s.notes, '')) LIKE ?2
      ORDER BY s.completed, s.created_at DESC
      LIMIT 40`
  )
    .bind(user.id, like)
    .all()).results;

  const inbox = (await db.prepare(
    'SELECT id, text, created_at FROM inbox_items WHERE user_id = ?1 AND lower(text) LIKE ?2 LIMIT 20'
  )
    .bind(user.id, like)
    .all()).results;

  return json({ projects, steps, inbox });
}
