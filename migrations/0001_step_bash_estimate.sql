-- 0001_step_bash_estimate.sql
-- Sub-steps ("bash"), per-step time estimates, and completion timestamps.
--
-- Apply (local dev sqlite file):
--   npx wrangler d1 execute brambletally-db --local --file=./migrations/0001_step_bash_estimate.sql
-- Apply (production):
--   npx wrangler d1 execute brambletally-db --remote --file=./migrations/0001_step_bash_estimate.sql
--
-- Existing rows get NULL for all three columns. Steps already marked complete
-- keep completed_at = NULL (unknown), which the weekly-review count reads as
-- "not in the last 7 days".

ALTER TABLE project_steps
  ADD COLUMN parent_step_id TEXT REFERENCES project_steps(id) ON DELETE CASCADE;

ALTER TABLE project_steps
  ADD COLUMN estimate_minutes INTEGER;   -- NULL = no estimate; else one of 5/15/30/60/120/240/480

ALTER TABLE project_steps
  ADD COLUMN completed_at TEXT;          -- ISO datetime; set when `completed` flips to 1, cleared on 0

CREATE INDEX idx_steps_parent ON project_steps(parent_step_id);
