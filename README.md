# DECA Mark

Custom offline field collection for research teams: a native collector, a web management application, an authenticated API, and a shared spatial database readable in QGIS.

This is one Git repository with independently managed components. The root owns product documentation and development commands; each application owns its dependencies, lockfile, and runtime. DECA Mark remains independent of Playspace, COPA, and YEE.

## Product layout

```text
decamark/
├── web/          Next.js management application, source, public assets, and build config
├── mobile/       Expo / React Native collector with SQLite and MapLibre
├── backend/      FastAPI authentication and observation API
├── contracts/    Shared JSON schemas, form definitions and validation cases
├── database/     Local Supabase tooling, SQL tests and hosted verification
├── supabase/     Canonical schema migrations, local Supabase configuration and seeds
├── qgis/         Read-only live project, connection settings, and launcher
├── docs/         Requirements, architecture, research, and implementation scope
├── designs/      Design references
├── package.json  Product command aliases; no application dependencies
└── Makefile      Python, Docker, and database orchestration
```

## Start working

Use Node 24 (`nvm use`), pnpm 10.17.1, and Docker Desktop for API/database work. Python development uses uv and Python 3.13 or newer.

```sh
pnpm setup:apps
pnpm backend:setup
pnpm dev
```

`pnpm dev` opens the web development server at http://localhost:3000. Root `pnpm install` only installs the dependency-free command package; use `pnpm setup:apps` to install web and mobile dependencies.

| Root command                                  | What it does                                                        |
| --------------------------------------------- | ------------------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start`      | Web development / production build / production server              |
| `pnpm mobile:simulator`                       | Metro for the existing iOS simulator development build              |
| `pnpm mobile:ios` / `pnpm mobile:android`     | Build and run the native development app                            |
| `pnpm api:hosted:up` / `pnpm api:hosted:stop` | Start/stop the local API connected to hosted Supabase               |
| `pnpm check`                                  | Web and mobile type/lint checks, then Python Ruff/BasedPyright      |
| `pnpm test`                                   | Mobile tests, local API integration tests, and local SQL assertions |

Run `pnpm run help` for the command overview. Integration tests need the local databases started with `pnpm db:start`; they do not run against Supabase. The hosted API needs the already provisioned local credential volume. See [workspace operations](docs/Workspace.md) for prerequisites, individual checks, and deployment instructions.

## Current functionality

Start with [current position and next work](docs/plan/current-state.md), reconciled October 15, 2026. The [production plan](docs/plan/README.md) owns sequencing; each component plan owns its task status.

The management web app uses real authenticated API data for identity, projects, sites, forms, invitations and review. Organizations are created by the bootstrap script; owners/admins create projects on the web. Managers import QGIS packages, edit server-backed zone drafts and publish immutable versions. Review pages retain recorded map/zone attribution, page through server-filtered observations and download server ZIP exports within explicit limits. Some observer/day/play-type panels still disclose a loaded subset. Scoped live QGIS connection provisioning, record correction and several destructive management actions remain open.

The collector uses SQLite and the existing foreground outbox (D27). Hosted package retention, exact pinned-session recovery and boundary-aware Contour screens are implemented. MOB-29 now implements the immutable bound `/v1` upload body, exact receipt checks, structured rejection preservation and foreground save/reconnect/resume/retry handling. Local automated and disposable API/QGIS acceptance passes; [current evidence](docs/reviews/mob29-2026-10-15/README.md) must distinguish local runtime checks from pending physical iPad/Android collector acceptance. MOB-30 to MOB-32 retain simulator/VoiceOver checks, and QA-07 retains the physical-device publication/restart/reconnect and QGIS readback story. Closed-app background upload is not implemented. PowerSync remains a later gated transport, not the current sync engine.

Local web/API/database and component evidence is recorded with dates in the owner plans. The earlier practice uploads verified on September 18 do not prove the new zone contract. The October 14 hosted diagnosis recorded a schema/data mismatch; no hosted reconciliation, deployment or fresh device acceptance is claimed by this documentation pass. Account-deletion success/pending browser acceptance also needs the authorized Auth Admin runtime.

Web and collector share **Contour**, with Day default and Dusk preference. Tokens live only in `contracts/contour.json`, with separate map palettes. See [DESIGN.md](DESIGN.md) and [PRODUCT.md](PRODUCT.md). Janet's canonical form and reusable validation engine exist; protocol-content approval, exact publishing/binding and typed GIS acceptance remain distinct from source implementation.

## Component documentation

- [Web management application](web/README.md) and [mobile collector](mobile/README.md)
- [Backend API](backend/README.md), [local spatial database](database/README.md), and [hosted Supabase setup](docs/Supabase-Setup.md)
- [QGIS project and connection](qgis/README.md) and [testing on a real QGIS base map](docs/QGIS-Base-Map-Testing.md)
- [Launch runbook](docs/Launch-Runbook.md): putting the hosted database, API, web app and collector in front of Janet
- [Production architecture](docs/Production-Architecture-Recommendation.md) and [QGIS feasibility research](docs/QGIS-Field-Collection-Feasibility.md)
- [Design system](DESIGN.md) and [workspace management](docs/Workspace.md)
