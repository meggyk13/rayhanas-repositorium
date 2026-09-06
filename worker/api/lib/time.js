// SQLite's datetime('now') emits "YYYY-MM-DD HH:MM:SS" in UTC. App-computed
// timestamps must match that exact shape so string comparisons in SQL stay correct.

export const sqlNow = (offsetMs = 0) =>
  new Date(Date.now() + offsetMs).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

export const parseSql = (s) => new Date(s.replace(' ', 'T') + 'Z');
