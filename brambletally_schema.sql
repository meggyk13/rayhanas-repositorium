-- Brambletally — D1 schema
-- Run with: wrangler d1 execute brambletally-db --file=./brambletally_schema.sql
-- (create the DB first: wrangler d1 create brambletally-db)

PRAGMA foreign_keys = ON;

-- ── Auth ─────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id            TEXT PRIMARY KEY,        -- uuid
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  avatar_url    TEXT,
  plan          TEXT NOT NULL DEFAULT 'free',  -- tier hook; nothing is gated yet
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,        -- random token, stored as httpOnly cookie
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE magic_links (
  id            TEXT PRIMARY KEY,        -- uuid
  email         TEXT NOT NULL,           -- may not have a user row yet
  token_hash    TEXT NOT NULL,           -- sha256 of the token sent via email
  expires_at    TEXT NOT NULL,
  used_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_magic_links_email ON magic_links(email);

-- ── Projects ─────────────────────────────────────────────────────────────

-- Per-user pick list for the project "category" field. Managed by the owner;
-- the chosen name is denormalized onto projects.category.
CREATE TABLE categories (
  id            TEXT PRIMARY KEY,        -- uuid
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, name)
);
CREATE INDEX idx_categories_user ON categories(user_id);

CREATE TABLE projects (
  id            TEXT PRIMARY KEY,        -- uuid
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category      TEXT,                    -- free-form name, nullable; picked from the owner's categories
  title         TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'Active'
                  CHECK(status IN ('Active','Waiting For','Someday','Paused','Done')),
  deadline      TEXT,                    -- ISO date, nullable
  pickup_note   TEXT,                    -- "pick up here": the next concrete action
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_projects_owner ON projects(owner_id);

-- Every user with access to a project has a row here, including the owner.
-- This is the single source of truth for permission checks.
CREATE TABLE project_collaborators (
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_collab_user ON project_collaborators(user_id);

-- Invite by email for people who haven't signed up yet.
-- On first login with a matching email, resolve into project_collaborators
-- and mark accepted_at.
CREATE TABLE pending_invites (
  id            TEXT PRIMARY KEY,        -- uuid
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('editor','viewer')),
  invited_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  accepted_at   TEXT
);
CREATE INDEX idx_invites_email ON pending_invites(email);

CREATE TABLE ownership_transfer_log (
  id              TEXT PRIMARY KEY,      -- uuid
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  from_user_id    TEXT NOT NULL REFERENCES users(id),
  to_user_id      TEXT NOT NULL REFERENCES users(id),
  transferred_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Project content ──────────────────────────────────────────────────────

CREATE TABLE project_steps (
  id            TEXT PRIMARY KEY,        -- uuid
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_step_id TEXT REFERENCES project_steps(id) ON DELETE CASCADE,  -- sub-step ("bash"); one level only
  title         TEXT NOT NULL,
  completed     INTEGER NOT NULL DEFAULT 0,
  completed_at  TEXT,                    -- ISO datetime; set when completed flips to 1, cleared on 0
  due_date      TEXT,                    -- ISO date, nullable
  notes         TEXT,                    -- free-text working notes for this step
  estimate_minutes INTEGER,             -- NULL = no estimate; else one of 5/15/30/60/120/240/480
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_steps_project ON project_steps(project_id);
CREATE INDEX idx_steps_parent ON project_steps(parent_step_id);

CREATE TABLE project_supplies (
  id            TEXT PRIMARY KEY,        -- uuid
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  acquired      INTEGER NOT NULL DEFAULT 0,
  cost          REAL,
  source        TEXT,                    -- where to get it (store name)
  url           TEXT,                    -- optional link
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_supplies_project ON project_supplies(project_id);

CREATE TABLE project_journal (
  id            TEXT PRIMARY KEY,        -- uuid
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id),
  text          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_journal_project ON project_journal(project_id);

-- ── GTD capture ──────────────────────────────────────────────────────────

CREATE TABLE inbox_items (
  id            TEXT PRIMARY KEY,        -- uuid
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_inbox_user ON inbox_items(user_id);

-- ── Saved tool state ─────────────────────────────────────────────────────
-- Named presets for the form tools: salvar, caftan, war-food, award-rec,
-- packing-list. data_json is the tool's serialized inputs.

CREATE TABLE saved_tool_state (
  id            TEXT PRIMARY KEY,        -- uuid
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool          TEXT NOT NULL,
  name          TEXT NOT NULL,
  data_json     TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tool_state_user ON saved_tool_state(user_id, tool);

-- ── Gate calculator ──────────────────────────────────────────────────────

CREATE TABLE gate_events (
  id            TEXT PRIMARY KEY,        -- uuid
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_name    TEXT NOT NULL,
  event_date    TEXT,
  float_amount  REAL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_gate_events_owner ON gate_events(owner_id);

-- Same collaborator model applies: reuse project_collaborators isn't a fit
-- since gate_events aren't projects, so a parallel table for gate sharing.
CREATE TABLE gate_event_collaborators (
  gate_event_id TEXT NOT NULL REFERENCES gate_events(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')),
  added_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (gate_event_id, user_id)
);

CREATE TABLE gate_log_entries (
  id               TEXT PRIMARY KEY,     -- uuid
  gate_event_id    TEXT NOT NULL REFERENCES gate_events(id) ON DELETE CASCADE,
  entry_type       TEXT NOT NULL,        -- cash, group, short-payment, etc.
  amount           REAL,
  headcount        INTEGER,              -- total adults + youth (sum of the three below)
  meal_count       INTEGER,              -- total meals (lunch + feast)
  member_count     INTEGER NOT NULL DEFAULT 0,
  nonmember_count  INTEGER NOT NULL DEFAULT 0,
  under18_count    INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  logged_by        TEXT NOT NULL REFERENCES users(id),
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_gate_log_event ON gate_log_entries(gate_event_id);
