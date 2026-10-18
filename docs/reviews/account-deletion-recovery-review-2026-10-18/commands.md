# Commands and evidence provenance

All commands were inspected first. Base: `072c03f5d06b06f82036df5cb02569421655b600`.
The normal repository environment already supplies Node 24.19.0. The following
environment prefix was used for each API harness/full-suite execution:

```sh
env -u DATABASE_URL -u DATABASE_PASSWORD -u DECAMARK_API_URL \
  -u SUPABASE_URL -u SUPABASE_PUBLISHABLE_KEY \
  -u DECAMARK_TEST_DATABASE_URL -u DECAMARK_TEST_DATABASE_CONTAINER \
  -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
  DOCKER_HOST=unix:///var/run/docker.sock \
  DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local EMAIL_ENABLED=false \
  UV_CACHE_DIR=/workspace/deca-mark/work/pr30-review/uv-cache \
  COREPACK_HOME=/workspace/deca-mark/work/corepack \
  PATH=/workspace/deca-mark/work/bin:$PATH \
  COMMAND_BELOW
```

Final focused command (after fixture cleanup correction):

```sh
sh database/zone-api-rehearsal.sh \
  tests/test_zone_authorization_races.py tests/test_account_deletion.py \
  tests/test_account_deletion_admin.py tests/test_account_deletion_recovery.py \
  tests/test_account_deletion_recovery_assessment.py \
  -q --basetemp=/workspace/deca-mark/work/pr30-review/focused-final
```

Full suite, using the exact product command selected by CI:

```sh
pnpm backend:test ZONE_API_REHEARSAL=1
```

Fresh-checkout forward verification used a new local `git clone --shared --no-hardlinks`
under ignored `work/pr30-review/fresh-final`. Before running it, `test ! -e .../work`
proved its ignored working directory did not exist. The current forward script and
tenant-fixture cleanup were copied into that clone, and the already installed locked
`backend/.venv` was symlinked. From the original repository:

```sh
DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local \
  sh work/pr30-review/fresh-final/docs/reviews/account-deletion-recovery-2026-10-17/reproduce-forward.sh \
  -q --basetemp=/workspace/deca-mark/work/pr30-review/forward-final
```

The forward script itself unsets database/provider/Docker selectors, chooses the local
socket, creates a new container and loads only authentic old-schema blobs plus synthetic
seeds. It runs the existing forward-migration acceptance through pytest and cleans up
its own container. This does not reset or downgrade an existing database.

Static checks from backend/, with the same writable UV cache and frozen/offline tooling:

```sh
uv run --frozen --no-sync --offline ruff check .
uv run --frozen --no-sync --offline ruff format --check \
  tests/test_zone_authorization_races.py tests/tenant_fixtures.py
uv run --frozen --no-sync --offline basedpyright \
  --pythonpath /workspace/deca-mark/backend/.venv/bin/python --verbose
```

The type checker needs normal subprocess access to discover installed Python packages
in this managed environment. Its initial restricted runs failed discovery; no type
diagnostic was hidden and no source/configuration was loosened. The final permitted
run passes. Other checks: `sh -n` on the forward script, parsed CI YAML, `make -n
backend-test ZONE_API_REHEARSAL=1`, protected-source hashes, and whitespace checks.

Raw failing focused output is retained to show the synthetic-teardown defect, followed
by the complete passing focused/full/forward outputs. No prior test result is relabeled
as a newly executed result. Hosted data, provider credentials and real provider endpoints
were not accessed. GitHub PR/review/CI metadata access is separate from hosted acceptance.
