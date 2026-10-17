# Observation authorization — local implementation

Scope: finding 1 only. For the subsequently authorized hosted rollout, see
[rollout.md](rollout.md). The accompanying `audit.md` is the user-supplied condensed
handoff; its prior results are not evidence of checks in this checkout.

## Source and reproduction

Current HEAD is `8ad122e77b130d91c6e372d510fab0f766820214`. The worktree was clean
before this task. `git diff 2b5bf9aaa7067c98c44520de3c9b3f573a166731 HEAD --
backend/src supabase/migrations` was empty. No branch or commit was created.

Before application or migration changes, the new regression ran against the
vulnerable source with two synthetic creators in one project. Both creators used
the same initials and timestamps, with one point and one Inventory each.

- A signed research observer's list/count returned four records instead of two.
- A direct `fieldmaps_api` connection could read the other creator's records.
- CSV and GeoJSON exports returned 200 for research and Training observers.
- Result: **6 expected failures**, 42 deselected, in 11.95 seconds. These were
  assertion failures demonstrating disclosure, not fixture or infrastructure errors.

## Correction and resulting behavior

The forward migration alters only the existing observation SELECT policy. It
retains current project/account/organization checks and permits rows owned by the
immutable creator, plus research rows available to viewers/managers. Existing
organization owner/admin inheritance remains authoritative. Initials confer no
ownership. Training remains creator-only for all roles.

Lists, details, summaries, counts, filters, pagination and invoker GIS observation
views inherit this database scope. Hidden details return 404. Organization
membership without project authority does not permit reads, even of a record
whose creator ID the caller knows. Role demotion and membership revocation take
effect on subsequent requests, including requests using an older cursor.

The export service checks the current project result before scope validation,
snapshot construction or serialization. Only research viewers/managers, including
inherited organization owners/admins, may export. Observers and all Training
projects receive `403 role_required`; inaccessible projects retain 404.

No upload, fingerprint, receipt, history binding, grant, table, role or GIS view
definition changed. Tests verify successful identical retries, conflicting bodies,
another creator's receipt refusal, revoked retries, exact recorded package binding,
point/Inventory separation and the existing historical attribution scenarios.

## Changed files

| File | Purpose |
| --- | --- |
| `supabase/migrations/20261017000657_observation_creator_visibility.sql` | Additive RLS policy correction; applied baseline unchanged. |
| `backend/src/fieldmaps_api/services/observation_exports.py` | Explicit research review/export role and Training check. |
| `backend/tests/test_observation_authorization.py` | 48 signed API/restricted SQL cases across creator, role, tenant, Training and retry boundaries. |
| `backend/tests/tenant_fixtures.py` | Optional synthetic Training project flag set at project creation. |
| `backend/tests/test_zone_api_live.py` | Replace obsolete observer-export success expectation with observer denial and signed viewer success. |
| `database/tests/observation-ownership.sql` | Ten independent SQL ownership/reviewer/revocation assertions; fixtures roll back to a savepoint. |
| `database/tests/run.sql` | Include the SQL ownership regression in normal database acceptance. |
| `backend/README.md` | Document read/export authorization and error behavior. |
| `backend/WEB-FLOW-HANDOFF.md` | Correct endpoint access descriptions. |
| `database/README.md` | Document row scope and the required forward migration path. |
| `docs/reviews/engineering-audit-2026-10-16/audit.md` | Save the supplied condensed audit verbatim. |
| `docs/reviews/engineering-audit-2026-10-16/first-fix-prompt.md` | Save the supplied implementation instructions verbatim. |
| `docs/reviews/engineering-audit-2026-10-16/implementation.md` | Current reproduction, implementation, verification and rollout evidence. |

## Current verification

Runtime results below are **alternate-image local verification**. The pinned
Supabase image failed to load with `no space left on device` in the earlier attempt;
it was not retried. The authorized fallback built successfully from
`postgis/postgis:17-3.5@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6`
with `postgresql-17-cron`, using the supplied Dockerfile and the public system CA
bundle. No TLS verification was disabled.

Scratch copies of the two documented rehearsal scripts changed only database image
selection and synthetic copied-directory read permissions inside their own test
containers. They ran under the repository’s `work/` directory. After verification,
all scratch files/logs were moved to `/workspace/work/observer-fix`, and the scripts’
repository resolution was adjusted to `/workspace/deca-mark`. Bootstrap, application
migrations, seeds, role selection, test commands,
loopback-only API port and cleanup traps remained intact. Every runtime check used
a fresh disposable container; existing databases and volumes were untouched.

| Check | Actual result |
| --- | --- |
| New authorization matrix + `test_bound_uploads.py` + `test_bound_upload_bindings.py` | **65 passed** in 125.85 seconds. |
| Disposable fresh baseline/migrations/seeds (`--reset-only`) | Passed. |
| Full disposable SQL suite, including new ownership assertions | Passed. |
| Auth-hook-role checks and local execution of `database/hosted/verify.sql` | Passed. No hosted database was contacted. |
| Numeric/JCS comparisons | **2,545** coordinate numbers and geometry digest matched Node v24.19.0. |
| Separate-session publication/CAS/retry/revocation/account concurrency | **7 scenarios passed**. |
| Backend Ruff | Passed using repository tooling. |
| Backend BasedPyright | **0 errors, 0 warnings, 0 notes** using repository tooling. |
| Live signed HTTP suite after updating its obsolete observer-export expectation | **4 passed** in 9.11 seconds. |
| Complete backend suite on final source | **729 passed**, 126 existing deprecation warnings, in **429.07 seconds**. |

The first complete backend run passed 728 tests and found one existing test that
expected an observer export to succeed. Its expectation was corrected to assert
observer denial and viewer success, and its full four-test live HTTP module passed.
A subsequent full rerun was interrupted with its tool session; it was not counted
as a pass, and only its task-owned disposable container was stopped. A fresh full
run on the final source then passed all 729 tests.

Equivalent runtime commands using the retained scratch harnesses (they select the
repository root explicitly):

```sh
EMAIL_ENABLED=false sh /workspace/work/observer-fix/zone-api-rehearsal.sh \
  tests/test_observation_authorization.py tests/test_bound_uploads.py \
  tests/test_bound_upload_bindings.py -q
sh /workspace/work/observer-fix/baseline-rehearsal.sh --reset-only
sh /workspace/work/observer-fix/baseline-rehearsal.sh
EMAIL_ENABLED=false sh /workspace/work/observer-fix/zone-api-rehearsal.sh -q
```

The documented pinned-image equivalents remain `pnpm db:reset --disposable`,
`pnpm db:test ZONE_REHEARSAL=1` and `pnpm backend:test ZONE_API_REHEARSAL=1`.
Corepack resolves the repository's pnpm 10.17.1; Node is v24.19.0. Static checks used
the existing Python environment via `uv run --frozen --no-sync --offline`, with a
writable scratch `UV_CACHE_DIR`. BasedPyright requires the normal unsandboxed
subprocess context here to discover the existing environment's packages; its
restricted-shell attempt reported missing imports rather than source errors.

Existing Starlette/SQLAlchemy deprecation warnings are unrelated to this fix.
These results do not establish pinned-Supabase, hosted Auth, hosted schema, browser,
physical-device or hosted deployment acceptance.

## Remaining migration and deployment work

1. On each explicitly approved existing target, inspect migration history and apply
   the pending canonical forward migration
   `20261017000657_observation_creator_visibility.sql` through the normal migration
   process. Preserve all data and grants; do not edit/reapply the baseline or reset
   the database. This task did not connect to or migrate any existing target.
2. Deploy the matching API export guard as part of the same release. The database
   correction and API guard are both required: an older API would still let an
   observer export their newly restricted own-row scope until the guard ships.
3. Verify on the approved target with synthetic accounts: observer own-only reads
   and export denial, viewer/manager/inherited-admin research review/export,
   Training creator-only reads and export denial, foreign-tenant denial and retry
   behavior. Repeat the pinned local Supabase checks where storage permits.

No secrets/environment/password files were read, real emails sent, unrelated Docker
resources pruned, existing databases reset, hosted services changed, commits made,
pushes performed or deployments attempted. Findings 2–5 remain outside this change.
