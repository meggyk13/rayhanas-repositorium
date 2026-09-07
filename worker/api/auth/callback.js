import { uuid, sha256Hex } from '../lib/id.js';
import { sqlNow } from '../lib/time.js';
import { createSession, sessionCookie } from '../lib/sessions.js';
import { APP_PATH } from '../lib/constants.js';

function redirect(location, cookie) {
  const res = new Response(null, { status: 302, headers: { Location: location } });
  if (cookie) res.headers.append('Set-Cookie', cookie);
  return res;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return redirect(`${APP_PATH}?auth=invalid`);

  // Claim the token in a single atomic UPDATE: two concurrent hits on the same
  // link (mail-scanner prefetch, double-click) can't both come back with a row.
  const link = await env.DB.prepare(
    `UPDATE magic_links SET used_at = ?
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')
      RETURNING id, email`
  )
    .bind(sqlNow(), await sha256Hex(token))
    .first();

  if (!link) return redirect(`${APP_PATH}?auth=invalid`);

  let user = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
    .bind(link.email)
    .first();

  if (!user) {
    const id = uuid();
    // DO NOTHING + re-select: if the same new address signed in twice at once,
    // whichever INSERT lands first wins and both requests resolve to that id.
    await env.DB.prepare(
      'INSERT INTO users (id, email, name) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING'
    )
      .bind(id, link.email, link.email.split('@')[0])
      .run();
    user = await env.DB.prepare('SELECT id FROM users WHERE email = ?')
      .bind(link.email)
      .first();
  }

  await resolvePendingInvites(env, link.email, user.id);

  const session = await createSession(env, user.id);
  return redirect(APP_PATH, sessionCookie(session.id));
}

// Turn any email invites for this address into real collaborator rows.
async function resolvePendingInvites(env, email, userId) {
  const { results } = await env.DB.prepare(
    'SELECT id, project_id, role FROM pending_invites WHERE email = ? AND accepted_at IS NULL'
  )
    .bind(email)
    .all();

  for (const inv of results) {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO project_collaborators (project_id, user_id, role) VALUES (?, ?, ?)
         ON CONFLICT(project_id, user_id) DO UPDATE SET role = excluded.role`
      ).bind(inv.project_id, userId, inv.role),
      env.DB.prepare('UPDATE pending_invites SET accepted_at = ? WHERE id = ?')
        .bind(sqlNow(), inv.id),
    ]);
  }
}
