# MOB-28 / MOB-33 local acceptance — 2026-10-13

Base commit: `23afd833b4f26325ac76f05ac5d7a7c711889e6d`. This report describes
the mobile data changes relative to that baseline. Owning statuses are in
`mobile/PLAN.md`. The [UI handoff](../../../mobile/MOB-33-HANDOFF.md) documents
the implemented public interface and the pending Claude acknowledgment.

## Changes and contract compliance

- MOB-28's live fixture now supplies the actual tenant site UUID and parses
  the current typed publication/draft responses. It installs a real server
  format-1 archive through `/v1`, verifies the exact form UUID/version, closes
  and reopens real SQLite/filesystem storage, and restores identical content
  without a download. A disposable database and generated test signing key
  are used; no hosted target is touched.
- MOB-33 freezes managed site/package/zone UUIDs, package digest and recorded
  code/label when an observation opens. A zone change updates the durable
  binding and context in the same handler. Restart/resume retains the choice.
  Collection visits retain their map, while fresh visits choose the newest
  verified installed version. The collect route brackets its runtime lease.
- Schema version 6 adds account-scoped parked drafts. Parking frees the active
  slot transactionally, preserves answers and map references, and does not
  allow an active draft to be overwritten. Active and parked references count
  against removal. Same-schema restarts retain work; incompatible experimental
  schemas follow the established reset rule.
- Read models expose available versus installed versions, integer version
  and UUID facts, exact recovery state, byte/date facts, download parts,
  cached last-check time and permission/transport/verification failures.
  Reference counts distinguish unfinished, unsent, attention, open visit and
  retained synced records. Removal rechecks SQL rather than trusting UI counts.
- Every SiteZone now carries identity, anchor and full geometry. Navigation
  boxes cannot become collection boundaries. Bundled rectangular practice
  shapes are explicitly authored; managed anchors are read from the archive.
  Closed point coverage matches all 16 shared cases, including shared edges,
  vertices, holes and multipart shapes. Invalid bound points remain unfinished.

No backend wire contract or product policy changed. The stale generated-type
reference to removed `UploadReceipt` was replaced with the existing runtime
receipt schema's inferred type. Bound upload/receipt integration remains
MOB-29; records continue to be held locally until that task enables transport.

## Tests actually run

Runtime: Node 24.18.0, pnpm 10.17.1, real Node SQLite/filesystem adapters,
disposable PostgreSQL/PostGIS and loopback FastAPI. No secret file was read.

```sh
pnpm mobile:check
pnpm mobile:test
sh database/mobile-package-rehearsal.sh -q -s
EXPO_NO_DOTENV=1 pnpm exec expo export --platform all --output-dir /private/tmp/mob33-export-reviewed
```

The export command runs from `mobile/`; the configured platforms are iOS and
Android. Both Hermes bundles pass. `mobile:check` passes typecheck and Biome
with informational notices only. The final mobile suite passes **554 tests**;
one live-API test is intentionally skipped outside its guarded rehearsal.
That live test passes separately through the actual signed API and restart
driver (**one pytest and one nested Vitest test**).

The zone-switch regression failed first (`expected B, received A`) and then
passed after same-handler persistence. New checks cover parked references,
active-slot conflicts, real-catalog version projections, exact recovery
failures, access removal, download serialization for historical and still-current
packages, disposed queued operations, outside-zone save refusal and visit
pinning. The global mobile suite retains existing storage/account/reset tests.

## Review

Independent specification review identified recovery availability, exact-package
unavailability, current-package download queuing, fake restoration and known
membership-removal gaps. All were corrected and regression checked. The final
source specification verdict is **PASS**, with no remaining P1/P2 findings.
Independent code-quality review identified a stale access snapshot across map-open
waits and terminal download-state/catalog visibility races. Callbacks now read
current access through a ref; per-site attempt tokens fence displayed progress,
and every successful current-runtime install reloads the catalog even if a later
queued recovery owns progress. Real-provider regressions prove these behaviors.
The final source code-quality verdict is **PASS**, with no remaining P1/P2
findings. Stopped or usage-limited reviewers are not counted as approval.

Changed handwritten TypeScript modules remain below 250 code lines; larger
session coordination and geometry predicates were split by responsibility.
Runtime JSON/SQL boundaries use the existing parsers. The fixture's Python
response handling uses current generated models and explicit JSON parsing.
Ruff, formatting and focused BasedPyright pass; the TypeScript programming
audit reports no rule violations. Plan and diff checks pass. Every changed
module has a named responsibility; no untyped assertion, suppression or new
compatibility path is introduced. Geometry predicates, session memory and
account-visible projections remain separate from storage and route rendering.

## Remaining evidence

MOB-28's current-API acceptance gate is complete. MOB-33's code and local
acceptance are ready for the UI owner. Its documented **interface acknowledgment
remains pending**, so its task stays doing until that acknowledgment is recorded.
No simulator, physical-device, hosted deployment or release evidence is claimed.
MOB-30 through MOB-32 supply observer presentation; MOB-29 and QA-07 retain the
real offline collection/upload/readback gates.
