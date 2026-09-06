# Defter — Build Plan

Rebranded, self-hosted version of "noodlr" (a craft-project tracker) for
Rayhana's Repositorium's Tools section, restructured around GTD (Getting
Things Done) and extended to cover A&S projects, personal research, and
Kingdom Chatelaine office work, with login and shared/collaborative projects.

Repo: github.com/meggyk13/rayhanas-repositorium
Site: Astro, static output, deployed on Cloudflare Pages.

## Stack decisions

- **Backend:** Cloudflare Pages Functions (`/functions` folder in the same
  repo — deploys with the existing Pages project, same domain, no CORS).
- **Database:** Cloudflare D1 (SQLite). Schema already drafted:
  `defter_schema.sql` (attached / in repo root — ask user if not present).
- **Auth:** Magic-link email, no passwords stored anywhere.
- **Bot protection:** Cloudflare Turnstile on signup/login.
- **Email delivery:** Resend (free tier) for sending magic links.
- **Frontend:** Astro stays static. Defter's UI is client-side JS calling
  the Pages Functions API — no change to Astro's build mode needed.

## Naming

Product name: **Defter** (Ottoman administrative register — the book where
you track things). Rename all "noodlr" branding, copy, and the "noodle"
session terminology throughout.

## Feature scope (from noodlr, keep/cut/add)

**Keep the shape of:**
- Projects with steps, supplies, deadlines, a journal/timeline
- Focus-timer ("noodle") session mode — rename, keep the mechanic
- Card-based project list UI, dark/light theme support

**Cut entirely:**
- All premium/free tier logic, paywalls, upgrade prompts, project limits

**Add (GTD structure):**
- `project_type`: Office / Research / A&S — filterable
- Status set: Active, Waiting For, Someday, Paused, Done (add "Waiting For"
  to noodlr's existing set)
- Step-level `context` tag: `@machine`, `@handsewing`, `@research`,
  `@errand`, `@email` — filter "what can I do right now"
- A capture/inbox: quick-add box for unsorted items, separate from projects
- A weekly-review view: filtered screen showing everything Active or
  Waiting For, grouped for a GTD-style review pass

**Add (collaboration):**
- Multi-user projects via `project_collaborators` (owner/editor/viewer)
- Invite by email — works whether or not the invitee has an account yet
  (`pending_invites`, resolves on first login with matching email)
- Invite by searching existing users, too (both methods supported)
- One-click ownership transfer — old owner drops to **editor**, not viewer
  (`ownership_transfer_log` keeps an audit trail)
- Same collaboration model applies to gate calculator events
  (`gate_event_collaborators`, parallel to `project_collaborators` since
  gate events aren't projects)

**Add (tie-ins to existing tools):**
- `saved_patterns`: save kaftan/şalvar generator inputs so measurements
  don't need re-entering
- Gate calculator event history (`gate_events`, `gate_log_entries`) lives
  in the same login/collaboration system as everything else — this was a
  deliberate choice despite the financial-data sensitivity, confirmed with
  the user. No separate/lighter-touch handling was requested.

## Schema

Full D1 schema already written: `defter_schema.sql`. Covers all tables
above. One thing NOT enforced at the SQL level, flagged for the app layer:
`projects.owner_id` should always have a matching `role='owner'` row in
`project_collaborators` — D1/SQLite can't express that as a constraint
cleanly, so this needs to be enforced in the API code (e.g., always
insert/update both in the same transaction).

## Open questions to resolve early in the build

1. Does the user already have Resend and Turnstile accounts set up, or
   does setup need to happen first? (Likely needs setup — ask.)
2. Session length / "remember me" behavior — how long before a user needs
   to click a new magic link?
3. Should Viewers see project journal entries, or is the journal
   editor-and-up only?
4. Office-type projects: is creating one restricted to the current
   Chatelaine, or can anyone label their own project "Office"? (User's
   Chatelaine term runs through ~2027 — site content is being kept
   general/non-chatelaine-specific for that reason, but this is a
   different question: access control on a feature, not site content.)
5. Sanity-check `astro.config.mjs` and `wrangler.jsonc` against the
   Pages-Functions-bolt-on assumption above before writing API code —
   confirm output mode and current Cloudflare config match what's assumed
   here rather than taking it from memory.

## User's working style (context for Claude Code)

- Builds/edits primarily on iPhone; deploys via GitHub web interface
  (github.dev) or GitHub mobile app. Laptop used for heavier operations.
- Prefers plain, direct language. Challenge-first advisory style —
  confidence-tagged claims, no filler openings.
- Iterative: lock requirements in discussion before building, then targeted
  edits rather than wholesale rebuilds/rewrites.
- Editorial standard for any user-facing copy: short declarative sentences,
  no "not only X but also Y," no "In conclusion," no templated openings.
- Astro CSS scoping gotcha: JS-built DOM children need `:global()` wrappers.
- Build verification pattern for this repo: 31 pages = correct build
  (deployment sanity check, not related to Defter specifically, but a
  useful thing to know when touching the Astro build).
