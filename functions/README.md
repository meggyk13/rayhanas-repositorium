# Brambletally API (Cloudflare Pages Functions)

Backend for the Brambletally tool. File-based routing under `functions/api/` maps to
`/api/*`. See `brambletally_plan.md` and `brambletally_schema.sql` at the repo root.

## Bindings (set in the Pages project → Settings)

| Name | Type | Notes |
| --- | --- | --- |
| `DB` | D1 database | bind to `brambletally-db` |
| `RESEND_API_KEY` | secret | magic-link email. Unset → link is logged, not sent |
| `TURNSTILE_SECRET_KEY` | secret | bot check. Unset → check is skipped |
| `MAIL_FROM` | plain var (optional) | overrides the default `From:` address |

The Turnstile **site** key is public and lives in the frontend, not here.

## Local dev

```
npm i -D wrangler
wrangler d1 create brambletally-db            # once; note the database_id
wrangler d1 execute brambletally-db --local --file=./brambletally_schema.sql
cp functions/.dev.vars.example .dev.vars   # fill in if testing email/turnstile
wrangler pages dev -- npm run build
```

`wrangler pages dev` reads `.dev.vars` for secrets and needs a `[[d1_databases]]`
entry (added to `wrangler.jsonc` once the database exists).

## Auth flow

1. `POST /api/auth/request-link` `{ email, turnstileToken }` → creates a
   `magic_links` row, emails a one-time link (15 min TTL).
2. `GET /api/auth/callback?token=…` → verifies, creates the user on first
   sign-in, resolves any `pending_invites`, sets the `brambletally_session` cookie
   (30-day sliding), redirects to `/tools/brambletally/`.
3. `POST /api/auth/logout` → deletes the session, clears the cookie.
4. `GET /api/auth/me` → current user or 401.

`api/_middleware.js` attaches `context.data.user` for every `/api/*` request but
never blocks — endpoints check for themselves.

## Routes

- `auth/*` — see above.
- `projects` (GET list, POST create) · `projects/:id` (GET bundle, PATCH, DELETE)
  · `projects/:id/steps` · `.../steps/:stepId` · `.../supplies` ·
  `.../supplies/:supplyId` · `.../journal` (viewers read, editors post) ·
  `.../collaborators` (owner-managed) · `.../transfer` (POST).
- `review` (GET) — Active + Waiting For projects with their open steps.
- `inbox` (GET, POST) · `inbox/:itemId` (PATCH, DELETE) — per-user capture.
- `users/search?q=` — signed-in lookup for the invite picker.
- `patterns` (GET, POST, `?tool=`) · `patterns/:patternId` (PATCH, DELETE) —
  saved kaftan/şalvar inputs.
- `gate/events` (GET, POST) · `gate/events/:eventId` (GET bundle, PATCH, DELETE)
  · `.../entries` (GET, POST) · `.../entries/:entryId` (PATCH, DELETE) ·
  `.../collaborators` (owner-managed, existing users only).

Role ranks are `viewer < editor < owner`. A caller with no role on a project or
gate event gets 404, not 403, so existence doesn't leak.

`gate_log_entries` carries the calculator's per-group split directly:
`member_count / nonmember_count / under18_count` (plus `headcount`, `meal_count`,
`amount`), so the CSV export's NMS-remittance math has real columns to read.
