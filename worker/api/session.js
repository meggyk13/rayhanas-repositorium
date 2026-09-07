// Populates context.data.user (or null) from the session cookie. Does NOT
// require auth — individual endpoints check. Sliding expiry: when a valid
// session is within a day of its window closing, push the expiry back out and
// tell the caller to refresh the cookie. An active user's session therefore
// never lapses, an idle one still expires after the full window, and the
// refresh costs one DB write per window rather than one per request.

import { SESSION_COOKIE, SESSION_TTL_DAYS } from './lib/constants.js';
import { readCookie, sessionCookie } from './lib/sessions.js';
import { sqlNow, parseSql } from './lib/time.js';

// Refresh only when this little of the window is left (was: refresh whenever
// more than a day had elapsed, i.e. a DB write + Set-Cookie on ~every request).
const REFRESH_WITHIN_MS = 86400 * 1000;

// Returns { slideCookie?: string } — the router appends slideCookie to the
// response if present.
export async function loadSession(context) {
  const { request, env } = context;
  context.data.user = null;
  context.data.sessionId = null;

  const sid = readCookie(request, SESSION_COOKIE);
  if (!sid) return {};

  const row = await env.DB.prepare(
    `SELECT s.expires_at AS expires_at,
            u.id, u.email, u.name, u.avatar_url, u.plan
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > datetime('now')`
  )
    .bind(sid)
    .first();

  if (!row) return {};

  context.data.user = {
    id: row.id,
    email: row.email,
    name: row.name,
    avatar_url: row.avatar_url,
    plan: row.plan,
  };
  context.data.sessionId = sid;

  const windowMs = SESSION_TTL_DAYS * 86400 * 1000;
  const remaining = parseSql(row.expires_at).getTime() - Date.now();
  if (remaining < REFRESH_WITHIN_MS) {
    await env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
      .bind(sqlNow(windowMs), sid)
      .run();
    return { slideCookie: sessionCookie(sid) };
  }

  return {};
}
