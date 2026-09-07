-- Dev-only seed data for the local D1 database.
-- Populates the "Next" page for dev@test.local with steps in every due-bucket.
--
-- Apply:  wrangler d1 execute brambletally-db --local --file=./migrations/seed_dev_next.sql
-- Remove: wrangler d1 execute brambletally-db --local --command "DELETE FROM project_steps WHERE id LIKE 'seed-%'; DELETE FROM project_collaborators WHERE project_id LIKE 'seed-%'; DELETE FROM projects WHERE id LIKE 'seed-%';"
--
-- All rows use ids prefixed 'seed-' so they are easy to find and delete.
-- Dates assume "today" is 2026-09-07.

DELETE FROM project_steps         WHERE id LIKE 'seed-%';
DELETE FROM project_collaborators WHERE project_id LIKE 'seed-%';
DELETE FROM projects              WHERE id LIKE 'seed-%';

-- ── Projects (owned by dev@test.local) ───────────────────────────────────
INSERT INTO projects (id, owner_id, category, title, description, status, deadline, pickup_note) VALUES
  ('seed-proj-caftan',  '2227b9a8-0946-4165-ad9f-16cf2510f5b7', 'Sewing',   'Ottoman caftan — winter weight', 'Lined wool caftan for Twelfth Night.', 'Active', '2026-10-15', 'Wool is prewashed and folded on the cutting table.'),
  ('seed-proj-display', '2227b9a8-0946-4165-ad9f-16cf2510f5b7', 'Research', 'Kingdom A&S display board',       'Tri-fold board on Ottoman block printing.', 'Active', '2026-09-20', NULL),
  ('seed-proj-feast',   '2227b9a8-0946-4165-ad9f-16cf2510f5b7', 'Events',   'Feast gear inventory',            NULL, 'Active', NULL, NULL),
  ('seed-proj-trim',    '2227b9a8-0946-4165-ad9f-16cf2510f5b7', 'Sewing',   'Card-woven trim — green dress',   'Silk card weaving to edge the neckline.', 'Active', NULL, NULL);

INSERT INTO project_collaborators (project_id, user_id, role) VALUES
  ('seed-proj-caftan',  '2227b9a8-0946-4165-ad9f-16cf2510f5b7', 'owner'),
  ('seed-proj-display', '2227b9a8-0946-4165-ad9f-16cf2510f5b7', 'owner'),
  ('seed-proj-feast',   '2227b9a8-0946-4165-ad9f-16cf2510f5b7', 'owner'),
  ('seed-proj-trim',    '2227b9a8-0946-4165-ad9f-16cf2510f5b7', 'owner');

-- ── Parent steps ────────────────────────────────────────────────────────
INSERT INTO project_steps (id, project_id, parent_step_id, title, completed, due_date, estimate_minutes, sort_order) VALUES
  -- caftan
  ('seed-step-caftan-press',  'seed-proj-caftan',  NULL, 'Wash and press the wool',      0, '2026-09-02', 30,  0),  -- overdue
  ('seed-step-caftan-cut',    'seed-proj-caftan',  NULL, 'Cut the body panels',         0, '2026-09-07', 120, 1),  -- today
  ('seed-step-caftan-seams',  'seed-proj-caftan',  NULL, 'Sew the shoulder seams',      0, '2026-09-10', 60,  2),  -- this week
  ('seed-step-caftan-hem',    'seed-proj-caftan',  NULL, 'Hand-finish the hem',         0, '2026-09-25', 240, 3),  -- later
  -- display board
  ('seed-step-display-text',  'seed-proj-display', NULL, 'Draft the panel text',        0, '2026-09-05', 60,  0),  -- overdue
  ('seed-step-display-print', 'seed-proj-display', NULL, 'Print photos at the library', 0, '2026-09-07', 15,  1),  -- today
  ('seed-step-display-mount', 'seed-proj-display', NULL, 'Mount everything on foamcore',0, NULL,         120, 2),  -- no date
  -- feast gear
  ('seed-step-feast-count',   'seed-proj-feast',   NULL, 'Count the serving platters',  0, NULL,         15,  0),  -- no date
  ('seed-step-feast-list',    'seed-proj-feast',   NULL, 'List what is cracked or missing', 0, '2026-09-12', 30, 1), -- this week
  -- trim
  ('seed-step-trim-pattern',  'seed-proj-trim',    NULL, 'Pick the threading pattern',  0, '2026-08-28', 15,  0),  -- overdue
  ('seed-step-trim-warp',     'seed-proj-trim',    NULL, 'Wind and thread the warp',    0, '2026-10-01', 120, 1);  -- later

-- ── Sub-steps ("bash" the "Cut the body panels" step) ───────────────────
INSERT INTO project_steps (id, project_id, parent_step_id, title, completed, due_date, estimate_minutes, sort_order) VALUES
  ('seed-step-caftan-cut-a', 'seed-proj-caftan', 'seed-step-caftan-cut', 'Lay out the pattern pieces', 0, '2026-09-07', 30, 0),
  ('seed-step-caftan-cut-b', 'seed-proj-caftan', 'seed-step-caftan-cut', 'Mark seam allowances',       0, '2026-09-07', 15, 1);
