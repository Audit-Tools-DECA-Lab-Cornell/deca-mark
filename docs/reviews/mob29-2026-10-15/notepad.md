# MOB-29 and Janet demo work log
Started: 2026-10-15

## Goal
Complete the current bound observation uploader on the existing SQLite outbox, with immutable persisted envelopes, exact receipt checks, preserved rejections and account fencing. Prepare a clearly synthetic QGIS playground and presentation checklist. No credentials/config reads, hosted writes, external email sends or Git mutations.

## Plan
1. Inspect current contract/storage and agree executable ownership waves.
2. Implement mobile sync test-first while producing the independent QGIS demo asset.
3. Run full mobile checks and live disposable API/SQLite acceptance; inspect QGIS/import surface.
4. Exercise native mobile runtime if a usable current build is available, without reinstall/reset or erasing pending work.
5. Obtain independent strict review, reconcile docs and report exact completion/acceptance boundaries.

## Success criteria and scenarios
- Point/Inventory serialization freezes exact site/package/zone/form/round and answers at save; Inventory omits point-only fields. Test driver: mobile sync payload/storage tests RED before implementation, GREEN after.
- Reconnect/restart/replay sends the identical body and acknowledges only exact observation/project/user/package/zone receipt IDs; rejection retains payload/code and package references. Test driver: coordinator/storage/client tests and live disposable API acceptance.
- Account/issuer/project changes and malformed/HTML/mismatched receipt responses cannot acknowledge another account or mutate frozen work; provider starts on foreground/network recovery with no closed-app claim. Test driver: provider/coordinator tests plus actual native surface if available.
- Sample QGIS site uses clearly synthetic geometry/provenance, self-contained upload assets, valid ground/nonoverlapping starter zones and room to draw; actual importer and QGIS Desktop open/inspect evidence.
- Janet checklist distinguishes verified source/local behavior, physical/hosted gates and email queued/provider/inbox delivery.

## Initial state
Prior documentation reconciliation remains uncommitted: preserve all 76 Markdown edits and its audit artifacts. No production code changes existed at start of this task. Current schema version 6; upload registry always false and provider is a stub. A physical iPhone is connected but no DECA Mark dev app appears in its installed-app list. No Android device/simulator listed.

## Skills
Programming + TypeScript references: strict boundary schemas and test-first implementation. Native-data-fetching: existing ky transport/error/cancellation patterns. Offline-sync-designer: preserve local-first writes and foreground retries, constrained by immutable append-only records rather than last-write-wins. Reviewed COPA-specific offline/version skills; their app paths/policies do not govern DECA Mark. No new transport/state engine is authorized or needed.

## Current progress
Source implementation, demo, local acceptance, documentation and independent strict review are complete. Physical Android acceptance is open because neither the device connector nor `adb devices -l` exposes the collector. The owning task remains doing; source/local delivery is approved unconditionally.

## Results
- Mobile RED evidence captured before behavior changes; final full Vitest rerun passes 701 tests with 2 loopback-fixture tests skipped. The bound acceptance test runs separately against its actual runtime. A pre-existing installed-list timing failure in untouched `hosted/provider-download.test.tsx` passed its isolated rerun and the full final rerun; no speculative unrelated fix applied.
- Actual Node 24/FastAPI/PostGIS/SQLite scenario passes: install both dynamic forms, save point + Inventory, publish map v2, reopen SQLite, retry the lost response with identical map-v1 bodies and receipts, independently read/export both records. Final repeat includes changed-body same-UUID conflict.
- Native QGIS 4.2.2 reopens the delivered project with EPSG:4326 and all four layers. Inspected actual canvas preview. Live API GeoJSON loads as 2 observations/1 historical zone; both remain v1, Inventory geometry null. Readback evidence is separate from the synthetic demo map.
- Demo importer: 5 focused tests and 20 adjacent regression tests pass; source preparation has no issues. Python type checking passes. Both iOS and Android Metro bundles export with dotenv loading disabled.

## Corrections resolved during verification
The initial demo XML had missing native CRS/order and dangling layer-tree IDs; native QGIS normalization plus a regression test fixed it. The first live harness run missed its signer fixture and then exposed an incomplete seeded practice form; the driver now owns its signer and publishes a real dynamic synthetic play form through the API. These were fixture/artifact defects; no hosted state changed.

## Remaining gate
Final mobile checks exit 0, 701 tests pass, and both exact-source platform exports exit 0. Task-owned Expo/QGIS scratch files are removed; no disposable API container remains. Independent reviewer reran 46 focused mobile tests and 20 importer tests, found one incorrect invitation navigation instruction (fixed to project Team → Invite → Manager), and approved source/local delivery unconditionally ([verdict](review.md)). Run physical-device draft/publication/restart/reconnect/server/QGIS acceptance when Android is connected; do not mark MOB-29 done without it. Preserve all prior docs and existing records. No commit, push, stage, deployment, real invitation or secret-file access is authorized.
