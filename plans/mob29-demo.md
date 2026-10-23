# MOB-29 and Janet demonstration — 2026-10-15

## Goal and acceptance

Current outcome: source/local delivery is independently approved, with 701 mobile tests, both platform exports, real disposable API/SQLite replay and native QGIS readback passing. See [evidence](../docs/reviews/mob29-2026-10-15/README.md). Physical collector acceptance is unavailable until the selected Android is connected; MOB-29 remains doing. The existing iPad/Android release matrix and QA-07 remain open.

Finish the collector's foreground upload path for exact package/zone-bound observations, and provide a self-contained, explicitly synthetic QGIS site package plus a practical Janet demonstration sequence.

1. Saving a bound observation stores its exact `/v1` body in the same transaction as the observation/reference. Point bodies use nested `answers`; Inventory omits `coordinates` and `first_round`. Practice remains local-only. Package/form updates cannot change queued bodies.
2. Uploads validate observation, account, project, package and zone receipt identities before acknowledgement. A lost receipt retries the same UUID/body; 401 pauses; 429/503 retry; permanent failures retain the observation and structured rejection code. Account changes fence token access, requests and late writes.
3. Saving, reconnecting, foregrounding and explicit retry exercise the actual provider/coordinator rather than leaving the current placeholder provider in place. Retry cannot relabel owners, packages, zones or answers.
4. The sample QGIS artifact imports through the actual importer, contains its supported vector sources, has an outline and clearly synthetic labels, and supports drawing/editing/publishing zones before collector use. A sample is not research evidence.
5. Documentation distinguishes local/runtime verification, physical-device acceptance and hosted deployment. MOB-29 cannot be marked fully done solely because unit tests pass; its owning task explicitly requires a physical-device/server/QGIS scenario.

## Skills and boundaries

- `implementation-planning`: order client/storage/runtime/test work against the existing contract.
- `omo:programming`: TypeScript/Python implementation and verification practices.
- `native-data-fetching`: upload transport, retry, cancellation and current-account behavior.
- `mobile-version-bump`: apply the repository's applicable mobile version policy after mobile changes.
- `docs-sync`: update only current owning documents and link fresh evidence.

The `mobile-offline-sync-change` skill was inspected: its Legend State/MMKV/COPA-specific file and layer instructions do not describe this Expo SQLite product and must not introduce that architecture here. Preserve the current SQLite/package lifecycle. The existing observation JCS fingerprint is a server concern; do not invent a second client algorithm or serializer.

No `.env`, secret-file or deployment-configuration reads; no commits, branching, pushes, schema resets, hosted mutations or email sends. Existing uncommitted documentation changes belong to the user and must remain intact. Creating the synthetic demo artifact and running isolated local verification are authorized.

## Ordered execution waves

### Wave 1 — establish fresh RED evidence and the demo facts (parallel)

**Mobile worker owns** `mobile/src/domain/`, `mobile/src/storage/`, `mobile/src/sync/`, affected `mobile/src/forms/registry.ts`, and directly related tests. Read `mobile/README.md`, current `mobile/PLAN.md` MOB-29, the exact observation-upload contract, current auth provider and package access fences. Inspect `mobile/src/sync/provider.tsx`: it is presently a placeholder. Write/run failing tests before behavior changes for the scenarios below. Worker must not change plans or evidence docs reserved to the primary.

**Primary owns** `qgis/janet-demo/` (or equivalently focused new demo folder), directly related importer verification, demo guidance, review evidence, mobile task status and current roadmap. Read QGIS import implementation and requirements before building the artifact. Inspect current invitation creation/preview/redemption and manager-role UI so the demo distinguishes available invitation flows from verified email delivery. Do not send invitations.

### Wave 2 — implement and package (parallel)

**Mobile worker:** use the current data model/store/coordinator with the smallest necessary additions. Persist the exact wire body at save/commit, not from the currently selected package during upload. Prefer storing it inside the existing payload rather than changing SQLite schema version: do not reset/delete current local records to introduce this feature. Permit all valid retained bound form versions; the static bundled registry or today's published pointer must not decide historical upload eligibility. Retain atomic package-reference protection. Validate receipts at the persistence boundary as well as transport so a direct coordinator/upload mock cannot acknowledge the wrong owner/package. Store structured rejection codes independently from presentation copy. Wire foreground wake/reconnect/retry to the current account with cancellation and late-result fences.

**Primary:** produce a deterministic `.qgz` containing supported embedded GeoJSON/vector sources, with a site outline, synthetic initial zone(s), optional paths/trees and no remote/raster/credential dependency. Provide a short demo sequence: new site → upload → draw/edit/publish → download collector map → synthetic point and Inventory → offline/reconnect upload → manager historical context → QGIS readback. The demo should use two map versions to show that previous observations keep the original boundaries. Identify exact form prerequisites.

### Wave 3 — integration and real-surface QA (sequential after Wave 2)

Run the tests below and `pnpm mobile:check`, `pnpm mobile:test` under Node 24/pnpm 10.17.1. Extend/run the existing current-package loopback acceptance harness only through a permitted no-secret setup. `backend/tests/test_mobile_package_api.py` and `backend/tests/test_zone_api_live.py` are useful templates, but their default `tests/local_database.py` reads `database/.local/fieldmaps-api-password`; do not use that default without the user naming the file. `database/zone-api-rehearsal.sh` creates an isolated trust container and injects an ephemeral DSN; inspect/use `database/mobile-package-rehearsal.sh` as the intended no-existing-secret entry point. An already running authorized runtime or a newly isolated no-secret fixture can provide the HTTP surface. If unavailable, finish unaffected work and report the exact acceptance limitation.

Drive the actual importer with the generated archive and capture its parsed layers/geometry and preparation result. Open it in QGIS Desktop if available; capture a screenshot and verify source resolution. Exercise the actual collector on a connected physical device if available through device tools. Device absence is an acceptance gap, not proof of failure and not permission to claim physical verification. Execute the end-to-end HTTP story and QGIS readback when the surface is available; never substitute a mocked request for a live acceptance claim.

### Wave 4 — current docs and final strict review

Primary records the fresh scenarios, RED/GREEN output, actual tool invocations, artifacts and cleanup receipts in `docs/reviews/mob29-2026-10-15/`. Update `mobile/PLAN.md` and only the current roadmap/zone contracts whose descriptions changed. Run `pnpm plan:check` after plan edits. Keep required unverified device/hosted gates visible.

Send complete diff, goal, plan/notepad, tests and scenario artifacts to `codex-ultrawork-reviewer`. Fix each concern and rerun the affected/full required scenarios; request unconditional approval from that same reviewer. Final response leads with the Janet demo artifact and verified MOB-29 outcome, identifies any remaining physical/hosted gate, and gives one next action under two minutes. No commit is authorized.

## Test-first and manual scenario matrix

| Scenario | Automated obligation before behavior changes | Real-use observable |
| --- | --- | --- |
| Pinned point and Inventory; dynamic retained form | `mobile/src/sync/*.test.ts` serializer/receipt cases plus `storage/observation-store.test.ts`: nested answers, exact stored body, Inventory forbidden fields absent, changed package/form does not alter retry | Installed real package, actual saved queue and loopback PUT; API accepts point + Inventory, Inventory read has null event geometry |
| Lost receipt; 429/503; permanent 409/422 | `sync/coordinator.test.ts` and `storage/sync-store.test.ts`: byte-identical retry, preserved records/references and structured code, retry does not rewrite payload | Actual loopback duplicate PUT returns same receipt; changed UUID body returns conflict; inspect persisted state after restart |
| Wrong receipt identities and account switch | `sync/coordinator.test.ts` / `storage/sync-store.test.ts`: each receipt identity mismatch cannot acknowledge; switch during token/fetch rejects late write; practice never uploads | Actual provider/coordinator run with controlled delayed token/response and real SQLite; original record retained under original owner |
| QGIS upload and manager edit | Existing backend importer tests against the new archive plus package preparation; shared geometry cases remain green | Actual import returns one ground outline and supported layers; QGIS resolves all embedded sources; browser draws/edits/publishes zone if local full stack is available |
| Invitations | Existing identity/invitation tests remain green; inspect actual manager UI/routes | Demonstrate creation/preview/redemption only where verified; distinguish email delivery and never send a real invitation without explicit authorization |

Each scenario records actual invocation, one pass/fail observable, output artifact and process/file cleanup. Capture RED then GREEN in separate runs for a given behavior. Runtime acceptance is distinct from unit coverage and from production/device readiness.

## Known starting facts

- `isUploadableRecord()` currently returns `false` for every observation.
- `SyncProvider` currently only increments revision; no upload transport is connected.
- `receiptSchema` currently lacks `package_id`/`zone_id`; persistence acknowledges by observation ID without verifying every receipt identity.
- Save/commit currently store the UI/domain record, with no frozen wire body.
- Exact zone coverage, retained package/forms and observer screens are already implemented and should be reused.
