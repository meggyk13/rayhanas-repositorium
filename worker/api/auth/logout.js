import { json } from '../lib/http.js';
import { readCookie, clearCookie } from '../lib/sessions.js';
import { SESSION_COOKIE } from '../lib/constants.js';

export async function onRequestPost(context) {
  const { request, env } = context;
  const sid = readCookie(request, SESSION_COOKIE);
  if (sid) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
  }
  const res = json({ ok: true });
  res.headers.append('Set-Cookie', clearCookie());
  return res;
}
