import { randomToken } from './id.js';
import { sqlNow } from './time.js';
import { SESSION_COOKIE, SESSION_TTL_DAYS } from './constants.js';

const MAX_AGE_SEC = SESSION_TTL_DAYS * 86400;

export async function createSession(env, userId) {
  const id = randomToken(32);
  const expiresAt = sqlNow(MAX_AGE_SEC * 1000);
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  )
    .bind(id, userId, expiresAt)
    .run();
  return { id, expiresAt };
}

export function sessionCookie(id, maxAgeSec = MAX_AGE_SEC) {
  return `${SESSION_COOKIE}=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`;
}

export function clearCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(/; */)) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx) === name) {
      return decodeURIComponent(part.slice(idx + 1));
    }
  }
  return null;
}
