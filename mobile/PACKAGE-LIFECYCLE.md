# Offline package lifecycle foundation

MOB-28 owns this foundation. [Product-wide pre-launch policy](../docs/plan/README.md#pre-launch-compatibility-policy-2026-10-11) permits incompatible experimental data to be reset. [MOB-33](PLAN.md) owns the session/read-model integration; MOB-29 owns bound uploads, and MOB-30–32 own the mobile presentation.

## Current behavior

The current SQLite collection schema is created directly. A version mismatch resets every user table in the collector database in a transaction. A durable marker requires clearing the `hosted/` package/cache directory before the collector mounts; failed cleanup retries on restart. Current-schema restarts preserve records, drafts, grants, selections and references. Auth/session files live outside this directory and are not an authentication-reset mechanism.

Catalog content is immutable by issuer/project/package/archive digest. SQLite stores separate account grants and per-site downloaded selection; server current metadata never replaces an open package. Installation validates archive digest, manifest, complete zone geometry/digests and exact form identities, stages unique files, publishes immutable content, and commits the catalog/grant/selection transaction. Cancellation is checked inside the queued transaction. Partial installs cannot displace the last verified selection.

References include drafts, records in every local state and stored leases. The foreground collector also holds an account-scoped lease before its first draft. Removal cancels a download and rechecks references/leases transactionally. Removed grants disappear from that account's catalog; shared immutable bytes remain conservatively retained until a schema reset. There is no ordinary file garbage-collection policy yet; this avoids deleting a file another account or in-flight installation needs.

A missing/corrupt package is `needs_redownload`; answers and identity remain. Exact re-download repairs catalog content without substituting a new map or form. Unreadable drafts remain blocked (`unreadableDraft`) until explicit discard; a different draft ID cannot overwrite them. Recovery validates the saved package/version, zone and form and never chooses the first available zone as a replacement.

Discovery uses the single `/v1/projects/{project}/sites` contract. A 404, 405, authentication error or transient failure reports failure; there is no old-server fallback. Only the zone-aware format-1 manifest is supported; incompatible experimental archives are rejected. MOB-33 now wires the bound session and geometry validation; MOB-29 now wires immutable bound uploads, exact receipts, structured rejections and foreground reconnect/resume/retry in source. Bound records enter the pending queue; bundled practice remains local-only. Existing current-schema held bound records activate from their own saved context. No flat practice uploader or SQL protocol discriminator is restored. Local automated and disposable API/QGIS acceptance passes ([evidence](../docs/reviews/mob29-2026-10-15/README.md)).

BE-22 and DB-19 now supply the current schema and sole `/v1` contract. The live disposable package rehearsal installs a server-published format-1 archive and reopens its exact forms through real SQLite/filesystem storage. [Current acceptance](../docs/reviews/zone-boundaries-2026-10-13/mob28-mob33.md) replaces the earlier package-format evidence.

## Interfaces for the next task

| Module | Interface and purpose |
| --- | --- |
| `storage/package-catalog.ts` | `installPackage`, `readCatalog`, `listCatalog`, `removePackage`; removal returns reference reasons and `contentRetained` |
| `storage/available-current.ts` | Current server package is separate from downloaded selection; queued writes take a generation predicate |
| `storage/{draft-store,observation-store}.ts` | Durable draft/record insertion and references share transactions; an open collection is a foreground lease (`activeLease`), never a stored row |
| `packages/hosted/operations.ts` | `PackageOperations.catalog/refresh/download/remove`; current or exact historical package download; verified/needs-redownload catalog values |
| `packages/hosted/provider.tsx` | Existing provider plus `installed`, `download(project,site,packageId?)`, `removeVersion(identity)`; all visible state is account-gated |
| `session/provider.tsx` | Existing session actions, exact recovery, `unreadableDraft`, generation-fenced callbacks and foreground lease |

MOB-33 adapts these stores into `zone-read-models.ts`, with the selected **one collect visit plus durable unfinished observation** policy, parked drafts and atomic zone changes. The UI owner acknowledged that interface on 2026-10-14.

## Reproduce acceptance

```sh
pnpm mobile:check
pnpm mobile:test
sh database/mobile-package-rehearsal.sh -q -s
```

After BE-22/DB-19, the guarded rehearsal uses an ephemeral PostgreSQL/PostGIS container and signed loopback API. It publishes an actual zone-aware format-1 ZIP against a readable research form, installs it through the mobile package pipeline and reopens the real SQLite/filesystem catalog. It does not target hosted Supabase or establish physical-device acceptance.

## MOB-33 integration

The [UI handoff](MOB-33-HANDOFF.md) exposes available/installed versions, exact pinned sessions and recovery models. The current collector schema is version 6; it includes account-scoped parked drafts whose map references count in removal checks. A collect visit holds a runtime lease and never adopts a newer package; an unfinished observation freezes its UUID bindings and keeps its exact forms through restart. The UI owner acknowledged the interface on 2026-10-14 and MOB-30 through MOB-32 now consume it. Their simulator/VoiceOver acceptance is still pending. MOB-29’s bound transport is source-implemented; local automated and disposable API/QGIS verification passes, while physical iPad/Android acceptance remains with that task and QA-07.
