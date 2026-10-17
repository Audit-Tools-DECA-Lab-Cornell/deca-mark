# Form revision remediation evidence — October 16, 2026

This is new remediation evidence, separate from the original audit of
`2b5bf9aaa7067c98c44520de3c9b3f573a166731`. No original audit record was rewritten.
User-facing dates use America/New_York; the generated migration timestamp uses UTC.

Implementation and verification base HEAD: `6f1ac1fe730f8ea2514c56a888fe2ba553f3e920`.
The initial `git status --short` and `git diff --stat` were empty. The current worktree,
not just the audited commit, was inspected. The [complete changed-file list](changed-files.md)
is recorded alongside this evidence. During implementation and verification, no reset,
branch switch, commit, push, deployment, existing database mutation, credential-file read
or provider call was used. The subsequent user instruction authorized committing the
completed work to `origin/master`; that Git operation does not apply the migration or deploy it.
The [post-merge verification](post-merge.md) records integration with the remote authorization fix.
The later, explicitly authorized [hosted rollout](hosted-rollout.md) supersedes the original
remaining-release status below; the original audit remains untouched.
Authorization and QGIS source/artifacts were preserved; relevant regressions remain.

## Reproduction and result

The baseline-only [reproduction script](reproduce.py) requires an explicitly selected disposable database and the original source.
The baseline API ran with synthetic signed identity and the restricted `fieldmaps_api`
role against a fresh disposable database containing the unchanged baseline/outbox migrations.
[Before evidence](before.txt): A saved a title (200); B saved an older full definition
(200), restoring `Janet zone inventory`. A manager reviewed a definition, another save
changed its title to `Not reviewed`, and publication returned 200 with that title.

After remediation:

| Scenario | Verified outcome |
| --- | --- |
| Two readers, A saves and B sends the earlier definition | A receives revision N+1; B receives 412; A's definition remains |
| B discards with the earlier ETag | 412; current draft remains |
| Manager publishes reviewed N after another save | 412; no publication or publisher timestamp |
| Manager reloads/reviews current revision | Publication succeeds and freezes precisely that definition |
| Edit commits after service validation/read but before conditional mutation | Save, discard and publication all reject 412 using real independent transactions |
| Publication holds row lock before an edit | The test observes an actual PostgreSQL lock wait, commits publication, and the waiting edit returns 409; reviewed wording stays frozen |
| Missing/weak/wildcard/list/malformed or duplicate preconditions | 428 without mutation |
| Same version code is discarded and recreated | Old ETag rejected because it includes the version UUID |
| Observer/viewer supplies a valid ETag | Save, discard and publication still return 403 |
| Frozen version receives save/discard | Existing 409 lifecycle protection retained |

`test_workspace_concurrency.py` retains all existing publish/discard versus save/discard
and simultaneous version-creation cases. SQL lifecycle tests retain historical creator/
publisher attribution and immutable version checks, plus direct publication NULL/stale
preconditions, removal of the unconditional SQL signature and denied revision-column writes.

## Design and supported client

The forward migration adds a non-null bigint revision initialized to 1. The existing
form immutability trigger advances every draft edit (including identical saves), keeps
the reviewed revision when publishing, and protects it through retirement. Neither
published definition bytes nor historical package/observation attribution change.

Form summaries/details expose revision and a strong
`"form-draft:<version UUID>:<revision>"` ETag. Detail reads and saves also return the
ETag header. PUT/DELETE compare project, code, state, UUID and revision in the mutation.
Publication validates the requested revision's definition, then its SQL function locks
and checks that same revision before freezing it. The old two-argument function is removed;
the replacement retains active-user, project, role and lifecycle checks and its fixed search path.

The editor sends its loaded ETag and uses each save's returned ETag. Discard carries the
listed draft's ETag. The review page carries the reviewed ETag and resets confirmation
when the review changes. Publication never fetches a newer revision to adopt before writing.
On conflict, local edits stay in the editor; the latest draft can be opened in another
tab for comparison. Saving is blocked until explicit reconciliation/reload. A publication
conflict blocks publication and clears confirmation; explicit reload presents a new review.
No automatic retry, overwrite or merge is introduced.

The [focused client regression](client.txt) renders the real editor, publication review
page, discard dialog, Server Actions, API client and mutations using React test renderer.
Only visual children, Next's request/auth context and the HTTP boundary are synthetic.
It proves two consecutive saves use returned ETags, publication uses the reviewed ETag
without another read, conflicts preserve wording and require review, and discard propagates
its ETag. This is component/action acceptance, not browser or hosted Auth acceptance.

## Verification

Commands were inspected before use. Node `v24.19.0`, pinned pnpm `10.17.1`, repository
uv tooling and the installed Python 3.13 environment were used. A workspace-local pnpm
wrapper kept nested scripts on 10.17.1. No `.env` or credential files were read.

The disposable test image is `postgis/postgis:17-3.5` (PostgreSQL 17.5, PostGIS 3.5)
plus pg_cron 1.6.7, built using [Dockerfile.tests](Dockerfile.tests). Its image digest is
`sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6` before adding pg_cron.
The archive package source is required because the image uses Debian bullseye. TLS
verification remained enabled with the session CA mounted read-only for the build.

The rehearsal image override and readable-public-fixture copy fix leave the default
pinned Supabase image unchanged. Both harnesses create and remove only their own isolated
containers. Synthetic Auth tables do **not** exercise the Supabase Auth/Storage HTTP services,
full Supabase image, real providers, browsers, physical devices, or hosted deployments.

- `pnpm backend:check`: Ruff clean; BasedPyright 0 errors/warnings ([log](backend-check.txt)).
- Focused revision/lifecycle/authorization/succession/QGIS tests: **69 passed** ([log](focused-backend.txt)).
- Focused actual client component/action tests: **3 passed** ([log](client.txt)).
- `pnpm --dir web test:unit`: **42 test files passed**; `test:api-errors`: **1 file passed**.
- `pnpm web:check`: TypeScript and ESLint passed.
- `pnpm mobile:check`: TypeScript/Biome passed; 23 existing informational diagnostics, no fixes.
- Local fixture seed guard tests: **2 test files passed**; seeds were not run against Auth.
- `pnpm contracts:generate` run twice: OpenAPI and both declarations regenerated by repository tooling; second run byte-identical ([log](contracts-generate.txt), [hashes](contracts.sha256)).
- Disposable SQL, Auth-hook and local hosted-verification assertions passed, along with 2,545 coordinate comparisons and all 7 existing zone concurrency scenarios.
- Full disposable run: **719 backend tests + 1 mobile outbox acceptance passed** ([log](backend-full.txt)).
  The extra cross-directory GIS case had a missing shared fixture in that combined invocation.
  With `-p tests.conftest`, its existing fixture reaches the scenario but lacks an Inventory
  binding ([current failure](gis-acceptance.txt)). The identical assertion fails using an
  isolated archive of the original recorded HEAD's API/tests ([baseline proof](gis-at-head.txt)).
  This pre-existing optional GIS acceptance fixture remains outside the form-revision fix;
  SQL GIS checks and the focused QGIS import regressions passed.
- Mobile API error/form contract tests: **88 passed** across 2 files ([log](mobile-focused.txt)).
- Current OpenAPI tests: **3 passed** ([log](openapi-tests.txt)).

Initial verification catches were corrected: the lock-wait test originally matched only
a query beginning without whitespace; its corrected match observes the real blocked UPDATE.
Docker fixtures copied from a restrictive checkout needed read/traverse permissions.
The sandboxed Python checker could not discover interpreter search paths; running the
same repository check with interpreter subprocess access passed. The first full run loaded
the API before final header documentation/regeneration and reported 704 passes plus one
contract-snapshot mismatch; current OpenAPI checks pass. A repeat was interrupted before
the legacy mobile acceptance could write historical exports; that test now writes only
to pytest temporary output. The stable full rerun passed all backend tests and the mobile
outbox case. Its extra GIS
case has the pre-existing fixture limitation documented above. The baseline comparison
used `git archive HEAD` into scratch space, without resetting or switching the worktree.
No production behavior was relaxed to address these test/tooling issues.

## Repeatable commands

From the repository root, with Node 24 and pnpm 10.17.1 selected:

```sh
pnpm backend:check
pnpm web:check
pnpm --dir web test:unit
node --experimental-strip-types web/tests/unit/forms-concurrency.test.mjs
pnpm --dir web test:api-errors
pnpm mobile:check
pnpm --dir mobile test src/data/api/errors.test.ts src/forms/contracts.test.ts
pnpm contracts:generate
# Run generation again and compare the three generated files for drift.
node --test database/seed-web-workspace.test.mjs database/seed-zone-review.test.mjs
node --check scripts/bootstrap-study.mjs
```

Build the alternative disposable image if the pinned Supabase image is unavailable:

```sh
docker build --secret id=ca,src=/etc/ssl/certs/ca-certificates.crt \
  -f docs/reviews/form-revisions-2026-10-16/Dockerfile.tests \
  -t decamark-form-tests:17 .
DECAMARK_REHEARSAL_IMAGE=decamark-form-tests:17 sh database/baseline-rehearsal.sh
DECAMARK_REHEARSAL_IMAGE=decamark-form-tests:17 sh database/zone-api-rehearsal.sh \
  -c pyproject.toml tests \
  "$(pwd)/database/tests/test_mobile_bound_upload_api.py" -q
# Optional GIS acceptance currently reproduces the pre-existing missing Inventory binding:
DECAMARK_REHEARSAL_IMAGE=decamark-form-tests:17 sh database/gis09-api-rehearsal.sh \
  -p tests.conftest -q
```

The baseline rehearsal includes current SQL, Auth-hook, local execution of hosted
verification, numeric serialization and zone concurrency checks. These commands create
new test databases; they do not start, reset, migrate or authenticate against an existing
installation. API/SQL runs use no existing-database URL or password.

## Migration and release steps remaining

`supabase/migrations/20261017050453_form_draft_revisions.sql` follows the current baseline
and email-outbox migration, in line with the canonical migration policy: applied migrations
remain unchanged. The new column initializes existing supported installations to revision 1;
published definitions, historical attribution and current permissions remain intact.

No existing or hosted installation has received this migration; it was applied only to
freshly created disposable test databases. For an explicitly selected,
authorized local Supabase installation, apply pending migrations without a reset using
`pnpm dlx supabase@2.118.0 migration up --local`. For hosted installations, first verify
the current-baseline preflight and follow the separately authorized migration/release
workflow. Pause form writes, apply the migration, and roll out matching API and web builds
together; existing tabs must reload. The old unconditional SQL entry point is deliberately
removed, with no old-client bridge. Run normal target-specific post-release checks afterward.
