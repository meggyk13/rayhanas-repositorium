# Defter API (Cloudflare Pages Functions)

Backend for the Defter tool. File-based routing under `functions/api/` maps to
`/api/*`. See `defter_plan.md` and `defter_schema.sql` at the repo root.

## Bindings (set in the Pages project → Settings)

| Name | Type | Notes |
| --- | --- | --- |
| `DEFTER_DB` | D1 database | bind to `defter-db` |
| `RESEND_API_KEY` | secret | magic-link email. Unset → link is logged, not sent |
| `TURNSTILE_SECRET_KEY` | secret | bot check. Unset → check is skipped |
| `DEFTER_FROM_EMAIL` | plain var (optional) | overrides the default `From:` address |

The Turnstile **site** key is public and lives in the frontend, not here.

## Local dev

```
npm i -D wrangler
wrangler d1 create defter-db            # once; note the database_id
wrangler d1 execute defter-db --local --file=./defter_schema.sql
cp functions/.dev.vars.example .dev.vars   # fill in if testing email/turnstile
wrangler pages dev -- npm run build
```

`wrangler pages dev` reads `.dev.vars` for secrets and needs a `[[d1_databases]]`
entry (added to `wrangler.jsonc` once the database exists).

## Auth flow

1. `POST /api/auth/request-link` `{ email, turnstileToken }` → creates a
   `magic_links` row, emails a one-time link (15 min TTL).
2. `GET /api/auth/callback?token=…` → verifies, creates the user on first
   sign-in, resolves any `pending_invites`, sets the `defter_session` cookie
   (30-day sliding), redirects to `/tools/defter/`.
3. `POST /api/auth/logout` → deletes the session, clears the cookie.
4. `GET /api/auth/me` → current user or 401.

`api/_middleware.js` attaches `context.data.user` for every `/api/*` request but
never blocks — endpoints check for themselves.
