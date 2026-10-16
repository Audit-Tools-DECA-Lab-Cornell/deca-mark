# Mobile sync with PowerSync

This file is part of the [DECA Mark production plan](README.md) and defines the `SYNC-*` tasks. It is the gated target design for D2. D27 moved hosted sites/forms onto the existing SQLite outbox first; PowerSync has not replaced that transport. Finish MOB-29 and QA-07 without introducing a new engine. SYNC-01 remains the gate before the later PowerSync lane. The implementation is spread across components, and this file lists those tasks in order.

| Order | Task | Where | What |
|---|---|---|---|
| 1 | SYNC-01 | here | Spike: prove the risky assumptions (a gate) |
| 2 | DB-09, DB-10, DB-12 | [supabase/PLAN.md](../../supabase/PLAN.md) | Form lifecycle (`state`), collection columns, `upload_rejections`, zones, packages moved to Storage |
| 3 | DB-11 | [supabase/PLAN.md](../../supabase/PLAN.md) | `powersync_role` and the `powersync` publication |
| 4 | OPS-08 | [operations.md](operations.md) | PowerSync Cloud instance for staging |
| 5 | SYNC-02 | here | Stream definitions in the repository, deployed to staging |
| 6 | BE-12 | [backend/PLAN.md](../../backend/PLAN.md) | `POST /v1/sync/upload` |
| 7 | MOB-09 → MOB-12 | [mobile/PLAN.md](../../mobile/PLAN.md) | Client database, connector, one-time migration, drafts |
| 8 | QA-02, QA-03 | [verification.md](verification.md) | Stream isolation and sync correctness |

Research basis: PowerSync docs verified on 2026-09-22 (links inline). Treat anything marked **unverified** as a spike question.

## Why PowerSync, and what it does not do

- **What it does.** Postgres rows reach devices through scoped streams: projects, sites, zones, form versions, package metadata, the user's own observations and rejections. Local writes are queued in `ps_crud` and handed to our `uploadData()` connector.
- **What it does not do.** PowerSync does not authorize uploads. FastAPI still validates every write under RLS ([architecture.md](architecture.md#security-rules)), and it does not move files. Package archives are downloaded from Storage separately (MOB-14).
- **A caveat.** A write the server discards is reverted on the device at the next checkpoint.
  - That is why rejections are written server-side to `upload_rejections` and synced back (BE-12).
  - It is also why the client completes a batch **only** after a well-formed per-operation answer (MOB-10). Otherwise a rejected observation would silently vanish.

## Source database

- **Replication role:** `powersync_role WITH REPLICATION BYPASSRLS LOGIN`.
  - It needs `USAGE` on `fieldmaps` and `extensions`, plus `SELECT` on the published tables.
  - `BYPASSRLS` is required because every `fieldmaps` policy targets `fieldmaps_api`.
  - The password is set out-of-band (DB-11).
- **Publication.** It must be named `powersync` and must list the tables explicitly; never use `FOR ALL TABLES`. PowerSync reads every change in the publication.
- **Grants and large rows.**
  - `powersync_role` gets **whole-table** SELECT. PowerSync's snapshots run `SELECT * FROM <table>`, which fails with 42501 under a column-limited grant.
  - Server-only columns such as `site_packages.storage_path` are kept off devices by the stream queries' explicit column lists.
  - `site_packages.archive` (bytea, up to 16 MiB; PowerSync's row cap is 15 MB) must be gone before the table is published: DB-14 drops it, and DB-11 depends on DB-14.
- **What never goes in the publication:**
  - audit tables;
  - `gis_reader_grants` and `gis_views`;
  - anything in `fieldmaps_private` or `fieldmaps_auth_hooks`.
- **Connection.** Use the direct connection `db.<ref>.supabase.co:5432`, not the pooler. It is IPv6, which PowerSync Cloud supports.
- **Replication slots.**
  - Supabase allows about 4 logical slots, and each PowerSync instance holds one, plus a second one during a config deploy.
  - Keep staging and production on separate Supabase projects.
  - Set `max_slot_wal_keep_size` (for example 1GB). A deprovisioned instance leaves a slot that holds WAL, and the Free plan deprovisions after 7 idle days.
- **No generated columns for sync on Postgres 17.** Stored generated columns only replicate from PG18. Compute lon/lat in the stream query with `ST_X`/`ST_Y`.

## Streams (edition 3)

SYNC-02 must author and verify `powersync/sync-config.yaml` after SYNC-01 and the current-schema DB-11/DB-12/DB-14 prerequisites. No executable stream YAML is approved here. The September prototype referenced the removed `fieldmaps.zones` table, a nonexistent `sites.current_package_id`, numeric rounds and obsolete observation fields; it has been removed rather than left as a runnable template.

Use the current canonical baseline and exact form/package bindings:

| Replicated concept | Current source or required prerequisite | Boundary |
| --- | --- | --- |
| Identity and memberships | `profiles`, `organization_members`, `project_memberships`, including inherited project access | Scope by authenticated issuer/account and authorized project; Training personal rows remain creator-only. |
| Sites and current pointer | `sites`, `site_zone_state` | Never infer current from a maximum version or put the pointer on `sites`. |
| Immutable packages and zones | `site_packages`, `zone_identities`, `package_zones` | Retain exact referenced historical packages/snapshots and form bindings; exclude archive bytes/private delivery paths. |
| Forms and own observations | `form_versions`, `observations` | Replicate canonical answers, `package_id`, `zone_id`, `round_type`, `first_round` and `placement_source`; derive recorded version/label from exact snapshots, not removed observation columns. Inventory has null event geometry. |
| Rejections, assignments and devices | Remaining DB-10/BE-12 work | Do not query absent tables or claim durable rejection replication until these prerequisites exist. |

Every query must return a stable `id`, filter by authenticated access before any client parameter, and use an explicit column allowlist. Client parameters may only narrow authorized scope. A stream/column change also changes QA-02's expected row sets. The spike must verify provider SQL/geometry support and SDK compatibility; the September vendor research is not proof against the current runtime.

PowerSync replication bypasses API RLS, so stream isolation is its own release gate. Test organization inheritance, removal/revocation, creator-private Training data, cross-account scope and historical package retention. Never replicate the private email outbox, audit tables, credentials, or server-only publication requests. These requirements replace the old illustrative YAML; they do not claim deployed replication.

## Client design (planned for MOB-09 to MOB-12)

PowerSync is not installed as the collector transport. The current SQLite/catalog/session interfaces remain authoritative until the gated replacement is accepted. MOB-09 owns SDK installation/native rebuild and owner-bound credentials; recheck package versions at the spike instead of treating September peer ranges as current proof.

The replacement must preserve current-schema observations, immutable payloads/receipts, unfinished and parked drafts, account grants and all retained package references. Use issuer/account scoping, reject stale cross-account completions and never complete a CRUD batch without exact owner/result identity checks. MOB-11 owns this supported-schema transition; the pre-launch policy does not require a frozen v3/shell-v1 compatibility module or an experimental upgrade ladder.

Local-only data includes unfinished/parked work, package file/reference state and held/rejected payloads. Do not delete it implicitly on token expiry, disconnect or a failed replacement. Explicit discard, device removal and account deletion must respect the owning lifecycle and pending-work confirmation rules. `PACKAGE-LIFECYCLE.md` and MOB-28/MOB-33 semantics remain binding.

The future connector sends the reconciled canonical bound envelope through BE-12's batch interface. It may acknowledge a batch only after parsed per-operation results match the immutable observation IDs and the database's issuer/account. Malformed/HTML responses, transport errors and receipt mismatches preserve the queue. Rejections remain visible with their original payloads after any sync checkpoint. Visible states map one entry per observation ID without hiding pending work behind a replicated accepted row.

Current project/form/package discovery is already supplied by the D27 API path. A new engine must replace that transport deliberately after acceptance, not create a competing session, package catalog or second writer while polygons are being finished.

## Tasks

### SYNC-01: PowerSync spike on staging (the gate for PowerSync work)
Status: todo · Phase 2 · Size L · Depends: DB-01, DB-02, OPS-04 · Blocks: DB-11, MOB-09, OPS-08, SYNC-02
Needs user: create the PowerSync account and the spike instance, and approve a temporary role and publication on the staging database.
Read first: this file; `mobile/package.json`; `mobile/app/_layout.tsx`; `supabase/migrations/*`.
Do: on a throwaway branch with staging data only, prove each criterion and record the evidence.
1. `powersync_role` (REPLICATION, BYPASSRLS, USAGE on `fieldmaps` and `extensions`) replicates over the IPv6 direct connection from an explicit-list `powersync` publication.
2. `ST_X`, `ST_Y` and `ST_AsGeoJSON` on `extensions.geometry` work inside a stream query.
3. The "Use Supabase Auth" option accepts the project's ES256 tokens, with audience `authenticated`.
4. `@powersync/react-native` plus `@op-engineering/op-sqlite` build and run on Expo 57 / RN 0.86, in an iOS simulator and an Android emulator, with `expo-sqlite` removed and `useThirdPartySQLitePod` set.
5. With two users in different organizations, user B's client receives zero of user A's rows.
6. An `uploadData()` sent to a stub endpoint that returns 200 with a rejection keeps the queue moving.
7. **The initial snapshot works with DB-11's exact grants.** Replicate a `site_packages`-shaped spike table that has no bytea column, with whole-table SELECT for `powersync_role`, and confirm that the snapshot and a later insert both arrive.
   - Also confirm that a column-limited grant makes the snapshot fail. That failure is why DB-11 grants whole tables and drops `archive` first (DB-14).
8. **Teardown (Needs user).** Leave nothing behind for DB-11 or OPS-08 to collide with:
   - deprovision the spike instance, or record that OPS-08 reuses it;
   - `SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE NOT active AND slot_name LIKE 'powersync%';`
   - `DROP PUBLICATION IF EXISTS powersync;`
   - `REVOKE ALL ON ALL TABLES IN SCHEMA fieldmaps FROM powersync_role; REVOKE ALL ON SCHEMA fieldmaps, extensions FROM powersync_role;`
   - `DROP ROLE IF EXISTS powersync_role;`

   A role that still holds privileges cannot be dropped (2BP01), which is why the REVOKEs come first.

   DB-11 is idempotent anyway.

Done when:
- `docs/decisions/0002-powersync.md` records pass or fail for each criterion, with evidence, and the teardown;
- the spike branch is not merged.

If any of criteria 1–7 fails, **stop**. The user re-decides D2; the fallback is the existing outbox plus ETag pulls.

Only the PowerSync-specific tasks wait for this gate: DB-11, OPS-08, SYNC-02 and MOB-09 onwards. DB-09, DB-10, DB-12 and BE-10 to BE-13 are needed by either sync design, so they proceed in parallel.

Verify: the decision record exists, and the user has read it.

### SYNC-02: Stream definitions in the repository, deployed to staging
Status: todo · Phase 2 · Size M · Depends: DB-09, DB-10, DB-11, DB-12, OPS-08, SYNC-01 · Blocks: MOB-09, QA-02
Read first: the Streams section above; [supabase/PLAN.md](../../supabase/PLAN.md) (DB-10, DB-12 column names).
Do:
1. Create `powersync/README.md`, covering what this is, how to deploy it (dashboard or CLI) and the edit rules above.
2. Author `powersync/sync-config.yaml` from the current-schema requirements above and verified DB-11 grants; execute every query against the intended schema before deployment.
3. Add the `powersync/` row to the routing table in the root `AGENTS.md`.
4. Deploy to the staging instance (**Needs user** to approve), then confirm it in the PowerSync diagnostics app with a staging user.

Done when:
- the YAML in the repo matches what is deployed;
- a staging user syncs their memberships, projects and own observations.

Verify: diagnostics-app screenshots or logs are attached to the task notes. QA-02 then checks isolation.
