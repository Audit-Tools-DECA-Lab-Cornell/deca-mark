# Mobile plan: retain the boundaries used in the field

[Master plan](../docs/plan/zone-boundaries/README.md) · [Contract](../docs/plan/zone-boundaries/contract.md) · [Detailed UI plan](ZONE-BOUNDARIES-UI.md) · Tasks MOB-28 to MOB-33 in [PLAN.md](PLAN.md). Claude owns detailed screen/interaction planning ([ZONE-BOUNDARIES-UI.md](ZONE-BOUNDARIES-UI.md), which also lists the read models the UI needs from this plan); this document defines mandatory data behavior and test obligations.

## Current foundations and risks

Read `src/domain/observation.ts`, `session/provider.tsx`, `storage/{observation-store,draft-store,sync-store}.ts`, `packages/{open,site-package}.ts`, all of `packages/hosted/`, `sync/{contracts,client,provider}.ts` where present, and `maps/geometry.ts`. Locate actual paths with `rg --files`; do not infer a future PowerSync implementation from roadmap text.

Current records/drafts already retain package ID/version and a zone code/label. `sync/contracts.ts::uploadPayload` omits package binding. Geometry handles MultiPolygon/holes, but ray casting has unspecified exact-edge behavior; missing geometry can become a bbox. `resumeRecovered` falls back to the first zone if the saved one is missing. Package JSON writes are direct, site-list refresh can replace current metadata, and removal does not check references. These are targeted repairs, not grounds for replacing the whole architecture.

## MOB-28: local schema and package lifecycle

Introduce a bound record discriminator, exact server site/package/zone UUIDs and persisted upload protocol. Retain legacy code fields and old Zod parsing. At creation, freeze the upload representation/canonicalization version. Never add v2 fields to an existing SQLite record merely because it has local package context; it may already have been accepted with a lost receipt. Migration is forward-only and preserves payload, ownership, ID, upload state, attempts, receipts and errors for every existing row.

Persist package catalog/selection and references through the existing SQLite storage boundary. References are scoped by issuer/account/project and include active session, unfinished draft and unsent/needs-attention record. Record insertion and required reference insertion occur in one SQLite transaction. A crash cannot leave a durable new observation pointing to a package that cleanup thinks is unused. Derive or transactionally maintain reference counts; do not use an unprotected increment/decrement counter. Keep references while local record detail needs the archive; releasing an uploaded record's reference requires an explicit retention rule and safe server re-download path.

Package content lives in issuer/project/package/digest-addressed files. Authorization/selection belongs to account/project, even if verified content is safely deduplicated. Do not assume a UUID filename is authorization. A shared file must not be deleted while another account still references it. Legacy site-list cache keys currently omit issuer; migrate only proven current-issuer data and retain unidentified files for recovery rather than exposing them under a guessed account.

Use a staged installation protocol: download to unique temporary path → verify archive digest and parse strict manifest/layers/forms → write immutable package files → persist verified catalog entry and selection atomically in SQLite. Filesystem and SQLite do not share a transaction: on restart reconcile orphan staged files and catalog rows without deleting referenced old packages. Never mark readiness from file existence alone. Failed/cancelled/quota-limited download leaves the old verified selection unchanged. Do not overwrite a verified archive under the same immutable identity.

Keep `available_current_package` separate from `selected_downloaded_package`. A refreshed v8 site list must not make installed v7 disappear or prevent a v7 draft resuming. Download v8 beside v7, then offer it for the next session. Exact older packages open by stored identity without requiring a current network lookup. Missing/corrupt old package produces a recoverable state; retain answers and offer exact-version re-download when authorized. Never choose the first available zone or latest package as a substitute.

Add account/request generation fencing to refresh/download callbacks. Account or project change cancels in-flight work and stale completions cannot populate another account's state or selection. Package removal first cancels download, checks all durable references and active leases, then removes only unreferenced material. Sign-out/session loss behavior preserves existing account-gated records and recovery export; do not clear SQLite or packages as an authentication repair.

## MOB-29: collection, upload and geometry parity

New format-2 session context freezes package UUID/version/digest, server site UUID, zone UUID/code/label, play/inventory form versions and geometry contract version. Session context is durable enough to resume after process death. A foreground metadata refresh cannot replace that context. Zone switching is an explicit action within the same pinned package; carry-forward decisions must not silently copy zone-specific answers into a different zone.

Updated clients discover managed packages via the v2 site list. Fall back to v1 site discovery only after confirmed endpoint/capability absence and only for legacy collection, not after transient network/auth failure and never to downgrade an existing bound session/record. Cache capability with issuer/server identity and preserve exact local packages through server rollback.

A format-2 package is ready only when geometry/identity counts agree across manifest and layer, every zone has valid full shape, anchors and bound forms are present, and versions are supported. Missing polygon is a validation failure, not bbox fallback. Keep legacy format-1 behavior for existing data, labelled as legacy; do not reinterpret it as bound.

Share authored edge/vertex/hole/multipart membership cases with server tests. Preserve the current crosshair/nudge interface. Determine all covering zones for ambiguous edges, retain an explicitly chosen covering zone, and ask for a choice when needed. A point in a hole/gap or outside selected zone remains unfinished until corrected; local save must not require a server request. Prefer robust exact predicate logic over a visually arbitrary metre buffer. Test scaled/rotated screens without changing stored coordinates.

Inventory selects a zone and uses package form/anchor; v2 upload sends no event point. Keep a compatibility coordinate locally only if existing components require it, with a discriminator that prevents markers/exports claiming it is a point observation. v2 API reads return event geometry null. Display inventory progress separately from point counts; this feature does not invent protocol completion targets.

Upload v2 only for newly created bound records. Persist endpoint/protocol selection, reconstruct exactly the frozen body, and verify receipt observation/project/account/package/zone before acknowledging. Interrupted uploads retry the same UUID/body. Older v1 rows continue through unchanged serializer. Do not downgrade a rejected v2 request to v1. Missing token pauses; 429/503 retries; typed permanent geometry/conflict/access failures retain record in needs-attention. A renewed login does not rewrite scope or move records to a different project.

No per-point server call is needed. Existing site refresh discovers new versions; exact-package archive/form requests prepare the next session; v2 PUT and receipt complete upload. No closed-app background synchronization promise is added.

Historical exact-version recovery needs a form-loading path distinct from “choose a published form for a new map”: `hosted/prepare.ts::publishedForm` currently rejects retired versions and `inventoryForm` scans currently published candidates. For format 2, fetch the exact bound play/inventory definitions, accept authorized retired versions for historical package restoration, and never substitute the latest inventory form. Do not loosen the existing prohibition on publishing a new map against an ineligible form.

## Claude's mobile design questions

Claude decides the presentation of update available/continue current/start new session, older-version labels, explicit boundary ambiguity, missing-package recovery and removal-in-use explanations. Suggested language: “This round uses map v7. Map v8 is available for your next round.” Avoid prompting after every observation. Account errors must distinguish preserved local work from permission to upload.

Review offline readability, daylight contrast, large targets, handedness, orientation and accessibility in actual collector layouts. Do not redesign the map renderer unless a required interaction cannot be supported. No admin polygon editing on observer mobile in this feature.

## Acceptance and handoff

Use existing Vitest/storage tests plus new migration fixtures, concurrent account switch tests, lost-receipt replay, package reference/removal tests and geometry parity cases. Run `pnpm mobile:check` and `pnpm mobile:test`. A minimal driver must execute migrations/store/upload against local API with existing old rows; unit tests alone do not prove the queue survived an upgrade.

Real device scenario: download v7, airplane mode, start draft, publish v8 from manager web, reconnect/refresh, force quit/reopen, resume v7, save/upload, verify v7 historical zone server-side, then start a fresh v8 session. Repeat failed v8 download, attempted v7 removal, account switching and inventory. Record platform/build/commit and distinguish simulator from physical-device evidence. A fresh reinstall cannot substitute for an upgrade test with unsent data.
