# Remaining device inventory — read-only procedure

This is an execution-ready procedure, **not a completed census**. No device access,
copy or owner-certified manifest was available in the October 18 assessment. The
server inventory is in [the release assessment](README.md). Both compatibility
readers remain. This procedure authorizes no sign-in, upload, reset, upgrade or disposal.

1. The fieldwork coordinator must enumerate active, offline, retired, borrowed and
   unavailable collectors. For each device record a custody identifier, custodian,
   platform/OS, installed build/commit, API/issuer target, last contact, local schema
   version and account/project scopes. Record unavailable devices explicitly.
2. With the custodian's approved export/backup procedure, obtain a **consistent copy**
   of SQLite and referenced immutable package files. Account for SQLite WAL; copying
   only the main database while it is active is not a reliable snapshot. Use platform
   backup/SQLite backup handling and verify the copy. Keep original bytes, ownership
   and package digests in restricted custody, never in a public PR.
3. Open the copy with SQLite **read-only mode**. First inspect `PRAGMA user_version`
   and `sqlite_master`. Do not launch the collector's initializer to inspect unknown
   storage: current `database-migrations.ts` resets schemas other than version 6.
   The queries below apply only after verifying the current version-6 structure.
   Older or unrecognized schemas require a separate read-only interpretation.

```sql
PRAGMA query_only = ON;
BEGIN;
PRAGMA user_version;
SELECT name, type FROM sqlite_master
WHERE type IN ('table','view') AND name NOT GLOB 'sqlite_*' ORDER BY name;

SELECT owner_scope, sync_state, count(*) AS records
FROM observations GROUP BY owner_scope, sync_state ORDER BY owner_scope, sync_state;

-- Includes synced records: a lost/incorrectly persisted acknowledgement also matters.
-- These identifiers/receipt and error strings belong in restricted evidence.
SELECT id, owner_scope, sync_state, sync_error, attempts, next_attempt_at,
       package_key, server_receipt,
       json_valid(payload) AS valid_json,
       CASE WHEN json_valid(payload) THEN json_extract(payload,'$.binding.packageId') END AS package_id,
       CASE WHEN json_valid(payload) THEN json_extract(payload,'$.binding.packageSha256') END AS package_sha256,
       CASE WHEN json_valid(payload) THEN json_extract(payload,'$.binding.zoneId') END AS zone_id
FROM observations ORDER BY owner_scope, id;

SELECT content_key, issuer, project_id, site_id, package_id, digest
FROM package_contents ORDER BY issuer, project_id, package_id;
SELECT owner_scope, content_key FROM package_authorizations ORDER BY owner_scope, content_key;
SELECT owner_scope, project_id, site_id, content_key FROM package_selections
ORDER BY owner_scope, project_id, site_id;
SELECT owner_scope, id, package_key FROM observation_drafts ORDER BY owner_scope;
SELECT owner_scope, id, package_key FROM parked_observation_drafts ORDER BY owner_scope,id;
SELECT owner_scope, package_key FROM active_sessions ORDER BY owner_scope;
ROLLBACK;
```

4. In restricted evidence retain **exact** `observations.payload`, its serialized
   `uploadBody` where present, original form definitions, installed archive/files,
   form/package/zone binding and server receipt. Do not reconstruct a missing body
   with today's serializer or treat a malformed/missing payload as disposable.
   `readUploadPayload` confirms the current captured body is stored inside payload;
   a metadata-only table is not a preservation backup. Record byte hashes using
   approved tooling; SQLite itself has no built-in SHA-256 in the application schema.
5. Cross-reference against the selected server inventory. Exact observation UUID and
   original receipt/hash distinguish a committed upload with a lost acknowledgement
   from a first attempt. A valid hash's spelling alone does not establish equality
   to an original body. Add separately authorized read-only receipt queries for the
   specifically inventoried UUIDs; do not upload to find out whether a record exists.
   Record missing/old server package IDs as unresolved, preserving the device copy.
6. Parse copied instrument definitions with the **stored** production reader. Identify
   fields-only and contradictory bounds while retaining all structural-safety checks.
   For a bounds hit, use original requiredness/dependencies and captured answer context:
   absent optional/hidden questions can be satisfiable; answered contradictory or visible
   required contradictory questions cannot be satisfied. Server aggregate counts cannot
   classify an individual queue. Preserve original decimal/boolean/blank meanings.
7. Produce one restricted row per affected record: device/custodian, build/schema,
   issuer/account/project, observation/body identity, form UUID/code/question,
   package/digest/zone, sync state/error, known receipt, satisfiability basis and owner.
   List unknown/unavailable devices separately. Claim zero only after reconciling the
   complete roster, not from the current server's zero inverted-bound hits.
8. The research owner decides custody, retention period, exclusion/correction protocol
   and any later collection with provenance for each unsatisfiable record. Publish a
   canonical successor only for separately authorized **future collection**; it does
   not repair or rebind an old record. Record decisions before storage upgrades, resets,
   disposal or account removal: `removeAccountData` intentionally deletes matching
   local observations/drafts during explicit account removal. Recovery does not promise
   preservation through that local action. No such action is part of this inventory.

The final register must identify completed counts, exceptions and a named custodian/
protocol decision owner. Until then, unsatisfiable queue UUIDs/counts and affected
device package copies remain **unknown** and compatibility removal remains prohibited.
