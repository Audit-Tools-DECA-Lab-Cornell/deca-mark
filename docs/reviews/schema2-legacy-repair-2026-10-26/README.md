# Schema2 legacy-preservation repair: verification

Date: October 26, 2026. This records local/disposable execution and authorized
read-only hosted validation. No hosted migration, deployment, commit or push ran.

This is the preparation-stage record. The subsequent approved hosted application
and its preservation checks are recorded in the
[hosted application evidence](../schema2-hosted-application-2026-10-26/README.md).

## Result

The repaired preflight accepted the current eight hosted definitions: seven
canonical and one legacy fields-only form. It generated an unapplied review
bundle using supabase/repairs/20261024090000_form_schema2_preserve_legacy.sql.
The raw temporary snapshot was removed after validation. Private review artifacts
contain only SQL, definition hashes, IDs, parser classifications and summary
metadata; hosted form contents were not added to Git.

The compatibility source SHA256 used for that review bundle was:

68836df5bc319a45ac2ae1740d39d7f9c0f8d71503e89b09e3a7aa3ddce1c2c1

An application must still use the approved release and a fresh maintenance-window
snapshot. A review bundle is not production authorization or acceptance evidence.

## Executed checks

1. Focused schema2, migration and historical-parser suites: 70 passed. This includes
   both the unchanged original migration's canonical/empty behavior and the
   preservation transaction on isolated PostgreSQL 17/PostGIS containers.
2. Disposable signed API acceptance: 63 passed across fields-only history, form
   contracts and schema2 forms. This exercises actual HTTP readback, fresh/delayed
   bound uploads, immutable receipt retry, canonical successor/retirement,
   SQLite restart/outbox delivery and CSV/GeoJSON exports.
3. After fixture/lint refinements, 60 focused checks passed again, including all
   six preservation transaction scenarios. These are repeat checks, not an
   additional set of distinct acceptance cases.
4. Full backend Ruff and BasedPyright passed. Shell syntax and Git whitespace
   checks passed. The original supabase/migrations/20261024090000_form_schema2.sql
   has no diff.

The main preservation rehearsal seeds a real bound legacy observation and package
before schema2. After invoking the operator CLI and executing its generated SQL,
all form values except schema_version, complete observations/receipt hashes,
package manifests/archive bytes and zone snapshots are identical. The history
statement equals the execution source actually used. Repeat application and a
published-definition edit are refused without changes.

Separate rollback scenarios cover a missing report, changed definition hash,
incomplete population, incorrect parser classification and conflicting history.
Canonical JSON with a questions key cannot fall back to fields-only parsing.
Legacy numbers, blank text, booleans and duplicate multi-choice answers retain
their existing interpretation, while legacy authoring remains rejected.

The original source still rejects legacy input; the existing rejection test
continues to exercise that source directly. The alternate source is an explicit
preservation path, rather than weakening the original SQL gate. Invalid legacy
definitions continue to fail preflight.

## Remaining release boundaries

Staging rehearsal, approved committed release, target/backup/maintenance
confirmation, hosted application, matching runtime rollout and hosted/browser/
physical-device acceptance remain separate. No new legacy collector installation
or web editor behavior is claimed.

See the [decision](../../decisions/0002-schema2-legacy-preservation.md) and
[production procedure](../../../database/hosted/form-schema2-rollout.md).
