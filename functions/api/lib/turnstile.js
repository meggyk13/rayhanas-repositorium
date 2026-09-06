// Cloudflare Turnstile server-side verification.
// If TURNSTILE_SECRET_KEY is unset the check is skipped (with a warning) so the
// API is testable before Turnstile is provisioned. Set the secret to enforce it.

export async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) {
    console.warn('[brambletally] TURNSTILE_SECRET_KEY not set — skipping bot check');
    return { ok: true, skipped: true };
  }
  if (!token) return { ok: false };

  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  if (ip) form.append('remoteip', ip);

  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: form,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: data.success === true };
}
