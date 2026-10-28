# Schema2 transition: retain historical fields-only instruments

Date: October 26, 2026. Scope: local preparation and verification; no hosted
migration, deployment, Git commit or push is authorized by this decision.

## Evidence and decision

The authorized October 25 read-only hosted preflight found eight schema1 forms:
seven canonical definitions passed and the published shell-v1 definition used
the historical fields format. No observations, packages or zone-draft Inventory
bindings referenced it in the server check. Device caches and queues remain
unverified; zero server references do not establish that deletion is safe.

Retain the exact definition and historical reader. Do not convert fields into
canonical questions. Their semantics differ: legacy numbers can be fractional,
required legacy text can be empty, optional blank text remains stored, booleans
are supported, and multi-choice duplicates may remain meaningful. The existing
stored-format dispatcher already interprets fields-only JSON at schema version 2.
Current authoring stays canonical-only.

## Implementation and audit

The preflight validates every row with its real parser and binds its exact
definition-text SHA256. A questions key always chooses canonical validation;
invalid canonical JSON cannot fall back to legacy fields. Formerly ignored new
semantic properties, invalid field types and unknown schema versions still stop
preparation. No partial population can be applied.

Canonical-only populations retain the original format1 report and original
migration source. Legacy populations receive a format2 report with an explicit
canonical or legacy_fields classification per row and select the reviewed source
in supabase/repairs/. The original migration file stays unchanged because it
has already run on the local database.

The preservation source is an alternate implementation of the same pending
20261024090000 schema2 transition. It is not a later migration or a history repair.
The wrapper executes it and records its actual SQL under that version/name in
the same transaction. Reviewers must audit the selected source and its SHA256,
rather than infer source identity from a migration version alone.

Under the existing exclusive table lock, SQL checks report version, every ID,
definition hash, parser classification, row schema versions, schema default and
the enabled immutability trigger. It changes schema_version to 2 and the default
to 2, restores the named trigger and records history atomically. It changes no
definition JSON, IDs, revisions, answers, receipts, packages, archives, zones,
grants, RLS policies or bindings. A changed population or conflicting history
rolls the transaction back.

## Supported boundaries and rollout

Historical upload validation, exact immutable receipt retries, raw API readback
and CSV/GeoJSON exports retain their existing fields-only dispatch. The migration
does not add fields-only authoring or canonical collector installation. It does
not promise a new legacy web editor. Those consumers remain bounded by their
existing format support. New collection requires an explicitly authored,
published canonical successor and a new package; old work keeps its original
references and payload bytes.

Follow the [production procedure](../../database/hosted/form-schema2-rollout.md)
for an approved matching release, staging rehearsal, target identity, backup,
maintenance, fresh full-visibility snapshot, review and acceptance. Existing
schema2 installations need no reapplication. After a committed transition,
retain compatible runtimes and fix forward; never relabel rows as schema1,
delete history or restore an old parser over new definitions.

## Legacy support adjudication verdict

**Verdict:** RETAIN

**Confidence:** High for preserving the existing reader; device inventory remains unknown.

**Risk:** P1, stored definitions and mobile replay contracts.

**Legacy contract:** Immutable fields-only forms and their original answer/export semantics.

**Consumer reality:** Historical API/upload/export paths still use the reader; one hosted row exists.

**Producer reality:** Current authoring rejects fields-only input, while restored data and retained queues can carry it.

**Evidence:** Cross-component source, authorized hosted preflight/reference metadata, historical fixtures and disposable PostgreSQL rehearsal.

**Required before hosted application:** Approved release and target, staging/backup/maintenance gates, fresh preflight and post-apply acceptance.

**Recommended path:** Retain legacy interpretation and publish canonical successors for future collection; reader removal remains a separate retention decision.
