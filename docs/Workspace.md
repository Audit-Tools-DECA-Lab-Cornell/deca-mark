# Product workspace

DECA Mark uses one Git repository and separate component toolchains. Central management means common entry-point commands, documentation, and coordinated changes; it does not require a shared React version or a combined JavaScript/Python dependency graph.

Current roadmap: [position and next work](plan/current-state.md). Operations below are local tooling instructions, not evidence of hosted readiness. The [October 14 hosted diagnosis](reviews/ci-and-hosted-data-2026-10-14.md) records the last schema mismatch investigation; do not infer current deployment health from a local test.

## Dependency boundaries

| Component                | Dependency owner                                        | Runtime                               |
| ------------------------ | ------------------------------------------------------- | ------------------------------------- |
| Product root             | Dependency-free `package.json`                          | Node 24, pnpm 10.17.1, Make           |
| `web/`                   | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Next.js, React DOM                    |
| `mobile/`                | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` | Expo, React Native, native toolchains |
| `backend/`               | `pyproject.toml`, `uv.lock`                             | Python 3.13+, uv                      |
| `database/`, `supabase/` | SQL and Docker/Supabase configuration                   | PostgreSQL/PostGIS                    |

Each JavaScript folder has an empty pnpm workspace package list so pnpm treats it as an independent package root. The product root does not recursively install or hoist app dependencies. Mobile keeps its existing hoisted linker configuration; web keeps its existing linker and dependency versions. Root scripts use `pnpm --dir` to select the correct component.

Run `pnpm setup:apps` to install both JavaScript apps with frozen lockfiles. Run `pnpm backend:setup` to install Python tools from the frozen uv lockfile. For one app, use `pnpm --dir web install --frozen-lockfile` or `pnpm --dir mobile install --frozen-lockfile`. Add dependencies inside the owning application, never at the product root.

Use Node 24 via the root `.nvmrc`. The current shell may still select an older Node version until `nvm use` is run. Docker Desktop must be running for integration tests and API containers. Xcode/CocoaPods or Android SDK setup remains separate from dependency installation.

## Development and checks

Run long-lived services in separate terminals. There is no command that silently starts both local and hosted API configurations.

| Root command                                 | Target                                                      |
| -------------------------------------------- | ----------------------------------------------------------- |
| `pnpm dev`, `pnpm web:dev`                   | Web development server, port 3000                           |
| `pnpm build`, `pnpm web:build`               | Web production build                                        |
| `pnpm start`                                 | Serve the built web application                             |
| `pnpm mobile:dev`                            | Expo development server                                     |
| `pnpm mobile:simulator`                      | Metro on IPv4 localhost for the iOS simulator               |
| `pnpm mobile:ios`, `pnpm mobile:android`     | Native build and launch                                     |
| `pnpm web:check`                             | Web TypeScript and ESLint                                   |
| `pnpm mobile:check`, `pnpm mobile:test`      | Mobile TypeScript/Biome and Vitest                          |
| `pnpm backend:check`                         | Ruff and BasedPyright                                       |
| `pnpm check`                                 | All three static check groups                               |
| `pnpm db:start`                                 | Start local Supabase and configure the restricted API role   |
| `pnpm db:reset`                              | Explicitly rebuild local Supabase from canonical migrations |
| `pnpm db:stop`                               | Stop local Supabase while preserving its volumes           |
| `pnpm backend:test`                          | Run API tests against local Supabase |
| `pnpm db:test`                               | Run rolled-back SQL assertions against local Supabase |
| `pnpm test`                                  | Web unit, mobile, local API, and local SQL suites           |
| `pnpm forms:parity`                          | Web copy of the form engine matches the mobile original     |
| `pnpm tokens:check`                          | Contour token drift and contrast; generated email templates |
| `pnpm plan:check`                            | Plan files: IDs, `Depends:`/`Blocks:` and the phase board   |
| `pnpm api:hosted:up`, `pnpm api:hosted:stop` | Local API process using hosted Supabase                     |

For backend checks without a database, run `cd backend && EMAIL_ENABLED=false uv run --frozen python -m pytest -m 'not integration'`. This selection needs no database credentials or startup; database fixtures require an explicit integration marker. Signed validation tests use the database-free client. The full suite still runs those integration scenarios.

For the full integration suite, first run `pnpm db:start`, then `pnpm test`. These operations create/migrate the local test databases. They do not apply hosted migrations or change deployed Supabase settings.

### Web browser tests

`sh scripts/e2e-local.sh` runs the Playwright specs in `web/e2e` against the local stack only: Docker, local Supabase, the API on `127.0.0.1:8001` (`backend/config.auth-local.json`), the seed `database/seed-web-workspace.mjs`, and the web app on `127.0.0.1:3000`. It starts whatever is not running and leaves it running. The web app must use port 3000, because map packages go from the browser straight to the API and that is the only browser origin the local API allows. The script header lists its options: `--prod` builds and serves instead of `next dev`, `--skip-seed` skips the seed when its manifest exists (local Auth allows 30 sign-ins in 5 minutes), and `--stop` stops the web app it started. Arguments after the options go to `playwright test`, for example `sh scripts/e2e-local.sh --skip-seed --project=desktop-1440 e2e/sign-in.spec.ts`.

The seed creates the project `/o/web-acceptance/p/play-study` and the accounts `{owner,admin,manager,observer,viewer,outsider,joiner,other-owner}@fieldmaps.test`, all with the public local password `FieldMaps-local-only-42!`. Its manifest is `database/.local/web-workspace.json`. Screenshots of every route in Day and Dusk go to `web/e2e/screenshots/`, and the HTML report to `database/.local/e2e/playwright-report`. Never point the seed or the specs at hosted services.

The existing short aliases `pnpm lint`, `pnpm lint:fix`, `pnpm typecheck`, `pnpm format`, and `pnpm format:check` target only web. `pnpm check` is the product-wide static check. Formatting never sweeps the backend, spreadsheets, GIS files, or native projects.

## API and database targets

The normal connected mobile development setup uses the local API on port 8000 with hosted Supabase Auth and PostGIS. `pnpm api:hosted:up` uses `database/compose.hosted.yaml`; its secret volume must already exist as described in [Supabase setup](Supabase-Setup.md). Credentials are not copied into root configuration.

Local API development uses `pnpm db:start` and, from `backend/`, `uv run --frozen uvicorn fieldmaps_api.main:create_app_from_config --factory --app-dir src --port 8000`. Stop any API already on port 8000 first. The local API uses `config.local.json` and the generated `../database/.local/fieldmaps-api-password`; it connects to the local database, not hosted PostGIS. Its public identity-provider configuration is unchanged by DB-02; synthetic API tests inject their own JWT verifier.

`pnpm db:stop` stops local Supabase while preserving volumes. `pnpm db:reset` explicitly deletes local database contents and reapplies the canonical migrations and fictional seeds. Routine checks do not reset data. Hosted migration application is separate.

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and every push to `master`:

- `contracts`: `pnpm contracts:generate`, then `git diff --exit-code` on `contracts/openapi.json` and both generated `schema.d.ts` files, so the checked-in OpenAPI document and API types match the FastAPI routes (CON-03).
- `web`: `pnpm web:check`, the Node suites `test:api-errors`, `test:auth`, `test:account` and `test:unit`, `pnpm forms:parity` (the web's copy of the form engine is byte-identical to the mobile original), `node scripts/contour-tokens.mjs --check` (Contour tokens match `contracts/contour.json` and pass WCAG contrast) and `pnpm build`.
- `mobile`: `pnpm mobile:check` and `pnpm mobile:test`.
- `database`: `pnpm db:start`, `pnpm db:test` and `pnpm db:stop` on a local Supabase.
- `backend`: installs the collector's dependencies, then `pnpm backend:check` and `pnpm backend:test ZONE_API_REHEARSAL=1` on a pulled disposable PostGIS image, then the forward account-deletion recovery rehearsal. The suite includes the email-template drift test (the email half of `pnpm tokens:check`) and the real collector-to-API drivers `test_mobile_bound_upload_api` and `test_mobile_package_api`, which run the mobile Vitest acceptance files against a signed loopback API.
- `plan`: `node docs/plan/check-plan.mjs` and `node --test "scripts/*.test.mjs" "database/*.test.mjs"`.

CI does not run the Playwright specs in `web/e2e` (they need the local stack; run them by hand as above), `test:auth:local`, or anything on a device or simulator. `pnpm test` adds the web unit tests to the mobile, API and SQL suites, but not the three focused web suites CI also runs (`test:api-errors`, `test:auth`, `test:account`). The disposable-database acceptance tests, the two collector drivers among them, refuse to run against the shared local stack that a plain `pnpm backend:test` uses; run `pnpm backend:test ZONE_API_REHEARSAL=1`, as CI does. `sh database/mobile-package-rehearsal.sh` still runs the package driver alone. The local database jobs never link to hosted Supabase. CI outcomes must be checked for the exact revision rather than inferred from their presence.

## Web move and deployment

The web source, public assets, dependencies, lockfile, formatter, TypeScript, ESLint, PostCSS, and Next.js configuration now live in `web/`. Public URLs stay the same: assets are still served at `/`, not `/web/`. Next.js tracing and the Turbopack root are the repository root, not `web/`: Vercel's Next.js adapter resolves build output paths against the repository root, and a `web/` tracing root made every path miss (`ENOENT … /vercel/path0/.next/package.json`).

For the existing Vercel web project, set **Root Directory** to **`web`** before deploying this layout. Use install command `pnpm install --frozen-lockfile` and build command `pnpm build` within that root, with the Next.js framework preset. This follows [Vercel's monorepo project configuration](https://vercel.com/docs/monorepos). The hosted project settings have not been changed by this repository reorganization.

The old root `.vercel/` local linkage and generated `.next/` cache were left untouched. Do not deploy from that stale local linkage without checking the intended project and root directory. Upgrade the outdated local Vercel CLI with `pnpm add -g vercel@latest` before the next deployment. No deployment or CLI upgrade is part of this change.

Tooling entry points should run root `pnpm dev` or use `web/` as their working directory. The existing root development-launch alias still works. Any separately managed web environment files must be configured for the web deployment/app directory; this move does not inspect, copy, or edit secret files.

## Change ownership

Keep web UI in `web/`, native collection and local persistence in `mobile/`, authentication and server contracts in `backend/`, and schema/access rules in `database/` and `supabase/`. Product requirements and cross-component contract decisions belong in `docs/`. QGIS files remain in `qgis/` so their configured certificate/service paths remain valid.

When changing a payload or form version, coordinate the mobile contract, server validation, database representation, and GIS columns in one review. Preserve old form versions and pending uploads. [Shared contracts](../contracts/README.md) hold JSON schemas, form definitions and cross-language cases without a shared runtime package. Run `pnpm --dir mobile contracts:forms` to regenerate the input schema. Mobile consumes these definitions now; backend form parity is BE-10.

There are no new nested Git repositories, submodules, branches, commits, or deployment projects. CI and release automation remain separate follow-up work; the root checks provide their eventual entry points.

## Relocation verification

Verified September 18, 2026: web type/lint checks and a production build pass through the root aliases. The production server renders the operations console and field collector in a browser, including map polygons, markers, and styles. A public SVG is still served at its original URL. All 79 original tracked web source/asset files match their pre-move contents byte-for-byte.

Mobile type/lint checks and 28 tests pass through the root aliases. Python static checks pass, the root Make target runs all 24 API integration tests successfully, and the database alias passes all 19 SQL assertions. No hosted migration, deployment, or native rebuild was performed for this reorganization.
