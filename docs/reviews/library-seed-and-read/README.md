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
