# Library seed/read implementation evidence

Source base: master `43a21a1`. All database runs below use disposable local PostgreSQL
17/PostGIS, Docker image `supabase/postgres:17.6.1.171`, digest
`sha256:658d1c9b09ae4f61b8e95087b6859181b4b7d6940d769cf7b605609c8aad43e9`.
No hosted seeding/application is authorized by this work.

## CON-08

Four wire-boundary/case-integrity tests pass. Focused Ruff and BasedPyright pass.
Nine authored cases freeze identity, reference scope, closure, order, duplicate
columns and expansion expectations; algorithm implementation remains later tasks.
Write errors are defined but not emitted by this read-only slice. Form schema stays 2.

## DB-21

The provisional manifest contains **10 seed variables, 97 held rows**, and explicitly
excludes RelRound1 and FirstRound1. It accounts for all 109 workbook variable rows.
Every held row includes its workbook cell and open question. Choice labels and data
columns are checked against the Additional workbook. Stable `option_N` codes are
positional identifiers for its literal listed choices, not inferred research choices.
The selected variables have no display dependencies. No reference templates are seeded.

The migration creates storage, lineage/scope/unique constraints, indexes and SELECT-only
RLS/grants; it contains **no provisional content**. The local/test seed.sql inserts only
manifest variables, preserving existing IDs/revisions on replay. Browser/service roles
have no grants. No write functions, scope-changing operations or DB-23 work are included.

`pnpm db:test ZONE_REHEARSAL=1` passed with the image override above: current SQL,
Auth-hook and hosted-verification assertions **against the disposable database**, Node
coordinate parity, all ten existing race scenarios, and the library assertions.
`test_library_seed.py` validates coverage, literal workbook choices/columns, generated
SQL parity and every selected question with the current canonical form validator.

The benchmark uses the actual bundled read SQL as restricted fieldmaps_api with a
manager identity: 5,700 visible variables, 10,000 synthetic versions, 100 tagged questions
per version. One statement scans the scoped versions once and aggregates source-tag
usage once; it does not query per variable. Tags exist only in direct SQL fixtures;
BE-28 is still required before API-authored tags are supported.

Measured 2026-11-14, five warm EXPLAIN ANALYZE samples (first run excluded):
**p95 database execution 3,293.038 ms; database response 3,220,488 UTF-8 bytes**.
The “p95” of five samples is their maximum, not a production percentile estimate.
The detailed plan was saved in the executor at `/tmp/library-read-explain.json`.
This exceeds the proposed 500 ms DB budget at the deliberately large version stress
volume; no performance pass is claimed. The plan spends about 1.59 s scanning versions
under existing form RLS and about 0.9 s expanding/grouping one million question tags,
including a disk sort. Existing form policies are unchanged. This identifies version
volume as the first scaling concern; caches/counters/extra search indexes were not added.
API serialization and normal seed-size HTTP measurement belong to BE-27.

Environment recovery: public.ecr.aws image download was rate-limited; the identical
pinned image was obtained from Docker Hub. Supabase CLI migration-new could not create
its default directory on the read-only home filesystem; the migration filename follows
the repository's timestamp fallback. Python/npm/pnpm caches live under /tmp.

## BE-27

Six GET routes now serve project/org lists, entities and usage. Existing template and
form routes remain unchanged. There are no mutation routes or manually edited web/mobile
sources. Both generated client declarations compile. Two complete OpenAPI/type generation
runs produced matching hashes; a structural comparison found every pre-existing endpoint
and component schema unchanged.

Final focused disposable run (library API/contract/seed plus existing template tests):
**27 passed**. Coverage includes owner/admin/manager/viewer/observer/member, foreign org
and sibling-project denial even for owners, deleted callers and revoked membership,
empty sites, same codes at different levels, complete settings, unavailable storage,
no write route, no query parameters, distinct forms across published/retired/draft
versions, viewer-hidden drafts, named dependent variables and stable entity ETags after
usage-only changes. Usage tags are direct privileged SQL fixture data, not API saves.
The hot read makes exactly one data statement (four SELECTs including identity, active
caller and context checks), independent of variable count.

Final HTTP measurements, six TestClient requests per fixture with the first excluded:

| Fixture | Warm p95 (max of five) | UTF-8 HTTP response bytes |
| --- | ---: | ---: |
| 10 Universal + four tenant variables, no tagged versions | 17.274 ms | 11,304 |
| 5,700 visible variables; 10,000 versions × 100 fixture tags | 3,889.802 ms | 3,334,293 |

The stress fixture runs ANALYZE after its bulk insert, matching the SQL benchmark.
A preliminary run without refreshed statistics exceeded the API SQL timeout and returned
503; after inspecting the plan, the read no longer performs an unnecessary pre-aggregation
semi-join of every tag to the visible variables. Counts aggregate the scoped readable
versions once and join to visible variables at the end. No hidden source ID/count is
serialized. Stress latency still exceeds the proposed target, and no production SLA is
claimed. These measurements include in-process HTTP validation/serialization, excluding
real network transit; production hardware/concurrency was not tested.

Passed: `pnpm backend:check` (Ruff + BasedPyright), `pnpm contracts:generate` twice,
`pnpm --dir web typecheck`, `pnpm --dir mobile typecheck`, and `pnpm plan:check`.
The disposable commands used `DECAMARK_REHEARSAL_IMAGE=supabase/postgres:17.6.1.171`;
Python/npm/pnpm dependencies were installed from existing lockfiles without lock changes.

The broader regression run caught a pre-library schema-2 fixture loading today's full
seed before the new table exists. Its test setup now selects only the original practice/
identity portion of seed.sql; no runtime compatibility path was added. The corrected
`tests/test_schema2_legacy_rehearsal.py` rerun passed all **6** cases. The earlier broad
run started before this correction; it is not evidence of a clean final full-suite run.
