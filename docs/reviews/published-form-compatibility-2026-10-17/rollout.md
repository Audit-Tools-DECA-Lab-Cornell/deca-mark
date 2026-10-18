# Published-form compatibility resolution — October 17, 2026

## Verdict

**Historical read/export protection is implemented and locally verified. Compatibility
is retained; no historical transition or definition rewrite is required for this
bounds defect.** New authoring and publication remain strict. Unsatisfiable first
uploads deliberately stop with a recoverable, actionable rejection; their ultimate
research disposition needs a protocol/retention decision.

This addendum resolves the published-form parser gate in the
[earlier consolidated assessment](../consolidated-audit-2026-10-17/rollout.md).
It does **not** make the full release ready. Account-deletion recovery remains an
unresolved release blocker for reliable enabled deletion. No deletion recovery was
implemented, no hosted data was inspected, and no target/device clearance is claimed.

## Artifact and scope

Starting/final HEAD is **577959a2a99c9d8390203eded76e2149ac780162**, branch work.
The initial dirty worktree, including the fields-only restoration and prior assessment,
was inventoried before editing ([status](initial-status.txt), [hashes](initial-files.json)).
HEAD alone remains incomplete. Package/review the entire resulting worktree; do not
substitute that commit for the tested artifact. There was no commit, push, deployment,
branch switch, secret-file inspection, provider call, real-record migration or existing
DB reset. Dated reports and their original failure evidence remain intact.

The change is limited to six production files: split canonical interpretation from
current eligibility in forms/form_references, use that interpretation for export column
planning, report impossible first uploads deliberately through observation_answers,
clarify the lifecycle service documentation, and recognize one specific safe rejection
issue in the collector. Existing shared fields-only dispatch/reader remains intact.
There is no new versioning framework, global error code, migration or data conversion.
Compared with the starting worktree, those six production files add 79/remove 20
lines ([exact patch](production-change.patch)). Two new acceptance modules add 604
test lines; the forward test changes only the three outcomes and their explanatory
comment. This size is evidence of scope, not a success criterion. Of 1,638 pre-existing
files, **1,629 stay byte-identical**, none disappear; the nine intentional changes are
listed in [preservation.json](preservation.json). This includes unchanged prior reports,
legacy_forms.py, contracts/clients, migrations and all prior tests except the explicit
forward expected-result update.

## Before and after, from the combined source

The pre-fix published subtype is a canonical `questions` definition whose numeric
question has finite structurally valid integer `min` and `max` with `min > max`.
It may be published or retired and referenced as play or Inventory by immutable packages.
This is distinct from the fields-only `fields[].minimum/maximum` format, whose original
reader and decimal/boolean/blank semantics remain unchanged.

The actual before run uses the earlier forward test and the real pre-audit baseline
from Git commit 2b5bf9aaa7067c98c44520de3c9b3f573a166731. Its synthetic optional inverted
question has an existing meaningful observation omitting that question and a real
package. The audit migrations preserve it, but the strict stored parser caused raw
detail 200, typed/mixed export 422 and first upload 500. The before test explicitly
expects those failures: [1 passed in 7.38s](evidence/before-forward.txt) is reproduction,
not acceptable behavior. The previous report also contains execution of the archived
pre-fix validator accepting those same bounds; that evidence was not regenerated here.

The after forward test retains every migration/data/ACL/revision/receipt assertion and
changes those three expected outcomes to 200. It passes on another fresh disposable
pre-fix database: [1 passed in 9.45s](evidence/after-forward.txt). Raw definitions,
observations/upload hashes, complete package archive bytes, zones, memberships,
permissions and existing receipts remain preserved. No pending migration was edited.

`StoredCanonicalDefinition` applies the same typed models and structural reference/
export/dependency checks as before, except the new cross-bound authoring eligibility.
`FormDefinition` additionally rejects contradictory bounds and remains the parser used
for create, draft copy/edit and reviewed publication. Stored export never calls answer
normalization or asks the old instrument to qualify for new publication. This is an
explicit interpretation path, with no fallback-on-error or partial-export behavior.

The [new acceptance source](../../../backend/tests/test_published_form_compatibility.py) and
[collector queue source](../../../mobile/src/sync/published-form-outbox.test.ts) are retained
with the report. The new structural tests continue rejecting duplicate IDs, cycles/unknown dependencies,
export collisions, invalid kinds, booleans/nulls as bounds and unsafe integer bounds.
Fields-only definitions still dispatch only when questions is absent; malformed canonical
input cannot fall back to fields-only. Archive/process, RLS, authority, boundary,
resource and fingerprint protections are unchanged.

## Upload decisions and preservation

| Captured scenario | Result and reason |
| --- | --- |
| Same committed UUID/body/account/binding with existing receipt | Original receipt replays before target parsing or current eligibility checks. Changed body remains 409. The new regression independently authors the original JCS hash; existing golden fingerprint cases remain. |
| Optional inverted question omitted; all other visible answers valid | First upload succeeds against its original form/package, including after retirement/supersession. No otherwise invalid answer is accepted. |
| Required inverted question hidden by original dependency; other answers valid | First upload succeeds; existing visibility/pruning semantics apply unchanged. An inactive branch is not an always-visible required question. |
| Visible required inverted question, absent answer | 422 validation_failed with published_form_bounds issue. No value can satisfy both limits. No observation/receipt is created. |
| Attempted answer to a visible inverted question, even optional | Same deliberate 422. Bounds are neither swapped nor ignored; integers, decimals, strings, booleans and blanks are not used to bypass them. |
| Already stored answer inconsistent with the instrument | Detail and exports preserve it and the exact original definition; historical export does not revalidate or reinterpret answers. The test deliberately injects such a row, and does not claim it could pass an old legitimate first upload. |

Existing normalization remains: new canonical uploads prune blank text and hidden
answers; historical stored blanks read/export as stored. Fields-only blanks, decimal
values, booleans, choice behavior and original retry fingerprints are untouched.

The server names the published form/question fault and asks the caller to retain the
record and contact the coordinator. The new collector copy uses the safe
published_form_bounds issue code rather than echoing server text. Existing collectors
already understand validation_failed as rejected; they retain the body and show their
existing generic validation copy if they do not recognize the added issue.

The actual production transport/SQLite acceptance sends an unsatisfiable queued body
to the signed loopback API. The existing deferObservation path puts it in needs-attention,
retains exact payload/UUID/form/package/zone/account binding and structured issue, and
creates no receipt. SQLite restart retains that state. Explicit retryAttention restores
the **same** pending body; another real send remains rejected, without silent deletion,
rebinding or a false acknowledgement. This proves same-schema persistence/retry, not
recovery after storage erasure, account forgetting or a physical-device upgrade.

A reviewed canonical successor helps future collection once a new package is selected.
It does not repair original forms, old package manifests, historical answers or impossible
queued bodies. No correction/rebinding protocol is added here. Owners must decide the
research disposition, custody and retention of those bodies; do not invent an answer,
rewrite their definition, or reset a device to clear the queue.

## Newly executed verification

The focused module passes **12 cases in 14.23s** on a fresh current-schema database
([log](evidence/focused-api.txt)). It executes detail/list, CSV/GeoJSON, original forms.json
and codebook meaning, retired-form/superseded-package delayed upload and exact receipt
replay, required/conditional failures, read-only inventory and actual collector retention.
The original historical row/package/form/zone snapshots stay identical. Actual signed
export ZIPs pass the production QGIS prepare.py command with CSV identity agreement:
**2 point events, 1 original package snapshot**. [Historical artifacts](historical/).

The relevant combined run passed **215 tests, 11 warnings in 215.05s** on a fresh
current-schema database, once after focused corrections ([combined evidence](evidence/combined.txt)).
It includes the complete canonical
author/review/publish/package/upload/lost-ack/review/export/QGIS workflow, observer and
viewer/manager authorization, stale/missing revision preconditions, strict new numeric
validation, nested answer IDs, fields-only delayed SQLite/HTTP uploads/receipt replay,
archive corruption/deadline/process isolation, independent upload/fingerprint goldens,
OpenAPI checks, the retained Inventory GIS scenario and the separate deletion assessment.
It is an actual combined-source run, not an aggregation of prior agent claims.
After it passed, only the new test was strengthened to assert exact list answer/binding
values and detail definition explicitly; the single affected historical workflow was
rerun separately: **1 passed, 11 deselected in 6.07s**
([evidence](evidence/readback-assertions.txt)), with no further
production change or repetition of the combined suite.

Additional newly executed checks:

- **73 database-free cases passed**, 3 integration cases deselected, in 0.32s with database
  selectors removed and a verification audit hook denying private config, TCP and Docker.
  Includes authored shared form cases, stored structural safety and fields-only semantics.
- **91 focused collector cases passed**, six files, no skips, 3.48s: definitions/shared
  cases, upload transport, both outboxes and API client. Real HTTP rejection is additionally
  invoked from the Python acceptance, not claimed from the ordinary fallback unit case.
- **18 existing web historical/profile reader assertions passed**, explicitly enumerated
  with Node test isolation disabled ([log](evidence/web-readers.txt)); no web source changed.
- Backend BasedPyright: **0 errors/warnings/notes**; mobile TypeScript: exit 0.
- Scoped Ruff and formatting pass. Scoped Biome passes with informational index-access
  suggestions that conflict with TypeScript's required index-signature access.
- OpenAPI regenerated into scratch and byte-identical to contracts/openapi.json.
  Existing generated clients need no schema regeneration for a safe details issue.
- Form-engine source parity and plan checks pass; git diff --check passes.

See [commands and development corrections](commands.md). Earlier full suites are
historical evidence, not counted as new checks. Backend/mobile full suites, full SQL
numeric/concurrency suite, full Supabase Auth/Storage and physical/native UI acceptance
were not repeated for this narrow reader/error change.

The cached alternative image is PostgreSQL 17/PostGIS 3.5 plus pg_cron with synthetic
Auth tables, **not** pinned full Supabase or hosted compatibility. Fresh initialization
and authentic forward SQL are exercised locally. Installed QGIS GUI/provider/layout,
hosted rollout orchestration and real-device state remain unverified here.

## Rollout ordering, mixed versions and rollback

This protection needs **no SQL migration** and must accompany any release of the strict
canonical authoring fix to an existing installation. It may be applied without waiting
for hosted inventory because it preserves original reads rather than mutating data.
A full release still waits for the separate account-deletion completion decision/remedy.

For the complete audit artifact, retain the earlier ordering:

1. Confirm the authorized target's actual current-baseline and outbox migrations/ledger;
   never reapply the initializer or reset an existing installation. Protect current
   drafts, packages, records and receipts through the established backup procedure.
2. Pause form mutations; apply only pending 20261017000657_observation_creator_visibility.sql
   then 20261017050453_form_draft_revisions.sql, after the existing baseline/outbox.
   If already applied, do not run again or modify ledger history.
3. Release the combined API with authorization, revision preconditions, strict authoring,
   stored canonical protection and the fields-only reader together. Drain older instances
   deliberately. Older pre-revision API publication calls are incompatible with the
   migrated SQL function. A strict-authoring API missing this reader can still fail old
   exports/uploads if it remains in a mixed pool.
4. Release precondition-aware management clients and reload old editor tabs. Save,
   discard and reviewed publish require the returned strong If-Match ETag; missing
   preconditions yield 428, stale ones 412. Generated declaration optionality does not
   exempt a custom client from this runtime requirement.
5. Release the collector's specific fault copy; older current-wire collectors still
   retain 422 rejections using generic copy. Receipt schema, fingerprints and bound upload
   payloads do not change. Do not force reinstall/reset to adopt this client. The current
   package installer/retained catalog preparation still uses the strict canonical parser;
   this change does not enable fresh installation or resuming collection on an invalid
   instrument. Already captured bound outbox uploads do not require that installation
   path and are the supported delayed scenario demonstrated here. Web historical
   readDefinition/answerRows already interpret stored questions without the authoring
   bound validator; no web reader change is needed.
6. Under separately authorized verification, sample preserved historical detail/list/
   both exports and QGIS preparation, exact retry and permitted delayed upload, observer
   denial/viewer-manager access, stale edit/publication refusal and target invariants.
   Then execute the [read-only inventory and device/owner assessment](inventory.md),
   stop affected future collection and arrange explicit successors where needed.

There is no data migration to roll back for this fix. Rolling back only the new reader
to the strict shared-parser artifact reintroduces 422 export/500 upload failures for
retained inverted canonical definitions. Rolling back to a parser predating the authoring
correction reopens publication of new contradictory forms. Rolling back to HEAD 577959a
also loses fields-only compatibility. Do not use any of those as an unassessed rollback.
Keep the reviewed compatible reader in the rollback artifact. The revision SQL cannot
be paired with the old two-argument publication API, and an unconditional-publication
rollback would remove the stale-review guarantee. Prefer a compatible forward fix.

Exact target schema/runtime inventory, installed client versions, offline devices,
queue custody and unsatisfiable-record retention/protocol remain to be confirmed by
owners. Unknown hosted rows are not assumed disposable. Both compatibility readers
stay until a defined, approved transition accounts for all retained references/queues.
Account-deletion recovery remains separately open: a durable forgetting tombstone plus
202/logs/client retries still does not guarantee Auth deletion after crash/exhaustion.
