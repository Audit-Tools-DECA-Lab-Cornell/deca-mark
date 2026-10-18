# Commands inspected and executed

Repository root: /workspace/deca-mark. Node 24.19.0, pnpm 10.17.1, repository
Python/uv environment. The API and forward harnesses were read before execution.
No command starts/resets an existing Supabase stack or targets a hosted service.

The combined acceptance ran once:

```sh
env -u DATABASE_URL -u DATABASE_PASSWORD -u DECAMARK_API_URL \
  -u SUPABASE_URL -u SUPABASE_PUBLISHABLE_KEY \
  -u DECAMARK_TEST_DATABASE_URL -u DECAMARK_TEST_DATABASE_CONTAINER \
  -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  DOCKER_HOST=unix:///var/run/docker.sock \
  DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local EMAIL_ENABLED=false \
  sh database/zone-api-rehearsal.sh -c pyproject.toml \
    tests/test_consolidated_audit.py \
    tests/test_form_revisions.py tests/test_workspace_concurrency.py \
    tests/test_form_validation_api.py tests/test_observation_authorization.py \
    tests/test_fields_only_history.py tests/test_stored_form_compatibility.py \
    tests/test_zone_archive_process.py tests/test_zone_upload_contract.py \
    tests/test_zone_upload_fingerprint.py tests/test_form_namespace_exports.py \
    tests/test_openapi.py tests/test_account_deletion.py tests/test_account_deletion_admin.py \
    tests/test_account_deletion_recovery_assessment.py \
    ../database/tests/test_gis09_api.py -q \
    --basetemp=/workspace/deca-mark/work/consolidated-audit/fresh
```

The reviewed forward harness removes hosted/provider/old disposable selectors
itself and selects the managed local Docker socket. The first focused run verified
preservation of valid state; after identifying the older invalid canonical subtype,
the case was expanded and run once more, without repeating the combined set:

```sh
DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local \
  sh docs/reviews/consolidated-audit-2026-10-17/reproduce-forward.sh -q \
  --basetemp=/workspace/deca-mark/work/consolidated-audit/forward-with-inverted
```

Pytest owns/replaces its --basetemp directory. These are dedicated task scratch
paths, not existing databases or user directories. Choose a new dedicated path for
a later reproduction.

Other checks:

- Backend scoped Ruff, formatting and BasedPyright with the explicit
  /workspace/deca-mark/backend/.venv/bin/python and frozen/offline uv execution.
- Cross-directory forward test typed explicitly; existing history test imported and
  typed again after its type-only import correction. Runtime suites were not repeated
  for that static-only edit.
- OpenAPI exported to work/consolidated-audit/openapi.json; each app's installed
  openapi-typescript regenerated declarations to scratch. All three outputs were
  compared byte-for-byte with the repository contracts.
- From web/: node --experimental-strip-types --test --test-isolation=none
  tests/unit/forms-concurrency.test.mjs.
- From the root: pnpm --dir mobile exec vitest run src/forms/definition.test.ts
  src/forms/definition-cases.test.ts src/sync/bound-upload.test.ts
  src/sync/fields-only-outbox.test.ts src/data/api/client.test.ts
  src/features/account/deletion.test.ts.
- Web/mobile typechecks, forms:parity and plan:check through pnpm 10.17.1.
- Two shared backend form-case modules run without database variables under the
  existing verification-only no_database audit hook, denying private configuration,
  actual TCP and Docker access.
- Standalone GIS wrapper collection without database selectors, and actual runtime
  execution of that wrapper within the combined set. The converter runs with env={},
  a ten-second deadline and the actual ZIPs, as recorded by the acceptance source.
- Archived pre-fix validator modules loaded from the local audited Git object into
  ignored scratch, then the same saved invalid definition checked by the current
  validator. No branch or existing working file was changed for that comparison.

All original production and report files remain unchanged. The one existing-file
correction is recorded separately. Current-run results are in evidence/; source,
artifact and rollback interpretation are in rollout.md. Raw synthetic export bytes
and snapshots were retained; CRLF in CSV evidence is intentional.
