export const STATUSES = ['Active', 'Waiting For', 'Someday', 'Paused', 'Done'];
export const COLLAB_ROLES = ['editor', 'viewer']; // 'owner' is only reachable via transfer

// Allowed values for project_steps.estimate_minutes — the stepped "time needed"
// slider on the client. NULL/absent means "no estimate".
export const STEP_ESTIMATES = [5, 15, 30, 60, 120, 240, 480]; // 480 = "day+"

export const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

// Numeric coercion for optional columns. Non-numeric / non-finite input becomes
// null (or 0 for the count columns) instead of NaN — D1's .bind() throws on NaN,
// which would turn a bad field into a 500 instead of a stored no-op.
export const numOrNull = (v) => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const intOrZero = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

// Copy only the listed keys that are actually present on the source.
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
