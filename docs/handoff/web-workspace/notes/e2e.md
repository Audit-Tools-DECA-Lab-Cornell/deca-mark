# Web E2E on the local stack (WP9)

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.

Everything is local: Docker → local Supabase (:54321) → DECA Mark API (:8001, `backend/config.auth-local.json`)
→ seed `database/seed-web-workspace.mjs` → web app on **http://127.0.0.1:3000** → Playwright (Chromium at
`/opt/pw-browsers/chromium`, Playwright 1.56.1; never `playwright install`).

Why :3000 and not :3100: `backend/config.auth-local.json` `browser_origins` allows only
`http://localhost:3000` and `http://127.0.0.1:3000`. Map package upload/download go browser → API directly, so
any other port fails CORS. `E2E_WEB_PORT` is accepted only if that file allows it (the script checks).

Every shell first:

```sh
(Node 24 and pnpm 10.17.1 must be on PATH)
cd /home/user/Field-Maps
```

## Run

```sh
# Whole suite, next dev (default). Starts whatever is not running; seeds (idempotent, no reset).
sh scripts/e2e-local.sh

# One spec / one width (args after the script's own flags go to `playwright test`)
sh scripts/e2e-local.sh --project=desktop-1440 e2e/sign-in.spec.ts
sh scripts/e2e-local.sh --skip-seed --project=desktop-1440 --project=phone-390 e2e/honesty.spec.ts

# Production build + next start instead of next dev
sh scripts/e2e-local.sh --prod

# Stop the web app after the run (leave Docker, Supabase, API running)
sh scripts/e2e-local.sh --stop-web --skip-seed e2e/sign-in.spec.ts

# Only stop the web app this script started
sh scripts/e2e-local.sh --stop

# Against a web app that is already running on :3000 with this stack's env
sh scripts/e2e-local.sh --reuse-web --skip-seed
```

Script flags: `--prod`, `--reuse-web`, `--skip-seed` (skip the seed when the manifest exists; local Auth allows
30 sign-ins / 5 min and the seed uses 8), `--stop-web`, `--stop`, `--` (everything after goes to Playwright).

Playwright projects: `setup` (signs each of the 8 accounts in through the real form; reuses a saved sign-in with
≥ 20 min left; `E2E_FRESH_SIGN_IN=1` forces new ones), `desktop-1440`, `phone-390` (all specs, axe on),
`tablet-1024`, `tablet-768` (honesty scan screenshots only, no axe).

Outputs:
- Screenshots of every route, Day and Dusk: `web/e2e/screenshots/<project>/<day|dusk>/<route>.png` (gitignored)
- Failure screenshots + traces: `web/test-results/` (gitignored)
- HTML report (incl. honesty findings JSON attachments): `database/.local/e2e/playwright-report`
  → `pnpm --dir web exec playwright show-report ../database/.local/e2e/playwright-report`
- Logs: `database/.local/e2e/{dockerd,api,web,web-build}.log`; pids `database/.local/e2e/{dockerd,api,web}.pid`

## Restart pieces

```sh
# Docker (only if `docker info` fails)
setsid nohup dockerd > database/.local/e2e/dockerd.log 2>&1 < /dev/null &

# Local Supabase
pnpm db:start            # stop: pnpm db:stop

# API on :8001 (what the script runs; from backend/)
cd backend && DECAMARK_CONFIG=config.auth-local.json uv run --frozen uvicorn \
  fieldmaps_api.main:create_app_from_config --factory --app-dir src --host 127.0.0.1 --port 8001
# stop the one the script started:
kill -TERM -- -$(cat database/.local/e2e/api.pid)

# Seed (idempotent; deterministic observation ids; writes database/.local/web-workspace.json)
node --test database/seed-web-workspace.test.mjs && node database/seed-web-workspace.mjs

# Web app: let the script start it (it sets NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY from
# `pnpm dlx supabase@2.118.0 status --output json`, DECAMARK_API_URL and NEXT_PUBLIC_DECAMARK_API_URL =
# http://127.0.0.1:8001, __NEXT_PROCESSED_ENV=true so no .env file is loaded).
sh scripts/e2e-local.sh --stop && sh scripts/e2e-local.sh --skip-seed e2e/sign-in.spec.ts
```

## Next 16 dev vs build

`next dev` writes to `web/.next/dev`; `next build` cleans `web/.next` except `dev/`, `cache/` and `lock`
(verified in next 16.2.7 `build/index.js`), so a dev run and another agent's build coexist. Only one `next dev`
can run in `web/` (lock `web/.next/dev/lock`); the script says so if another one holds it. `--hostname 127.0.0.1`
makes 127.0.0.1 an allowed dev origin.

## Accounts

`{owner,admin,manager,observer,viewer,outsider,joiner,other-owner}@fieldmaps.test`, password
`FieldMaps-local-only-42!` (public local test credential). Project `/o/web-acceptance/p/play-study`.
