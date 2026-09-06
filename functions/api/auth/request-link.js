import { error, json, readJson } from '../lib/http.js';
import { uuid, randomToken, sha256Hex } from '../lib/id.js';
import { sqlNow } from '../lib/time.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { sendMagicLink } from '../lib/email.js';
import { MAGIC_LINK_TTL_MIN } from '../lib/constants.js';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function onRequestPost(context) {
  const { request, env } = context;

  const body = await readJson(request);
  if (!body || typeof body.email !== 'string') return error(400, 'Email required');

  const email = body.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return error(400, 'Enter a valid email address');

  const ts = await verifyTurnstile(env, body.turnstileToken, request.headers.get('CF-Connecting-IP'));
  if (!ts.ok) return error(400, 'Bot check failed. Reload the page and try again.');

  const token = randomToken(32);
  await env.DEFTER_DB.prepare(
    'INSERT INTO magic_links (id, email, token_hash, expires_at) VALUES (?, ?, ?, ?)'
  )
    .bind(uuid(), email, await sha256Hex(token), sqlNow(MAGIC_LINK_TTL_MIN * 60 * 1000))
    .run();

  const link = `${new URL(request.url).origin}/api/auth/callback?token=${token}`;
  const sent = await sendMagicLink(env, email, link);
  if (!sent.ok) return error(502, 'Could not send the email just now. Try again in a moment.');

  return json({ ok: true });
}
