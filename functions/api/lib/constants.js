// Shared config for Brambletally's API.

export const SESSION_COOKIE = 'brambletally_session';
export const SESSION_TTL_DAYS = 30;      // sliding: each authenticated request can extend it
export const MAGIC_LINK_TTL_MIN = 15;
export const APP_PATH = '/tools/brambletally/';

// Overridable per-environment with MAIL_FROM. The domain must be
// verified in Resend before real sending works.
export const FROM_EMAIL = 'Brambletally <login@rayhanasrepositorium.com>';
