// Runs for every /api/* request. Populates context.data.user (or null) from the
// session cookie. It does NOT require auth — individual endpoints check.
// Sliding expiry: when a valid session is within a day of its window closing,
// push the expiry back out and refresh the cookie.

import { SESSION_COOKIE, SESSION_TTL_DAYS } from './lib/constants.js';
import { readCookie, sessionCookie } from './lib/sessions.js';
import { sqlNow, parseSql } from './lib/time.js';

export async function onRequest(context) {
  const { request, env } = context;
  context.data.user = null;
  context.data.sessionId = null;

  const sid = readCookie(request, SESSION_COOKIE);
  if (!sid) return context.next();

  const row = await env.DB.prepare(
    `SELECT s.expires_at AS expires_at,
            u.id, u.email, u.name, u.avatar_url
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > datetime('now')`
  )
    .bind(sid)
    .first();

  if (!row) return context.next();

  context.data.user = {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar_url: row.avatar_url,
  };
  context.data.sessionId = sid;

  const windowMs = SESSION_TTL_DAYS * 86400 * 1000;
  const remaining = parseSql(row.expires_at).getTime() - Date.now();
  if (remaining < windowMs - 86400 * 1000) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
      .bind(sqlNow(windowMs), sid)
      .run();
    const res = await context.next();
    res.headers.append('Set-Cookie', sessionCookie(sid));
    return res;
  }

  return context.next();
}
