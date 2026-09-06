export const STATUSES = ['Active', 'Waiting For', 'Someday', 'Paused', 'Done'];
export const COLLAB_ROLES = ['editor', 'viewer']; // 'owner' is only reachable via transfer

export const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;

// Copy only the listed keys that are actually present on the source.
export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
