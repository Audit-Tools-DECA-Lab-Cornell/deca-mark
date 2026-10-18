# Local verification of retained fields-only compatibility

The application change restores the six original stored-form consumer implementations
from 49caa05. All six ASTs match; five files match byte-for-byte and schemas.py keeps
the cleanup's blank-line formatting. No migration, initialization, immutable data or client production code
changed. Final source preservation and whitespace checks pass; the real Git index is
unchanged and HEAD remains 577959a. No commit or push was performed.

| Check | Actual result and evidence |
| --- | --- |
| Cleanup before fix: historical CSV/GeoJSON | [Two expected regression failures](before-exports.txt), 5.47 seconds: both exports return HTTP 422 export_scope_too_large. Raw definition/detail reads and an independently seeded exact retry receipt succeed. |
| Cleanup before fix: first bound upload | [One expected regression failure](before-upload.txt), 1.89 seconds: HTTP 500 with a BoundTarget canonical definition parse failure. |
| Final historical transition/preservation scenarios | [5 passed](final-history.txt), 7 warnings, 14.45 seconds. Includes actual CSV/GeoJSON subprocess exports, exact package ZIP contents/bytes, canonical successor, retirement, mixed v1/v2 export, original receipt replay, actual mobile SQLite/HTTP retry and read-only inventory. |
| Broader API/archive/signed GIS and previous fixes | [139 passed](api-regressions.txt), 13 warnings, 240.57 seconds. Authorization, canonical form validation, revision preconditions, workspace concurrency, exports, publication-process corruption/deadline and the retained Inventory-bound signed converter scenario. Final focused history assertions/early guard were refined afterward and rerun as the five cases above; production source is unchanged. |
| Full database-free selection | [518 passed, 312 deselected](unit-guarded.txt), 2 warnings, 97.71 seconds. Eight new historical-parser cases include all six field types, original blank-text/export semantics and refusal to fall back from malformed canonical definitions. Audit guards deny private config, real TCP and Docker access. |
| Refusal without explicit disposable selection | [Expected fixture error](isolation-refusal.txt), 0.10 seconds, before requesting live_api or creating a tenant. The same audit guards verify no fallback to credentials, Docker or an existing database. This is not counted as a successful scenario execution. |
| Full disposable SQL/Auth-hook/local assertions | [Passed](sql.txt), including the four fields-only SQL placeholders, 2,545 coordinate comparisons/JCS digest and all seven concurrency cases. Existing databases untouched. |
| Full mobile tests | [835 passed, 5 existing optional skips](mobile-tests.txt), 62.02 seconds. No skip was added. |
| Retained SQLite outbox unit case | [1 passed](mobile-unit.txt). It also runs against the real signed loopback API inside the historical acceptance above; that Vitest output is included in final-history.txt. |
| Existing web historical answer/data/form readers | [36 passed](web-history.txt), 0 skipped. Explicit Node test isolation none enumerates all authored cases; no web source or fixture changed. |
| Backend typing | [0 errors, 0 warnings, 0 notes](backend-types.txt), using the explicit repository interpreter and normal subprocess access. |
| Mobile typing and new test lint | [Typecheck passed](mobile-types.txt); [Biome passed](mobile-lint.txt), with one informational computed-key suggestion consistent with the TypeScript index-signature setting. |
| Ruff, changed Python formatting, parity and plan | [Ruff passed](ruff.txt), all nine changed/new Python files pass formatting, [form parity passed](forms-parity.txt), [plan check passed](plan.txt), git diff --check passes. |

The warnings are existing Starlette/SQLAlchemy deprecations and pytest import-rewrite
warnings. Initial typing commands from the wrong scope/restricted interpreter context
could not resolve dependencies; they are not presented as validation passes. The final
scoped check with the repository interpreter succeeds. Intermediate test-authoring
corrections concerned fixture catalog identity and reuse of the existing zone UUID;
no production safety check was weakened to accept them.

The [source manifest](source-preservation.json) records the original HEAD, restored
file hashes and 21 unchanged protected paths. All other backend production paths,
QGIS/web production, schemas/migrations/seeds, original authored form/zone contracts,
fingerprint implementation, OpenAPI and lockfiles are unchanged. The six-file
[production delta](code-delta.json) is +166 / -27 = +139 lines, restoring existing
behavior rather than introducing another abstraction. New tests and read-only SQL
are measured separately; line reduction is not the correctness criterion.

## Reproduction and environment

Scripts and commands were inspected before execution. Database runs used the already
available smaller image decamark-cleanup-tests:local,
sha256:b15dd833ba0be702cff4980114773bc0bb75f44d55addf1419e8ce8bede8b7bb:
PostgreSQL 17/PostGIS + pg_cron, with synthetic local Auth rows, temporary container
storage and cleanup traps. No pinned full Supabase, real provider, physical device or
hosted compatibility is asserted. No containers remained after verification.

All database/API commands removed DATABASE_URL, DATABASE_PASSWORD, DECAMARK_API_URL,
SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and pre-existing disposable selectors. Docker
endpoint/context/TLS selectors were cleared and the managed local Unix socket selected.
EMAIL_ENABLED=false disabled delivery. Configured secret values and private files
were not inspected or printed; synthetic loopback signing tokens stayed in process
memory and were not saved. The inspected zone-api-rehearsal.sh creates its own fresh
container and supplies the paired loopback test URL/container overrides itself.

The essential commands, run with those removals and Node 24.19.0/pnpm 10.17.1, were:

```sh
DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local EMAIL_ENABLED=false \
  sh database/zone-api-rehearsal.sh tests/test_fields_only_history.py -q -s

DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local \
  sh database/baseline-rehearsal.sh

# From backend/, with the adjacent guard copied to an ignored work/ plugin location:
PYTHONPATH="$PWD/../work/final-cleanup:$PWD/src" EMAIL_ENABLED=false \
  uv run --frozen --no-sync --offline python -m pytest -p no_database -m 'not integration' -q
uv run --frozen --no-sync --offline basedpyright --pythonpath "$PWD/.venv/bin/python"

# From the product root:
pnpm --dir mobile test
pnpm --dir mobile typecheck
pnpm forms:parity
pnpm plan:check

# From web/ (executes the individual assertions rather than file-only summaries):
node --experimental-strip-types --test --test-isolation=none --test-reporter=spec \
  tests/unit/answers.test.mjs tests/unit/data-view.test.mjs tests/unit/forms-model.test.mjs
```

The verification-only [guard source](no-database-guard.py.txt) was not added to the
application. The pre-fix failures used production source at 577959a before restoration,
with the same authored historical fixture. The later runs each use a new disposable
database; none simulate a transition by resetting an existing installation.

Exact target inventory, device/queue census and a retention/disposition decision are
still required before the restored compatibility can be removed. They are not needed
to preserve this existing reader in the source. See the [ordered removal gates and
rollback limits](README.md#specific-decision-and-exact-removal-gates).
