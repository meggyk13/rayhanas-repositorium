// Shared config for Brambletally's API.

export const SESSION_COOKIE = 'brambletally_session';
export const SESSION_TTL_DAYS = 30;      // sliding: each authenticated request can extend it
export const MAGIC_LINK_TTL_MIN = 15;
export const APP_PATH = '/tools/brambletally/';

// Canonical public origin. Security-sensitive absolute URLs (the magic-link
// sign-in URL that gets emailed) must be built from this, never from the
// request's Host header. Override with APP_ORIGIN for local dev / staging.
export const CANONICAL_ORIGIN = 'https://rayhanasrepositorium.com';
export const appOrigin = (env) => (env && env.APP_ORIGIN) || CANONICAL_ORIGIN;

// Overridable per-environment with MAIL_FROM. The domain must be
// verified in Resend before real sending works.
export const FROM_EMAIL = 'Brambletally <login@rayhanasrepositorium.com>';
