# Consolidated audit verification and rollout assessment — October 17, 2026

## Verdict

**The combined worktree passes the scoped local integration checks, but the full
release is not ready for an unconditional rollout.** The six requested changes
coexist for supported canonical forms and historical fields-only forms. Two
separate gates remain:

1. **Account-deletion completion is open.** Local forgetting is durable, but no
   implemented reconciler or complete, owned operator procedure finishes Auth
   deletion after retries stop or a process dies. A 202/log entry is not completion.
2. **Pre-existing invalid canonical forms need a target preflight.** Older code
   could publish contradictory numeric bounds. The corrected parser rejects those
   immutable definitions on upload/export. This was reproduced locally; whether
   any selected real target contains them is unknown. An affected target must wait
   for a separately assessed preservation solution, not an in-place rewrite.

The fields-only reader is retained and is part of the assessed artifact. **HEAD
577959a alone does not contain that uncommitted restoration and must not be used
as a substitute for this verified worktree.** Review and package the entire assessed
change before any separately authorized release. No commit, push, deployment,
hosted access, secret-file inspection or existing-database reset occurred here.

## Assessed source and preservation

- HEAD: **577959a2a99c9d8390203eded76e2149ac780162**, branch work.
- Initial state: [38 existing changed/untracked files](initial-status.txt),
  including the compatibility restoration and its evidence. [State record](initial-state.json).
- Final [worktree status](final-status.txt) and [delivery state](final-state.json)
  record the additional assessment artifacts; HEAD and the real index are unchanged.
- Of **1,570 pre-existing working files, 1,569 remain byte-identical**. The sole
  correction moves a type-only LiveApi import in the existing history test under
  TYPE_CHECKING after Ruff reported TC001. [Exact correction](lint-only-correction.patch)
  and [preservation check](preservation.json). All production, prior authorization,
  QGIS, revision, canonical-validation and fields-only behavior remains unchanged.
- This assessment adds focused acceptance tests, a synthetic forward-migration
  harness, a read-only canonical-bound inventory and this evidence. It changes no
  production implementation, migration, client, contract, lockfile or existing report.
  The only existing-test edit is the import-only lint correction above.

Inputs read include root/web AGENTS.md, the pre-launch policy, the
[original condensed audit](../engineering-audit-2026-10-16/audit.md), component
instructions and the authorization, form-revision/post-merge, canonical-validation,
QGIS, cleanup and [fields-only transition](../fields-only-transition-2026-10-17/README.md)
reports. Earlier success reports are historical evidence, not newly executed checks.

## Findings and current disposition

| Finding | Disposition | Current source and newly executed evidence |
| --- | --- | --- |
| 1. Observer ownership and review/export authorization | **Fixed locally** | observation_creator_visibility migration retains current membership/account scope, immutable creator ownership, reviewer inheritance and Training isolation. services/observation_exports.py requires research manager/viewer access. The 203-case combined run executes test_observation_authorization.py and the new canonical workflow: another creator's same-initials record is hidden, observers cannot export, viewers/managers can read/export. |
| 2. Current signed exports fail QGIS conversion | **Fixed locally** | qgis/zone-boundaries/prepare.py consumes current metadata, joins exact package+zone snapshots and checks CSV agreement and archive safety. Both the new canonical workflow and the retained Inventory-bound GIS scenario execute the real CLI against actual signed CSV/GeoJSON ZIPs. [Canonical artifacts](canonical/analysis/projection-checks.json), [GIS artifacts](gis/analysis/projection-checks.json). |
| 3. Stale draft save/discard and unreviewed publication | **Fixed locally** | form_preconditions.py; repositories/forms.py conditional mutations; services/forms.py; form_draft_revisions migration; web mutation/editor/review propagation. Combined HTTP/independent-transaction cases verify 428, 412, 409 and unchanged drafts after stale operations. Real web component/action/client tests pass. |
| 4. Contradictory numeric bounds and independent answer IDs | **Mitigated; existing-data gate open** | New authoring/publication rejects inverted bounds in Python and the shared web/mobile parser. Equal/negative/zero bounds and envelope-named nested answers remain valid; export columns retain collision protection. New canonical workflow uses nested round_type=7 while the envelope remains standard and exports answer_round_type separately. Existing invalid published canonical definitions are the separate gate described below. |
| 5. Obsolete compatibility/reservations and duplicate test implementations | **Mitigated with necessary compatibility retained** | Unused ExtractJob/Bootstrap/service extraction/query paths remain removed. Supported PublishJob/ImportJob and extract_base_archive remain, with process environment isolation, limits, checksum, deadline and cleanup tests. Auth/RLS/rechecks, boundaries and receipts remain. Upload cases exercise production models against independent goldens; no reserved-answer-ID guard was restored. The necessary fields-only reader is explicitly retained. |
| 6. Fields-only stored-form regression introduced by cleanup | **Fixed locally by retaining compatibility** | Original legacy_forms.py and stored dispatch/export behavior coexist with canonical-only authoring. test_fields_only_history.py and test_stored_form_compatibility.py execute in the combined set, including retired forms, superseded packages, original receipt replay, real SQLite restart/upload and mixed exports. No definitions, decimal/boolean/blank meanings, package bytes or fingerprints are converted. |
| Separate account-deletion recovery assessment | **Open; release blocker for reliable enabled deletion** | identity DELETE commits forget_user before the bounded Auth call. Existing tombstones and client retries are useful but not a completion mechanism independent of the client. New crash-boundary test and existing provider-failure tests demonstrate this explicitly. |

## Newly executed verification

The [203-case combined acceptance](evidence/combined.txt) ran **once** against a fresh
task-owned database, in 213.11 seconds (9 existing warnings). It includes:

- the new complete canonical workflow;
- form revision/precondition/concurrency and numeric-bound regressions;
- the observer/reviewer authorization matrix;
- the representative fields-only history and stored-parser regressions;
- real publication corruption/deadline tests and production upload/receipt/fingerprint
  cases with independent golden expectations;
- OpenAPI determinism/drift, existing account-deletion/transport failure cases,
  the new crash-boundary assessment and the retained cross-directory GIS scenario.

The new canonical workflow authors a form, saves a revision, rejects missing and stale
save/discard/publication without mutation, explicitly reviews and publishes the current
revision, prepares/downloads a package and collects/uploads a signed observation. It
retries the same committed UUID/body after a lost acknowledgement and rejects changed
content. A second creator uploads the same initials/body. Observer isolation and export
denial are checked before viewer/manager review and CSV/GeoJSON export. The real
prepare.py CLI then consumes those exports, retaining both event identities and the
independent nested envelope-named answer. This is a real HTTP workflow with authored
collection payloads; it is not a native UI walkthrough. Collector logic is exercised
separately by the focused client cases and the fields-only SQLite/HTTP regression.
[Export ZIPs and prepared layers](canonical/).

Additional focused checks, newly executed here:

| Check | Result |
| --- | --- |
| Authentic pre-fix schema → current audit migrations, data/grant preservation | [1 passed](evidence/forward.txt), 8.38 seconds. |
| Expanded forward case including the pre-existing inverted-bound risk | [1 passed](evidence/forward-with-inverted.txt), 7.40 seconds. This focused rerun was justified by the newly identified data subtype; the combined suite was not repeated. Expected HTTP 422/500 outcomes reproduce an **open blocker**, not acceptable release behavior. |
| Shared authored form cases, database-free with private-file/TCP/Docker guards | [56 passed](evidence/shared-cases.txt), 0.48 seconds. |
| Actual web editor/review/discard/actions/API client | [3 passed](evidence/web-preconditions.txt); explicit Node test isolation none executes the authored component assertions. |
| Collector definitions, nested-body/receipt handling, retained outbox, API and deletion client cases | [101 passed](evidence/mobile-focused.txt), 6 files, no skips, 2.74 seconds. |
| Backend and new cross-directory migration-test typing | [0 errors/warnings/notes](evidence/backend-types.txt); [forward case also clean](evidence/forward-types.txt). |
| Web/mobile typechecks and form-source parity | Passed: [web](evidence/web-types.txt), [mobile](evidence/mobile-types.txt), [parity](evidence/forms-parity.txt). |
| OpenAPI and both generated clients | Regenerated into ignored scratch files and byte-compared with committed outputs: [all identical](contracts-checked.json). No generated source was overwritten. |
| Ruff / formatting / shell syntax / whitespace | [Final Ruff passes](evidence/ruff-final.txt) after the import-only correction; changed assessment Python files and the forward harness pass their scoped checks; git diff --check passes. The prior test's runtime assertions passed in the combined run before that static-only edit. |

The earlier 518/835/full-SQL results in the fields-only report are not counted as new
runs. Full backend/mobile/web suites, installed QGIS layout/reopen and the SQL numeric/
concurrency suite were not repeated without a new need. The focused combined set
directly exercises the preserved protections relevant to this assessment.

## GIS discrepancy is resolved

The earlier failing case was the same retained scenario now exposed as
database/tests/test_gis09_api.py::test_v1_v2_gis_readback_matches_signed_exports.
It was not established to be an obsolete duplicate. The old zone_site setup bound
only the play form, so inventory=None was correct and its Inventory assertion failed
before conversion. Separate cross-directory collection also lacked fixtures; loading
the whole backend conftest could collide when combined with backend tests.

Current gis_workspace is a dedicated fixture. It publishes gis-inventory with its
returned ETag and binds it **before package v1**; the scenario asserts that binding.
It then publishes a smaller v2 and uploads delayed v1 point and whole-zone Inventory
records. The wrapper directly re-exports the required fixtures/function instead of
registering conftest wholesale. [Standalone collection finds exactly one case](evidence/gis-collection.txt),
and that case executes successfully inside the combined acceptance.

Its actual signed exports produce **3 events, 2 point events, 1 full multipart
Inventory polygon and 2 historical snapshots** through the production converter.
Original Inventory event geometry remains null. SQL/API/export/projection attribution
and CSV agreement are checked. The scenario was not removed or weakened, and no
missing-inventory or duplicate-plugin failure remains unexplained. Interactive
Desktop, installed-provider/layout refresh and hosted GIS remain separate gates.

## Fresh initialization and existing-installation migration

Fresh acceptance applies the actual current four migration files plus local synthetic
identity seeds, then runs the combined source against restricted fieldmaps_api.
The current shell initializer is canonical. This is evidence for a new installation,
not a reason to reapply a baseline to an existing database.

The [forward harness](reproduce-forward.sh) starts a different disposable database
from the actual audited commit **2b5bf9aaa7067c98c44520de3c9b3f573a166731** baseline and
outbox blobs, not a current schema with revision artificially removed. It seeds:

- the former fields-only shell and signed observer/manager observations;
- real production-prepared package archives and durable upload receipts;
- published canonical and editable draft forms;
- fields-only decimal, boolean and blank-answer research history;
- in the expanded case, a published optional inverted-bound canonical form that
  the old validation permitted, with a package and historical observation.

The current package/upload paths, which do not reference form revision, create the
synthetic archives/receipts before migration; form-version fixtures are inserted
directly as synthetic prior state. This does not claim that the complete current API
supports the old schema. Only the exact two pending audit SQL files are then applied,
each transactionally.
The [before](forward/before.json) and [after](forward/after.json) snapshots are identical
after excluding the newly added form revision column. They include definitions,
draft/published metadata, observations and upload hashes, complete archive bytea,
package/zone attribution, memberships, table ACLs and non-revision column ACLs, restricted-role
superuser/bypass flags and the unchanged baseline ledger. [Artifact checks](forward-artifact-checks.json)
also independently verify decimal 1.25, boolean false and blank text in actual
GeoJSON, and their established CSV representation (1.25/no/empty).

All form revisions initialize at 1; the unconditional two-argument publication
function disappears; runtime execution of the revision-bearing function remains
granted and direct revision UPDATE is denied. Observer visibility changes from the
old broad scope to creator-only. Original receipt bytes replay and another delayed
upload uses its original package; existing draft save/stale publication checks work.
Valid historical subsets remain exportable with the original definitions.

This harness executes the reviewed SQL directly in disposable PostgreSQL. It does
not verify Supabase CLI migration-ledger orchestration, a hosted ledger, full Auth,
Storage, or deployment sequencing. The applied file hashes are [recorded](forward/applied.json).

## Existing invalid canonical data: a specific additional gate

Correcting min > max validation protects new authoring and publication, but the
strict stored-form parser also runs for uploads and typed exports. An installation
may already contain a published or retired canonical form accepted by the old code
with such a question, including an optional/hidden question and otherwise meaningful
observations. Fields-only compatibility does not apply when questions is present.
The [archived validator execution](evidence/old-validator.txt) and
[current validator execution](evidence/current-validator.txt) use the same synthetic
immutable definition. [Archived module hashes](old-validator-source.json) identify
the actual older source; this conclusion is not inferred from another agent's report.

The expanded forward case preserves just such a synthetic form/package/record.
After migration, raw detail remains readable; its typed export returns HTTP 422
export_scope_too_large and a first bound upload returns HTTP 500. An unfiltered mixed
project export also fails; valid package-scoped subsets still export. These are
existing-data compatibility failures, not intended validation responses to new
authoring. No claim is made that a hosted target contains this data.

Before releasing the strict validator on a selected existing target:

1. Run the read-only [canonical-bound preflight](canonical-bound-preflight.sql) after
   explicit target authorization. This identifies the exact audited bounds defect;
   it is not a full replacement for validating stored definitions with the current
   parser. [The synthetic hit](forward/canonical-bound-preflight.txt) verifies the query.
2. Assess all published/retired hits, their package/observation references and device
   queues. Invalid mutable drafts can be corrected through reviewed conditional
   editing; frozen definitions cannot be overwritten to make the check pass.
3. If a retained frozen hit exists, block that target's rollout until a narrow,
   separately reviewed historical read/export/upload preservation decision and
   implementation is verified. Keep the prior compatible runtime/access available
   meanwhile. A canonical successor does not repair old package references.

No automatic conversion, baseline reapplication, database reset or bypass of new
authoring/publication validation is supplied. This is a larger remaining defect
reported for explicit follow-up, not another cleanup performed by this task.

## Account-deletion recovery: separate assessment

The actual sequence is:

1. Validate Auth Admin configuration before any local forgetting.
2. Commit forget_user under account/organization locks. It removes memberships and
   anonymizes/upserts profiles.deleted_at, preserving immutable research records and
   attribution. Last-owner/manager refusal rolls back.
3. Make at most two bounded Auth Admin DELETE attempts. Success or 404 yields 204;
   exhausted attempts emit a sanitized pending log/Sentry event and return 202.

The profile tombstone is a genuine durable pending marker. Auth-row deletion
cascades that marker away. A still-authenticated repeat DELETE is idempotent and can
finish. Mobile and web retry a few times while the confirmed account remains signed
in, then tell the person/operator that completion remains recorded. A lost first
response/5xx is ambiguous; web failedWrite correctly avoids claiming that nothing
changed. A client retry is still dependent on session and application lifetime.

The new test fault-injects an exception **after local commit and before the provider
attempt**, then opens a new application instance. The Auth row and tombstone remain,
memberships are gone, normal identity access returns 403, and startup does not finish
Auth deletion. The pending-error log is absent in this crash window. An explicit
repeat with mocked provider 404 succeeds. The synthetic Auth-row deletion then
demonstrates the expected FK cascade. This is exception/new-instance boundary
testing, not an OS crash or real Auth-service run.

Source tracing found no deletion reconciler in application startup/workers/cron.
The database plan explains how to list tombstones; OPS-12's daily >24-hour alert is
**todo**. Neither is a complete implemented operator procedure with an assigned
owner, secure execution path, retries and completion verification. Pending logs can
also be lost at the tested crash point. Therefore recovery is **open**.

The smallest concrete remedy is to reuse the existing tombstone and bounded
delete_auth_user helper, without another workflow framework:

1. Provide an operator-owned scheduled scan or executable runbook for
   SELECT user_id, deleted_at FROM fieldmaps.profiles WHERE deleted_at IS NOT NULL.
   It must work independently of the deleting person's JWT and survive restart.
2. Confirm the approved database/issuer pairing, then invoke the existing bounded
   helper for each selected UUID with managed service credentials. Never log keys,
   forward them through redirects or substitute another account/target.
3. On timeout/5xx retain the marker and retry later; on success/404 verify the Auth
   deletion and cascade. Never delete the marker directly or restore memberships
   to make the queue look empty. Completion is provider-side identity deletion,
   not a log or 202. Record safe attempt/completion evidence and alert aging work.
4. Test client disappearance, expired session, process death before/after provider
   success, duplicate runs, 404, unavailable provider/configuration and restart.
   Assign an owner and response deadline before enabling reliable self-service deletion.

This remedy is specified, not implemented or authorized for hosted execution here.
The full release must wait for it or an explicitly approved operating restriction
that prevents local forgetting while reliable completion is unavailable. The existing
unconfigured-Auth-Admin path returns 503 before forgetting; keeping that capability
unavailable is a possible restriction to assess and approve, not a configuration
change made here or completion of the deletion feature. A separate
security hotfix decision must not be represented as closing account-deletion recovery.

## Required rollout order (assessment only)

1. **Select and authorize each target.** Check actual migration history, schema,
   role flags and current release versions read-only. Prior hosted reports record
   earlier authorized applications; they do not establish today's target state.
   Unexpected baseline/history requires separate reconciliation, not a reset or
   migration-ledger rewrite. Review the complete artifact including uncommitted reader work.
2. **Complete data/recovery gates.** Keep the fields-only reader. Inventory existing
   formats with database/fields-only-inventory.sql; account for relevant device queues
   and retention before any eventual reader removal. Perform the canonical preflight
   above. Resolve account-deletion operation or keep the capability safely unavailable.
3. **Pause form mutations and drain older API writers/editor tabs.** A migration alone
   cannot make an old unconditional-save API safe. Preserve collector queues and package
   files; do not reset devices as a release technique.
4. **Apply only pending canonical migrations in timestamp order through the target's
   normal approved migration process.**

   | File | Ordering and purpose |
   | --- | --- |
   | 20261012120000_current_baseline.sql | Fresh installations only, or an independently assessed target with no existing baseline. Never reapply to an initialized installation. |
   | 20261012142629_transactional_email_outbox.sql | Existing supported prerequisite when missing; do not rerun if recorded. |
   | 20261017000657_observation_creator_visibility.sql | Correct existing SELECT policy without data/grant rewrites. |
   | 20261017050453_form_draft_revisions.sql | Add revision=1, guarded revision increments and reviewed publication signature/grant. |

5. **Release the matching API, then its web form-authoring client within the paused
   window.** Every serving API must carry the review/export guard, CAS logic, canonical
   fixes, compatible stored readers and export/worker code. Reload old editor tabs and
   review current revisions; do not automatically adopt newer ETags for retries.
   Update the actual QGIS preparation consumers alongside current exports.
6. **Verify the approved target with synthetic role accounts**, without granting extra
   database privileges to force a test to pass: observer own-only/403 export, reviewer
   access, Training isolation, revocation, lost-receipt replay, stale/missing form
   preconditions, frozen history and actual signed CSV/GeoJSON through prepare.py.
   Health/ready alone do not establish these contracts.
7. **Resume form writes only after all writers are revision-aware.** Record target
   migration/release identities, rollback artifact, recovery ownership and remaining
   hosted/device acceptance. This document grants no deployment authorization.

## Mixed-version behavior and contracts

- New API on a database without revision support is unsupported. Do not point it at
  the pre-migration schema merely because health responds.
- Old API after the revision migration cannot call the removed two-argument publish
  function. Its old unconditional saves may still overwrite drafts while incrementing
  the trigger revision. Keep it drained from form writes.
- Old web/direct clients sending no valid If-Match receive **428**, stale UUID/revision
  clients **412**, and frozen lifecycle conflicts **409**, without adopting content.
- The OpenAPI header parameter is structurally optional so runtime code can return
  the documented 428; its description requires a strong ETag. [Contract inspection](form-contract.json).
  Generic generated calls alone do not enforce this presence. Supported web save,
  discard and publication wrappers require an etag argument and pass it unchanged;
  component tests verify loaded/saved/reviewed propagation and conflict handling.
  Any additional writer must be inventoried and updated before form writes resume.
- The collector only reads forms. Existing bound uploads need no form-edit ETag.
  Valid current wire bodies keep their original UUID/body, account scope, frozen form,
  package and zone. Exact receipts replay; changed content conflicts; current authority
  is still rechecked. Do not regenerate bodies or reassign them to canonical successors.
- Fields-only decimal/boolean/blank historical meanings remain intact. The current
  upload wire still excludes boolean/null/object answers and unmanaged/unbound records,
  as it did before cleanup. Current mobile installation remains canonical-only; this
  is not a new legacy-package installation bridge or proof about arbitrary old devices.

## Rollback limits and checks

- Keep the authorization policy correction; do not roll it back to regain old API behavior.
- Do not remove revision or resurrect unconditional publication while writers may use
  the reviewed contract. A rollback API must understand the current schema and retain
  authorization, CAS, compatible readers and current exports; otherwise pause form writes.
- Do not roll back to HEAD 577959a alone when fields-only references remain. That
  recreates the demonstrated upload/export failures. Preserve the tested restoration.
- Schema rollback does not undo published versions, advanced site pointers, accepted
  receipts, Auth deletion or committed forgetting. Never rewind history, reassign queued
  bodies or recreate anonymized profiles/memberships as an operational rollback.
- After any approved rollback, repeat the role matrix, stale/missing preconditions,
  original receipt/body replay, historical/fields-only exports and current converter
  against that exact artifact/schema pairing. Compare definitions, package/archive
  hashes and receipt identities; use a separate restore drill for disaster recovery.

## Boundaries and exact remaining actions

Runs used Node **24.19.0**, pnpm **10.17.1**, repository uv/Python 3.13 tooling and the
cached smaller **decamark-cleanup-tests:local** PostgreSQL 17/PostGIS + pg_cron image
(sha256:b15dd833ba0be702cff4980114773bc0bb75f44d55addf1419e8ce8bede8b7bb).
Docker endpoint selectors and hosted database/provider variables were cleared; local
loopback test overrides were explicit, delivery disabled and only task-owned temporary
containers were removed. No real Auth/email call or credential-file read was used.

This is not pinned-image/full-Supabase Auth/Storage, hosted permissions/migration-ledger,
real-user-role, interactive QGIS Desktop, physical iPad/Android, signed release-build or
live-reader verification. Those checks require separately approved targets/accounts/devices.

Remaining actions are concrete: review/package the complete worktree; implement and
verify the narrow tombstone-based deletion recovery or approve a safe operating
restriction; authorize target history/schema and stored-definition inventories; resolve
any frozen invalid canonical hits; inventory all form writers and device queues; then
carry out the ordered, separately authorized target and device acceptance above. The
fields-only reader stays until its documented inventory/queue/retention gates are met.
