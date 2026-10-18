# Inspected local verification commands

HEAD and the dirty worktree were recorded before editing. Root AGENTS.md, backend,
mobile, database and contracts documentation and the existing consolidated/fields-only
reports informed this change. The API and forward rehearsal scripts were read before
execution. Node 24.19.0, pnpm 10.17.1 and repository Python 3.13/uv frozen offline tooling
were used. No provider call, hosted connection, secret-file inspection or existing
Supabase startup/reset was used.

The before/after forward runs use the existing reviewed harness, sourcing the authentic
pre-audit schema blobs from commit 2b5bf9aaa7067c98c44520de3c9b3f573a166731:

```sh
DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local \
  sh docs/reviews/consolidated-audit-2026-10-17/reproduce-forward.sh -q \
  --basetemp=/workspace/deca-mark/work/published-form-compatibility/before-forward
# After the reader fix and explicit expected-result updates:
DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local \
  sh docs/reviews/consolidated-audit-2026-10-17/reproduce-forward.sh -q \
  --basetemp=/workspace/deca-mark/work/published-form-compatibility/after-forward
```

Before expects the reproduced bad outcomes (export 422 / first optional upload 500),
so its passing count proves the defect. After expects successful historical exports
and the satisfiable delayed upload. Existing snapshots, ACL, receipt, migration and
strict revision checks remain in that same test. Neither run modifies historical logs.

Focused fresh-schema acceptance ran the new test module while developing its retained
package, QGIS, inventory and real SQLite/HTTP scenarios. One initial test incorrectly
expected a new canonical upload to retain blank text. It was corrected to distinguish
historical stored blank text from established new-upload pruning; no production blank
semantics changed. Final focused evidence covers the complete scenario.

The relevant combined acceptance ran once after focused checks passed:

```sh
env -u DATABASE_URL -u DATABASE_PASSWORD -u DECAMARK_API_URL \
  -u SUPABASE_URL -u SUPABASE_PUBLISHABLE_KEY \
  -u DECAMARK_TEST_DATABASE_URL -u DECAMARK_TEST_DATABASE_CONTAINER \
  -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  DOCKER_HOST=unix:///var/run/docker.sock \
  DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local EMAIL_ENABLED=false \
  sh database/zone-api-rehearsal.sh -c pyproject.toml \
    tests/test_published_form_compatibility.py tests/test_consolidated_audit.py \
    tests/test_form_revisions.py tests/test_workspace_concurrency.py \
    tests/test_form_validation_api.py tests/test_observation_authorization.py \
    tests/test_fields_only_history.py tests/test_stored_form_compatibility.py \
    tests/test_zone_archive_process.py tests/test_zone_upload_contract.py \
    tests/test_zone_upload_fingerprint.py tests/test_form_namespace_exports.py \
    tests/test_openapi.py tests/test_account_deletion.py tests/test_account_deletion_admin.py \
    tests/test_account_deletion_recovery_assessment.py \
    ../database/tests/test_gis09_api.py -q \
    --basetemp=/workspace/deca-mark/work/published-form-compatibility/combined
```

Each harness creates and removes only its own randomly port-mapped task container.
The cached alternate image `decamark-cleanup-tests:local` is Postgres 17/PostGIS 3.5
plus pg_cron with synthetic Auth tables. This is not the pinned full Supabase stack,
real provider, hosted migration orchestration, physical device or installed QGIS GUI.
The actual production QGIS preparation CLI runs against actual signed-HTTP exports.

Other checks use frozen/offline uv, repository Ruff/BasedPyright and installed pnpm
commands: guarded database-free shared cases, focused mobile definitions/transport/
legacy and rejected outbox cases, mobile typecheck, scoped Biome, form parity, plan
check and OpenAPI regeneration into scratch compared byte-for-byte. BasedPyright
requires subprocess access to discover the local interpreter; sandbox-only discovery
failed before the normal local subprocess run completed. No dependencies were installed.

After the combined run, exact detail definition and list answer/attribution assertions
were added to the new test. Only `-k published_history_exports` was rerun with a new
`work/published-form-compatibility/readback-assertions` disposable basetemp, alongside
scoped typing/lint. Production source was unchanged.

From web/, existing historical answer/profile reader tests ran with
`node --experimental-strip-types --test --test-isolation=none tests/unit/answers.test.mjs tests/profile-answer.test.mjs`.
The initial default-isolation run reported only two file wrappers; the explicit
no-isolation rerun enumerates the actual authored assertions, as in the previous assessment.
No web source changed. Strict collector installation source was also inspected; it is not
claimed to install invalid forms, and retained outbox behavior remains a separate path.
