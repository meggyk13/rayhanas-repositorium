import { FROM_EMAIL, MAGIC_LINK_TTL_MIN } from './constants.js';

// Sends the magic-link email via Resend. If RESEND_API_KEY is unset the link is
// logged to the console instead, so sign-in is testable before Resend is set up.
export async function sendMagicLink(env, to, link) {
  const subject = 'Your Defter sign-in link';
  const text =
    `Here's your sign-in link for Defter:\n\n${link}\n\n` +
    `It works once and expires in ${MAGIC_LINK_TTL_MIN} minutes. ` +
    `If you didn't ask to sign in, ignore this email.`;

  const html =
    `<div style="font-family:-apple-system,system-ui,sans-serif;font-size:16px;line-height:1.5;color:#2D3436">` +
    `<p>Here's your sign-in link for Defter.</p>` +
    `<p><a href="${link}" style="color:#6B8E23">Sign in</a></p>` +
    `<p style="color:#6b7280;font-size:14px">It works once and expires in ${MAGIC_LINK_TTL_MIN} minutes. ` +
    `If you didn't ask to sign in, ignore this email.</p>` +
    `</div>`;

  if (!env.RESEND_API_KEY) {
    console.warn(`[defter] RESEND_API_KEY not set — magic link for ${to}:\n${link}`);
    return { ok: true, skipped: true };
  }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.DEFTER_FROM_EMAIL || FROM_EMAIL,
      to,
      subject,
      text,
      html,
    }),
  });

  if (!r.ok) {
    console.error('[defter] Resend send failed', r.status, await r.text().catch(() => ''));
    return { ok: false };
  }
  return { ok: true };
}
