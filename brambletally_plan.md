# Brambletally — Build Plan

Rebranded, self-hosted version of "noodlr" (a craft-project tracker) for
Rayhana's Repositorium's Tools section, restructured around GTD (Getting
Things Done) and extended to cover A&S projects, personal research, and
Kingdom Chatelaine office work, with login and shared/collaborative projects.

Repo: github.com/meggyk13/rayhanas-repositorium
Site: Astro, static output, deployed on Cloudflare Pages.

## Stack decisions

- **Backend:** Cloudflare Pages Functions (`/functions` folder in the same
  repo — deploys with the existing Pages project, same domain, no CORS).
- **Database:** Cloudflare D1 (SQLite). Schema: `brambletally_schema.sql`
  in repo root. D1 binding name is `DB`; database name `brambletally-db`.
- **Auth:** Magic-link email, no passwords stored anywhere.
- **Bot protection:** Cloudflare Turnstile on signup/login.
- **Email delivery:** Resend (free tier) for sending magic links.
- **Frontend:** Astro stays static. Brambletally's UI is client-side JS
  calling the Pages Functions API — no change to Astro's build mode needed.

## Naming

Product name: **Brambletally**. Rename all "noodlr" branding, copy, and the
"noodle" session terminology throughout. (Earlier drafts used "Defter" —
fully replaced.)

## Feature scope (from noodlr, keep/cut/add)

**Keep the shape of:**
- Projects with steps, supplies, deadlines, a journal/timeline
- Focus-timer ("noodle") session mode — rename, keep the mechanic
- Card-based project list UI, dark/light theme support

**Cut entirely (noodlr's version of it):**
- noodlr's `IS_PREMIUM` / `FREE_LIMIT` / lock overlays / upgrade prompts /
  demo-mode toggle — all removed from the port.

**Tiers — door left open (decided 2026-09-06):**
- `users.plan` column exists (`DEFAULT 'free'`), surfaced in `/api/auth/me`.
  **Nothing is gated.** No Stripe, no billing UI, no Terms of Service yet.
- If tiers are ever built, the intended gates are: photo uploads (a future
  R2-backed feature, not just a flag), active-project count, and
  collaboration (invite/transfer). Adding payment later is additive — no
  schema rework.
- Not needed for cost: Cloudflare Workers + D1 free tier covers this site.

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
- Same collaboration model applies to saved gate calculator events
  (`gate_event_collaborators`, parallel to `project_collaborators` since
  gate events aren't projects). The calculator itself stays usable without
  logging in; **saving** an event and its log requires a login (user
  decision, 2026-09-06).

**Add (tie-ins to existing tools):**
- `saved_patterns`: save kaftan/şalvar generator inputs so measurements
  don't need re-entering
- Gate calculator event history (`gate_events`, `gate_log_entries`) lives
  in the same login/collaboration system as everything else — this was a
  deliberate choice despite the financial-data sensitivity, confirmed with
  the user. No separate/lighter-touch handling was requested. The unsaved
  calculator works logged-out; a signed-in user can save the current event
  to their history and share it with collaborators.

## Schema

Full D1 schema already written: `brambletally_schema.sql`. Covers all tables
above. One thing NOT enforced at the SQL level, flagged for the app layer:
`projects.owner_id` should always have a matching `role='owner'` row in
`project_collaborators` — D1/SQLite can't express that as a constraint
cleanly, so this needs to be enforced in the API code (e.g., always
insert/update both in the same transaction).

## Decisions (were open questions — resolved 2026-09-06)

1. **Resend + Turnstile:** not set up yet. User is provisioning both; API
   code no-ops each with a console warning until its secret is present.
2. **Session length:** 30-day sliding — each authenticated request extends
   it. No separate "remember me".
3. **Viewers + journal:** viewers CAN read the journal/timeline; editors
   and up can post.
4. **Office-type projects:** no restriction. "Office" is a personal filter
   tag anyone can put on their own project.
5. **Config sanity-check:** done. Astro output is `static` (no adapter).
   The Pages project is Git-connected (build `npm run build`), so
   `/functions` auto-deploys and D1 is bound in the dashboard. The existing
   `wrangler.jsonc` is written Workers-static-assets style and is not read
   by the Git-connected Pages build — left as-is.

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
  (deployment sanity check, not related to Brambletally specifically, but a
  useful thing to know when touching the Astro build).

## Build progress

- Backend (Pages Functions, `functions/api/`): auth (magic link, 30-day
  sliding session), projects + steps + supplies + journal + collaborators +
  ownership transfer, weekly review, inbox, user search, saved patterns,
  gate events + log + sharing. All inert until the `DB` binding exists.
- Next: Phase 2 provisioning (D1 + Resend + Turnstile in the dashboard),
  then the frontend port from noodlr's single `index.html` into
  `public/brambletally/app.{js,css}` + `src/pages/tools/brambletally.astro`
  + a `src/data/tools.ts` entry.
