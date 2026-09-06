// Shared config for Defter's API.

export const SESSION_COOKIE = 'defter_session';
export const SESSION_TTL_DAYS = 30;      // sliding: each authenticated request can extend it
export const MAGIC_LINK_TTL_MIN = 15;
export const APP_PATH = '/tools/defter/';

// Overridable per-environment with DEFTER_FROM_EMAIL. The domain must be
// verified in Resend before real sending works.
export const FROM_EMAIL = 'Defter <login@rayhanasrepositorium.com>';
