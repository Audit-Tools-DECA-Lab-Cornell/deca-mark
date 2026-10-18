# Commands and verification provenance

Repository: /workspace/deca-mark. Starting HEAD b93a2b2456cf5d7dc96cfc2fc3eaf5174bc34f4c;
Node 24.19.0, pnpm 10.17.1, repository Python 3.13, frozen/offline uv tooling.
Root AGENTS.md, component instructions, deletion/worker/schema source and latest
consolidated/published-form reports were read. The API, SQL and forward rehearsal
commands were inspected before execution. No dependencies were installed.

Public Supabase changelog and Auth source were fetched only to verify API-version,
hard-delete and user_not_found semantics; hashes/URLs are in provider-contract-sources.json.
The Auth/key boundary was always mocked in runtime tests. No real provider or target
database was contacted.

The installed Supabase 2.118.0 CLI's migration --help failed because it attempted to
initialize /home/agent/.supabase on a read-only filesystem. No home write or secret
access was authorized to work around that. Following the repository's unavailable-CLI
fallback, the new UTC-timestamped migration file was created after the latest existing
file. No applied migration was edited. Direct transactional SQL tests do not claim
CLI/hosted ledger verification.

Focused failure/recovery acceptance used database/zone-api-rehearsal.sh with:

```sh
env -u DATABASE_URL -u DATABASE_PASSWORD -u DECAMARK_API_URL \
  -u SUPABASE_URL -u SUPABASE_PUBLISHABLE_KEY \
  -u DECAMARK_TEST_DATABASE_URL -u DECAMARK_TEST_DATABASE_CONTAINER \
  -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  DOCKER_HOST=unix:///var/run/docker.sock \
  DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local EMAIL_ENABLED=false \
  sh database/zone-api-rehearsal.sh \
    tests/test_account_deletion.py tests/test_account_deletion_admin.py \
    tests/test_account_deletion_recovery.py tests/test_account_deletion_recovery_assessment.py \
    -q --basetemp=/workspace/deca-mark/work/deletion-recovery/focused-final
```

An initial focused development run exposed only the test's t/f boolean-rendering
expectation. The corrected complete focused set passed 43 cases. No production
outcome was loosened to pass it. The current typing correction changes only a test
callback annotation, not behavior.

Forward migration and complete SQL acceptance ran on independent fresh databases:

```sh
DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local \
  sh docs/reviews/account-deletion-recovery-2026-10-17/reproduce-forward.sh -q \
  --basetemp=/workspace/deca-mark/work/deletion-recovery/forward

# With the same unset database/provider/Docker selectors and explicit local socket:
DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local \
  sh database/baseline-rehearsal.sh test
```

The forward harness stages authentic pre-recovery schema blobs from Git b93a2b2.
It does not downgrade a current database or reset an existing installation. The test
applies the new migration transactionally after seeding synthetic retained history.
All harnesses remove only their own temporary containers, without persistent volumes.

The relevant combined acceptance ran **once** after focused checks, with the same
environment isolation and API harness:

```sh
sh database/zone-api-rehearsal.sh -c pyproject.toml \
  tests/test_account_deletion_recovery.py tests/test_published_form_compatibility.py \
  tests/test_consolidated_audit.py tests/test_form_revisions.py \
  tests/test_workspace_concurrency.py tests/test_form_validation_api.py \
  tests/test_observation_authorization.py tests/test_fields_only_history.py \
  tests/test_stored_form_compatibility.py tests/test_zone_archive_process.py \
  tests/test_zone_upload_contract.py tests/test_zone_upload_fingerprint.py \
  tests/test_form_namespace_exports.py tests/test_openapi.py \
  tests/test_account_deletion.py tests/test_account_deletion_admin.py \
  tests/test_account_deletion_recovery_assessment.py ../database/tests/test_gis09_api.py \
  -q --basetemp=/workspace/deca-mark/work/deletion-recovery/combined
```

The cached alternate image is PostgreSQL 17/PostGIS 3.5 plus pg_cron, with synthetic
Auth tables. It is not full/pinned Supabase Auth/Storage or hosted compatibility.

Other checks: repository Ruff and formatting; backend BasedPyright with explicit
.venv/bin/python; explicit typing/lint of the cross-directory forward test; shell
syntax; OpenAPI generation to scratch and byte comparison; git diff --check. The
guarded database-free run covered account-deletion provider cases, shared definition/
answer cases and stored-form compatibility with database selectors unset, denying
private configuration, actual TCP and Docker through the existing verification-only
audit hook. No production behavior was replaced by that hook.

Source preservation and current delivery state are recorded separately. Dated prior
reports and compatibility/client/contract files remain byte-identical. Historical
CSV/ZIP bytes and stored research answers were not normalized or rewritten.
