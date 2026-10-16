# MOB-29 local implementation and acceptance — October 15, 2026

The foreground bound uploader is implemented. **MOB-29 remains doing until its physical-device acceptance passes.** This report covers current source, real SQLite, an isolated FastAPI/PostGIS runtime and QGIS Desktop. It does not establish hosted deployment, physical collector behavior, closed-app background synchronization or email delivery.

## What now works

Bound saves persist an immutable wire body with the existing observation/package-reference transaction. Point observations carry nested answers and exact package/zone/form identities; whole-zone Inventory omits event coordinates and `first_round`. Dynamic retained published form codes work without depending on the bundled form registry. Bundled practice stays local-only.

The foreground provider wakes on save, network recovery, resume and explicit retry. It uses the existing account-scoped outbox and cancels/fences account changes. The upload and persistence boundaries validate observation, user, destination project, package and zone receipts. A lost response retries the original UUID/body. Authentication failures pause for a changed session; transient failures back off; permanent rejections retain their original body, package reference, generic error code and safe issue codes.

SQLite remains schema version 6. Previously held current-schema bound observations activate using their own saved context; this does not relabel owners, convert practice, reset storage or consult today's selected map.

## Evidence

| Scenario | Invocation and observable | Artifact |
| --- | --- | --- |
| Test-first mobile behavior | Node 24 Vitest runs against new transport/storage/coordinator/provider cases. Initial RED assertions include missing immutable body/receipt handling and provider upload count 0; GREEN runs cover stored-body replay, account fences, bad receipts, errors and foreground behavior. | [RED](red-mobile.txt), [focused GREEN](green-mobile.txt), [full suite](green-mobile-full.txt) |
| Actual install → offline save → v2 publication → SQLite restart → upload/replay | `PATH=/Users/praty/.nvm/versions/node/v24.18.0/bin:$PATH sh database/zone-api-rehearsal.sh -c pyproject.toml /Users/praty/Desktop/StudentJob.nosync/field-ops/database/tests/test_mobile_bound_upload_api.py -q -s`. PASS: actual `PackageOperations` installs the server archive and both forms; actual stores save a point and Inventory; a manager publishes v2; reopening the same SQLite database and losing the first accepted response still produces identical replay bodies/receipts and original v1 historical readback. | [Live API result](live-api.txt), [Python driver](../../../database/tests/test_mobile_bound_upload_api.py), [mobile driver](../../../mobile/src/sync/bound-upload-api.acceptance.test.ts) |
| API export | The same isolated run independently fetches both historical records and exports GeoJSON. PASS: both retain the original package/zone; Inventory event geometry is null. Every observation contains synthetic notes; these are test fixtures, not research observations. | [Observations](live-export/observations.geojson), [recorded zones](live-export/historical-zones.geojson), [metadata](live-export/metadata.json) |
| Actual QGIS readback | QGIS Desktop 4.2.2 Python Console loads the exported GeoJSON through `iface.addVectorLayer(..., 'ogr')`. PASS: observations valid/count 2, historical zones valid/count 1, both records map version 1 with matching package/zone IDs; Inventory geometry null and point geometry present. | [Native readback result](qgis-readback.json) |
| Synthetic demo upload and desktop map | Actual project importer/source preparation passes; 5 focused tests and 20 adjacent importer tests pass. Native QGIS reopens the delivered QGS in EPSG:4326 with ground 6, zones 2, paths 1, trees 4. Canvas preview inspected. | [Demo evidence](../../../qgis/demo-playground-2026-10-15/verification/README.md), [preview](../../../qgis/demo-playground-2026-10-15/preview.png) |

The default full suite skips the two acceptance tests that require explicitly supplied loopback fixtures. The bound-upload acceptance test was separately run with its isolated fixture above. The package-install acceptance test's earlier results remain in MOB-28's existing evidence.

## Checks and review

Node 24 final mobile suite: **701 passed, 2 fixture-gated tests skipped, 85 files**. `pnpm mobile:check` exits 0: TypeScript clean; full Biome has 23 informational diagnostics and no errors/warnings ([check output](mobile-check.txt)). An existing installed-list timing test failed once during a full run, then passed both its isolated rerun and the final full run; that untouched module was not changed.

`EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 node node_modules/expo/bin/cli export --platform all --output-dir /private/tmp/mob29-expo-export` exports both iOS and Android bundles ([export output](expo-export.txt)). This proves bundling, not device execution. The new Python driver passes BasedPyright with no errors/warnings. Ruff is run with the backend configuration plus test-harness exceptions matching existing test assertions/status literals and trusted subprocess/output; no production lint rule is changed. [Independent strict review](review.md) unconditionally approves source implementation and local delivery; physical acceptance remains open.

## Physical and hosted acceptance still open

The Android collector was connected after the local acceptance run. The [hosted/device rehearsal](device-hosted.md) records the physical Galaxy Tab S5e, the switch from Preview to Device data and the isolated synthetic project/forms prepared through the hosted manager. Full collection/publication/restart/reconnect acceptance is still pending. No device has been uninstalled, reset or cleared.

On the actual collector, record the installed build/runtime and repeat: install a verified map → save while offline → publish a successor → restart/resume the same saved work → reconnect with the app open → verify its original package/zone receipt on the server and in QGIS. The broader phone/tablet and accessibility matrix remains in [the UI specification](../../../mobile/ZONE-BOUNDARIES-UI.md#9-verification). Source/unit/loopback evidence does not substitute for this gate.

No hosted migration, deployment or invitation send was performed. The [Janet checklist](../../Janet-Demo-2026-10-15.md) distinguishes a queued invitation, provider acceptance and inbox receipt.

## Cleanup

The live API fixture stops Uvicorn, closes SQLite and removes its temporary files. The rehearsal script removes its own isolated PostgreSQL container; a final `docker ps` confirmed only the pre-existing Supabase stack remains. Disposable tokens exist only in the child process fixture environment and are not saved in evidence. Final exact-source Expo export exited 0 for both platforms; its task-owned `/private/tmp/mob29-expo-export` directory was removed. The task-owned native normalization QGS/attachments scratch files were also removed. QGIS readback layers were removed by reloading the delivered demo project. The demo QGS/archives, preview and synthetic exported fixtures are deliberate deliverables. Existing uncommitted documentation edits are preserved; no Git commit, stage, branch or push was performed.
