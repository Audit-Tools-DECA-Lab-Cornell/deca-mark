# Mobile plan: retain the boundaries used in the field

[Master plan](../docs/plan/zone-boundaries/README.md) · [Contract](../docs/plan/zone-boundaries/contract.md) · [Detailed UI plan](ZONE-BOUNDARIES-UI.md) · Tasks MOB-28 to MOB-33 in [PLAN.md](PLAN.md). Claude owns detailed screen/interaction planning ([ZONE-BOUNDARIES-UI.md](ZONE-BOUNDARIES-UI.md), which also lists the read models the UI needs from this plan); this document defines mandatory data behavior and test obligations.

## Pre-launch policy

The owner confirmed on 2026-10-11 that incompatible experimental data can be discarded across every component. MOB-28 resets its local collection schema on a version mismatch instead of migrating old records. No older-server discovery fallback is required. Current-schema restart, account isolation, reference retention and recorded attribution remain the package lifecycle’s correctness requirements.

## Current foundations and risks

Read `src/domain/observation.ts`, `session/provider.tsx`, `storage/{observation-store,draft-store,sync-store}.ts`, `packages/{open,site-package}.ts`, all of `packages/hosted/`, `sync/{contracts,client,provider}.ts` where present, and `maps/geometry.ts`. Locate actual paths with `rg --files`; do not infer a future PowerSync implementation from roadmap text.

MOB-28 replaces the experimental upgrade ladder and flat practice uploader. Current storage retains exact package identities and account-scoped references, installation is staged and verified, and recovery never substitutes a zone. The implementation handoff is [PACKAGE-LIFECYCLE.md](PACKAGE-LIFECYCLE.md). Bound collection/read models remain MOB-33 and transport remains MOB-29; the updated single API requires BE-22 first.

## MOB-28: local schema and package lifecycle

Use one current SQLite collection schema. On a version mismatch, transactionally reset the collector database and clear obsolete package/cache files before mounting. The durable cleanup marker retries interrupted file removal. Auth files live outside this database/directory. Same-schema initialization preserves records, ownership, state and references. No upgrade conversion, protocol discriminator columns or older-client uploader remain.

Bound records freeze exact server site/package/zone UUIDs and the recorded label/geometry digest. Bundled practice remains local preview data and never enters the upload queue. MOB-29 enables eligibility and the one bound serializer after the single API is available.

Persist package catalog/selection and references through the existing SQLite storage boundary. References are scoped by issuer/account/project and include active session, unfinished draft and unsent/needs-attention record. Record insertion and required reference insertion occur in one SQLite transaction. A crash cannot leave a durable new observation pointing to a package that cleanup thinks is unused. Derive or transactionally maintain reference counts; do not use an unprotected increment/decrement counter. Keep references while local record detail needs the archive; releasing an uploaded record's reference requires an explicit retention rule and safe server re-download path.

Package content lives in issuer/project/package/digest-addressed files. Authorization/selection belongs to account/project, even if verified content is safely deduplicated. Do not assume a UUID filename is authorization. A shared file must not be deleted while another account still references it. Use issuer-scoped site-list keys. Old unproven caches do not authorize a map and may be discarded during a pre-launch reset.

Use a staged installation protocol: download to unique temporary path → verify archive digest and parse strict manifest/layers/forms → write immutable package files → persist verified catalog entry and selection atomically in SQLite. Filesystem and SQLite do not share a transaction: on restart reconcile orphan staged files and catalog rows without deleting referenced old packages. Never mark readiness from file existence alone. Failed/cancelled/quota-limited download leaves the old verified selection unchanged. Do not overwrite a verified archive under the same immutable identity.

Keep `available_current_package` separate from `selected_downloaded_package`. A refreshed v8 site list must not make installed v7 disappear or prevent a v7 draft resuming. Download v8 beside v7, then offer it for the next session. Exact older packages open by stored identity without requiring a current network lookup. Missing/corrupt old package produces a recoverable state; retain answers and offer exact-version re-download when authorized. Never choose the first available zone or latest package as a substitute.

Add account/request generation fencing to refresh/download callbacks. Account or project change cancels in-flight work and stale completions cannot populate another account's state or selection. Package removal first cancels download, checks all durable references and active leases, then removes only unreferenced material. Sign-out/session loss behavior preserves existing account-gated records and recovery export; do not clear SQLite or packages as an authentication repair.

## MOB-29: collection, upload and geometry parity

The single zone-aware format-1 session context freezes package UUID/version/digest, server site UUID, zone UUID/code/label, play/inventory form versions. An unfinished observation's context is durable enough to resume after process death; a session is one visit to the collect screen (decided 2026-10-11, [UI plan](ZONE-BOUNDARIES-UI.md) MUI-1). A foreground metadata refresh cannot replace that context. Zone switching is an explicit action within the same pinned package; carry-forward decisions must not silently copy zone-specific answers into a different zone.

Clients discover packages via the single `/v1/projects/{project}/sites` list. A missing/hidden project, unavailable endpoint or transient failure reports an error; do not fall back to an older server contract.

A zone-aware format-1 package is ready only when geometry/identity counts agree across manifest and layer, every zone has valid full shape, anchors and bound forms are present, and versions are supported. Missing polygon is a validation failure, not bbox fallback. Reject old manifests and alternate formats; do not reinterpret them as current maps.

Share authored edge/vertex/hole/multipart membership cases with server tests. Preserve the current crosshair/nudge interface. Determine all covering zones for ambiguous edges, retain an explicitly chosen covering zone, and ask for a choice when needed. A point in a hole/gap or outside selected zone remains unfinished until corrected; local save must not require a server request. Prefer robust exact predicate logic over a visually arbitrary metre buffer. Test scaled/rotated screens without changing stored coordinates.

Inventory selects a zone and uses the package form/anchor. The bound upload sends no event point. Any local UI coordinate is display-only and never enters the event wire body or GIS point counts. API reads return event geometry null. Display inventory progress separately from point counts; this feature does not invent protocol completion targets.

Upload only package-bound records through the single `/v1` envelope. Reconstruct the frozen body and verify receipt observation/project/account/package/zone before acknowledging. Interrupted uploads retry the same UUID/body. Missing token pauses; 429/503 retries; permanent geometry/conflict/access failures retain the record in needs attention. Renewed login never rewrites scope or moves records to another project. There is no old serializer or alternate endpoint fallback.

No per-point server call is needed. Site refresh discovers new versions; exact-package archive/form requests prepare the next session. No closed-app background synchronization promise is added.

Historical recovery fetches exact bound play/inventory definitions and accepts authorized retired versions; it never searches for another inventory form. Publishing a new map still requires eligible published forms.

## Claude's mobile design questions

Claude decides the presentation of update available/continue current/start new session, older-version labels, explicit boundary ambiguity, missing-package recovery and removal-in-use explanations. Suggested language: “This round uses map v7. Map v8 is available for your next round.” Avoid prompting after every observation. Account errors must distinguish preserved local work from permission to upload.

Review offline readability, daylight contrast, large targets, handedness, orientation and accessibility in actual collector layouts. Do not redesign the map renderer unless a required interaction cannot be supported. No admin polygon editing on observer mobile in this feature.

## Acceptance and handoff

Use existing Vitest/storage tests plus schema-reset fixtures, concurrent account switch tests, lost-receipt replay, package reference/removal tests and geometry parity cases. Run `pnpm mobile:check` and `pnpm mobile:test`. A minimal driver must install an actual current package through the local API and reopen its SQLite/filesystem catalog. Old-schema queue upgrade acceptance is removed by the pre-launch reset policy.

Real device scenario: download v7, airplane mode, start draft, publish v8 from manager web, reconnect/refresh, force quit/reopen, resume v7, save/upload, verify v7 historical zone server-side, then start a fresh v8 session. Repeat failed v8 download, attempted v7 removal, account switching and inventory. Record platform/build/commit and distinguish simulator from physical-device evidence. A fresh reinstall cannot substitute for a same-schema restart with unfinished or unsent data.
