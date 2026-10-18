# PR #30 verification corrections — October 18, 2026

Starting HEAD: `072c03f5d06b06f82036df5cb02569421655b600`, branch
`review/account-deletion-recovery`, initially clean. These corrections address the
review of [PR #30](https://github.com/Audit-Tools-DECA-Lab-Cornell/deca-mark/pull/30).
The recovery implementation and migration are unchanged. No hosted data/provider,
secret/environment file, existing database, deployment or merge is involved.

## Corrections

The account-forgetting authorization-race fixture now patches the router's current
`reconcile_one(sessions, settings, user_id=None, key=None)` boundary and returns false
without consuming the committed pending job. The synthetic key is a `SecretStr`;
the callback checks the intended manager UUID and key. Both races retain their real
SQL lock barriers, before/after snapshots, status/authorization assertions and publication
checks. Both also explicitly assert `202 {"status":"pending"}` for forgetting.

CI's backend job now runs the **entire** suite using
`pnpm backend:test ZONE_API_REHEARSAL=1`. It first caches the pinned
`public.ecr.aws/supabase/postgres:17.6.1.171` image required by the existing harness's
`--pull never`. The harness creates a fresh database/container and supplies both
validated disposable selectors. Recovery guards remain intact; no test is skipped or
excluded. The backend job no longer starts an unused persistent-style Supabase stack;
the separate database CI job remains unchanged. Harness cleanup stops only its own
temporary container.

The forward script creates its ignored `work/deletion-recovery` parent before
`mktemp`. CI also runs this rehearsal after the backend suite and fetches complete
Git history so the authentic pre-recovery `b93a2b2` migration blobs are available.
The script still applies the forward migration only to synthetic disposable data.

Running races **before** recovery acceptance exposed another test-only interaction:
tenant cleanup had disabled FK triggers for immutable-fixture removal and then deleted
profiles without restoring them. Consequently, pending jobs from the forgotten synthetic
managers survived and later lifecycle workers correctly attempted those unrelated jobs.
The initial combined focused run recorded two failures and 51 passes. Cleanup now
restores normal trigger/cascade behavior before deleting only that tenant's profiles.
This removes their recovery rows through the real FK and works before the recovery
table exists too. No global job purge, worker filtering, isolation-guard removal or
provider-behavior relaxation was introduced.

## Newly executed verification

- Focused races plus deletion/provider/recovery/crash-boundary acceptance:
  **53 passed**, 12 existing dependency warnings, **57.13 seconds**.
  Races precede recovery in this run, covering the teardown interaction directly.
- Forward migration from a fresh local clone, with **no pre-existing `work/` directory**:
  **1 passed**, two existing warnings, **5.45 seconds**. The clone reused the installed
  locked Python environment through a `.venv` symlink; this verifies the repaired
  fresh-checkout script, not dependency installation. The current script and tenant
  cleanup were copied into the clone before execution. Synthetic retained history,
  permissions, packages and old tombstones are exercised by the existing acceptance.
- Full backend suite: **864 passed**, no skips/failures, 122 existing dependency
  warnings, **590.97 seconds**. This uses the complete product command selected by CI.
- Repository Ruff: all checks pass. Both changed Python files pass formatting.
  Shell syntax, CI YAML parsing/required-step assertions and `git diff --check` pass.
  Full backend BasedPyright: **0 errors, 0 warnings, 0 notes** using the repository
  interpreter. The initial restricted type-check process could not discover installed
  packages; the permitted subprocess-capable run resolves them and passes.

Exact commands and raw local results are in [commands.md](commands.md) and
`evidence/`. Local tooling: Node 24.19.0, pnpm 10.17.1, Python 3.13.5,
frozen/offline repository Python tooling. Configured database/provider selectors are
unset for local suite execution; Auth and key access are mocked at their existing
boundaries. Fresh-clone runs and harnesses create no persistent database volumes.

Local acceptance uses cached `decamark-cleanup-tests:local` (PostgreSQL 17/PostGIS 3.5
plus pg_cron and synthetic Auth tables). It is an alternate image, **not pinned full
Supabase Auth/Storage or hosted compatibility**. The subsequent GitHub CI run tests
the pushed SHA with the pinned database image; its final result/run URL will be
recorded on the PR after completion, rather than attributed to an earlier commit.

## Preservation and rollout assessment

All eight [protected compatibility/contract hashes](../account-deletion-recovery-2026-10-17/protected-contracts-and-compatibility.json)
still match. No runtime, migration, form definition, observation, package, fingerprint,
queued-upload body, compatibility reader, generated contract or necessary client changes
in this follow-up. The earlier artifact manifest describes the earlier commit:
`reproduce-forward.sh` is its sole intentionally changed artifact. Earlier raw results
and dated assessments remain unchanged evidence; they did not constitute full-suite
acceptance of these review corrections.

The [operational runbook and migration/runtime ordering](../account-deletion-recovery-2026-10-17/rollout.md)
remain applicable. The review PR retains its `[skip preview]` title and exact-branch
Vercel guards. No migration or deployment is authorized here. Locally reliable deletion
recovery does not establish hosted acceptance, monitor/operator ownership or real-provider
behavior. Target/device inventory, offline-queue accounting and owner retention/protocol
decisions for unsatisfiable observation queues remain open. Both historical form readers
must remain; this follow-up does not declare the entire audit or release ready.
