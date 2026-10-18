# Fields-only compatibility resolution — October 17, 2026

**Conclusion: compatibility retained until a defined transition can occur.** The
cleanup removed the existing stored-form/upload/export compatibility before a safe
existing-installation transition was ready. Converting fresh initialization was
insufficient. This change restores the six pre-cleanup consumer implementations from
49caa05, with regression tests; it does not convert or delete stored data. All six
ASTs match; five files match byte-for-byte and schemas.py keeps the cleanup's blank-line formatting.

Starting HEAD: **577959a2a99c9d8390203eded76e2149ac780162**, initially clean. The
supplied QGIS repair, canonical form-validation fix, authorization/RLS, revision/CAS
preconditions, archive/query cleanup and production-model contract tests are preserved.
See [source preservation](source-preservation.json). No commit, push, deployment,
hosted database access, private configuration read or existing-database reset is part
of this task. The current explicit instruction to preserve unknown existing data
takes precedence over the earlier general pre-launch experimental-data reset policy.

## What actually remains in repository-controlled inputs

| Source | Fields-only definitions | Meaning and scope |
| --- | --- | --- |
| supabase/migrations/20261012120000_current_baseline.sql | None at current HEAD | The fresh shell-v1 INSERT now has canonical questions people and notes. The former literal had those two fields, integer 0–999 required, text maxLength 1000 optional, status practice-only. Its fixed form-version UUID is 10000000-0000-4000-8000-000000000004 in project 10000000-0000-4000-8000-000000000002. |
| Other three tracked migrations and supabase/seed.sql | None | The seed inserts local synthetic identities/memberships. There is no forward migration converting existing definitions. Reapplying or editing a recorded baseline is not an existing-installation transition. |
| contracts/forms/*.json and authored shared cases | No valid fields-only instruments | Current authored shell/Janet/Inventory instruments are canonical. Negative structural cases and API error envelopes are not fields-only instruments. Collector shell also has an observer question; the former server shell did not. |
| database/tests/zone-publication-fixtures.sql | Two {"fields":[]} placeholders | db16-inventory-v1, UUID 80000000-0000-4000-8000-000000000004; db16-play-v1, UUID 80000000-0000-4000-8000-000000000010. These SQL-only synthetic forms support package/binding/security scenarios. |
| database/tests/zone-observation-binding.sql | One {"fields":[]} placeholder | db16-successor-v1, UUID 80000000-0000-4000-8000-000000000009, for explicit successor and historical retired-form binding checks. |
| database/tests/run.sql | One {"fields":[]} placeholder | other-v1, UUID 20000000-0000-4000-8000-000000000004, in the separate synthetic tenant. |
| web/tests/unit/answers.test.mjs | One historical reader fixture | people, notes, weather_kind (choice), loose_parts (multi-choice), supervised (boolean), with authored answer-label/ordering checks. Its obsolete baseline filename comment is historical provenance, not a current seed. |
| web/tests/unit/data-view.test.mjs | One historical reader fixture | notes (text) and people (integer), used in real summary/record preparation tests. forms-model.test.mjs also models legacy summary metadata without another definition. |
| Invalid-definition tests and dated reports/patches | Examples, not initialization | constraints.sql attempts an immutable UPDATE with malformed fields; test_form_contracts.py rejects fields-only authoring. Dated evidence is unchanged. |
| New fields_only_fixtures.py / fields-only-outbox.test.ts | Deliberate historical shell fixture | Recreates an existing installation by INSERTing a separate historic-v1, not changing the fresh or any immutable existing form. |

The four SQL placeholders remain. Their SQL assertions do not demonstrate Python
form parsing or collector installation; this task adds actual API/export/outbox
coverage rather than inventing questions for empty instruments. The earlier cleanup
report's fixture inventory was incomplete. No other active fields-only seed/fixture
was found in the inspected tracked source. Historical evidence is not a live seed.
The two web fixtures also remain because the production web historical reader is
still supported; they are not duplicate validators or server initialization.
The [seven tracked ZIP/QGZ archives](tracked-archives.json) were also inspected:
four contain forms.json snapshots, all canonical; the other three do not contain
application form snapshots. These archives provide no inventory of an existing target.

## Exact affected formats and consumers

The old backend reader accepts an object with fields, an array of objects with code and type.
Supported types are text, integer, number, boolean, choice and multi-choice. Optional
keys are required, minimum, maximum, maxLength and options (string array). Other stored
properties are ignored, as before. A questions key always chooses the canonical parser;
an invalid canonical object cannot fall back to fields. Unknown formats are not
silently converted or treated as disposable.

There is no universal semantics-preserving canonical conversion: historical number
permits fractions, canonical number permits integers; historical required text accepts
an empty string, canonical required text does not; optional blank text is retained by
the old reader and pruned by the canonical engine; boolean is not a canonical question
kind; historical unenumerated choice and repeated multi-choice answers also differ.
Even the shell's preserved IDs/bounds do not make all normalization semantics identical.
The old validator is restored without widening its accepted values or rewriting answers.

| Consumer | Cleanup 577959a with an existing fields-only instrument | With this resolution |
| --- | --- | --- |
| Form summaries/details | Raw JSON still readable, question_count 0 and possibly null title. | Same raw definition, no synthetic questions or altered metadata. |
| Historical observation detail/list/spatial SQL | Raw answers and recorded form/package/zone references remain readable; no typed form parse at this boundary. | Same; detail readback is exercised. This is not a claim about every client UI. |
| Web historical answer/form reading | readDefinition already handles fields, including booleans and multi-choice; LegacyVersionScreen shows the stored instrument read-only. | Unchanged production web reader. Existing answer, data-view and forms-model tests are retained and run. |
| First or delayed bound upload | BoundTarget.definition and UploadTarget.definition require canonical metadata/questions; a valid current wire body bound to fields-only data fails parsing with HTTP 500 before answer validation. | Original stored-format union and validator accept it using its frozen form ID/code and package/zone, including retired forms and superseded packages. Bounds and unknown fields remain enforced. |
| Exact retry with an existing receipt | Still succeeds after authorization because receipt lookup precedes target parsing. A changed UUID/body is not this case. | Same receipt/fingerprint behavior; no retry hash/version change. |
| CSV/GeoJSON export | Any selected row referencing fields-only data makes the export worker fail, returned as HTTP 422 export_scope_too_large, even for a tiny scope. A mixed scope can therefore fail for canonical rows too. | Original field-code columns, type/option codebook and raw forms.json snapshots are restored. |
| Package metadata/archive and zone reads | Archives remain retrievable. A format-1 archive contains manifest.json plus ground/zones/paths/trees; manifest forms store UUID/code bindings, not embedded form definitions. Replacing the server form does not change those references. | Same original archive bytes and SHA-256, bindings and historical polygon data. No rezipping or package reassignment. |
| Current mobile package installation/rendering | Already canonical-only before cleanup: historicalForm/storedForms call parseFormDefinition. A fields-only instrument cannot newly install through this client. | Unchanged. No claim that restoring the API repairs an older client UI or makes fields-only packages newly installable. |
| Retained mobile outbox | The current serializer/outbox accepts an already bound instrument record independently of today's form registry. A retained valid body can reach the API; first acceptance fails as above. | Actual SQLite restart, immutable body, signed HTTP upload and lost-receipt retry are exercised without changing the installer. |
| New form authoring / publication | Canonical-only. An implicit copy of fields-only data fails validation. | Still canonical-only. An explicit canonical definition can create/publish a successor with revision preconditions. The old practice-wide restriction stays removed. |

Current upload wire values are finite numbers, strings and string lists. Boolean,
null, object answers, unsupported envelope formats and unmanaged/unbound records are
not made uploadable by this restoration; those wire restrictions predate cleanup.
Historical JSON remains exportable without recoding its meaning. The six-type domain
tests protect the historical validator, not a claim that every legacy answer fits
the current wire protocol.

## Demonstrated versus unknown

Source proves that an installation which applied the former baseline can retain
the original fields-only shell row: the fresh INSERT changed but no UPDATE/migration
changed that row. It also proves exactly where historical definitions are parsed,
where immutable bindings are retained and where current clients refuse old forms.
Disposable tests demonstrate the failures and the preservation path below.

No existing/hosted database or real device queue was inspected. Hosted form counts,
observations, package references, external imports, past clients and outstanding
offline work are unknown. Earlier hosted reports do not substitute for a current
inventory. Zero affected rows on a freshly initialized disposable database would
not establish that an already initialized target is unaffected.

## Implemented preservation path and ordering

1. Keep the existing stored-format reader/validator and export dispatch. This is the
   original legacy_forms.py, forms.py, observation_export_columns.py, BoundTarget,
   UploadTarget and validated_answers typing from 49caa05. It is not a new conversion
   framework. Canonical validation and its 9928f53 fixes remain the same.
2. Do not run a baseline again, update published definitions, repoint old observations,
   alter package manifests/archives, reassign zone identities, regenerate fingerprints
   or rewrite a queued UUID/body. No data migration is necessary for this application
   repair; no migration is supplied that pretends to resolve the retention decision.
3. For future collection, explicitly author and publish a canonical successor with
   reviewed question IDs, types, bounds, requiredness and export mappings. Publish a
   new package with the explicit successor and the normal current-package/revision
   preconditions. The test does this for historic-v2, with the same people/notes IDs.
4. Retire the old form only after it is no longer current-bound. Retain its original
   definition, historical packages, archive hashes, zones and observation/receipt rows.
   Authorized delayed uploads keep their original references. A new successor is an
   additive future-collection transition, not a conversion of historical records.

## Specific decision and exact removal gates

The unresolved decision is: **must each affected form/observation/package and any
offline body remain readable/exportable/retryable for its retention period, or may
that identified material be retired from the supported application after a separately
approved preservation/disposition process?** This task assumes preservation until the
owner explicitly decides; it does not seek or infer permission to destroy data.

Before removing compatibility on any selected target:

1. Obtain explicit authorization for that target's read-only assessment. Run
   [database/fields-only-inventory.sql](../../../database/fields-only-inventory.sql).
   It includes exact definitions, states, observation counts, play/Inventory package
   UUIDs/current status/archive hashes and draft references, including base Inventory.
   Review mixed questions-and-fields and unrecognized objects as separate cases; the
   SQL classification is an inventory, not a replacement for the actual parser.
2. Inventory every device/account which could retain an affected package or queued
   observation, including pending/needs-attention and accepted-but-unacknowledged work.
   Server counts cannot prove that queues are empty. Reconnect or recover and verify
   receipts using the original UUID/body; never replace the body to match a successor.
   Devices that cannot be accounted for keep removal blocked.
3. Record the retention owner, affected UUIDs and decision. If historical access or
   delayed work must remain supported, keep this reader. If an external preservation
   route is approved, independently validate complete raw definitions/answers,
   attribution, receipts, archives/hashes and restore/read/export ability before
   authorizing any change to supported retention. CSV alone is not a full backup.
4. If no retained references/work remain under that explicit decision, retire old
   published instruments to prevent new bindings, verify the inventory and queues
   again, then assess reader removal as a separate change. A canonical successor or
   a zero count from fresh initialization does not satisfy these gates.

No target assessment, device census, retention approval or disposition is claimed
complete here. Account-deletion recovery and consolidated rollout verification stay
outside this task.

## Rollback limitations

This repair changes application parsing only; there is no schema/data down migration.
Reverting it to 577959a recreates the demonstrated upload/export failures whenever
fields-only references still exist. A software rollback must retain a compatible
reader and the current authorization/revision schema contract; reverting unrelated
security or revision migrations is not a valid workaround.

The additive successor does not delete or mutate v1. Its publication advances the
current package pointer and its retirement state is not undone by reverting API code.
Published definitions and packages cannot be edited back to v1, and queued bodies
must not be reassigned. Any later change in the active instrument needs another
explicit supported publication; do not directly rewind pointers or unretire frozen
history. No automated rollback or deletion of research records is implemented.

## Local verification

The failures at 577959a and final checks are recorded in the adjacent evidence files.
Before/after use separately created synthetic tenants in fresh task-owned temporary
PostgreSQL 17/PostGIS + pg_cron containers; they never use the configured hosted URL.
Node 24.19.0, pnpm 10.17.1 and repository uv/Python 3.13 tooling are used. This is the
smaller disposable acceptance image, not the pinned full Supabase image, a real Auth
provider, physical collector or hosted-compatibility run.

The regression seeds a distinct published fields-only form and a historical bound
observation with an independently authored JCS retry digest. It checks original
question IDs, bounds and optional blank text, raw definition/record readback, actual
CSV/GeoJSON subprocess exports, codebook labels/types, exact archive contents/bytes
and package/form/zone attribution. It then publishes a canonical successor, retires
v1 and drains a retained SQLite outbox after restart through the production HTTP
transport, including an accepted-but-lost response. A frozen snapshot of the original
definition, observation, receipt hash, package bytes/metadata and polygons is identical
afterward. The read-only inventory runs in a READ ONLY transaction against this fixture.

See [verification results](verification-results.md) for final command outcomes. Failed pre-fix checks are
evidence of the regression, not counted as successful verification.
