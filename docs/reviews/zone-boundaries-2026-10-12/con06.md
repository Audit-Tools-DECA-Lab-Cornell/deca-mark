# CON-06 single-path contract acceptance

> Historical evidence for the date/revision below. It is not a current task board or hosted-health check. See [current position and next work](../../plan/current-state.md) and the owning plans for later implementation and remaining acceptance.

Date: 2026-10-12. Scope: authored shared artifacts, specification handoffs and case-integrity adapters. Task status lives in `docs/plan/contracts.md`.

## Delivery

The requested initial commit/push completed before this work: `a86a1ee` contains the offline package lifecycle, GIS projections and previous plan changes on `origin/master`. Concurrent repository activity later committed the tracked CON-06 edits as `c9f63ef`; that commit omitted the new test-only helper. The final helper, review corrections and task status are part of this work. Unrelated editor configuration, ignore-file and QGIS acceptance-file edits are excluded.

## Contract and cases

One API prefix `/v1`, one zone-aware archive `format: 1`, one nested-answer observation envelope and one `observation-jcs-1` fingerprint. Site API identifiers are UUIDs. Experimental incompatible data resets; current-schema offline work, exact package/forms and historical attribution remain immutable.

Shared cases remove the separate envelopes, serializer goldens, protocol fields and conversion scenarios. Example packages begin at map version 1. Added cases cover complete first-upload identity mapping with explicit null current precondition, rejection without partial publication, a replay that returns the original result plus the live pointer and `replayed: true`, and all five validation classifications. Canonical byte strings were edited as authored expectations, never generated through the production serializer; their digests and independent RFC 8785 serialization agree.

Backend, database, GIS, verification, web and mobile handoffs now agree. UI examples and the copyable frontend prompt require the new generated API before integration. The historical assessment is labelled and its recommendations no longer request a second contract.

## Executed checks

- Focused pytest across `test_zone_case_integrity.py`, `test_zone_geometry_contract.py`, `test_zone_upload_contract.py` and `test_zone_upload_fingerprint.py`: **91 passed, 2 skipped**. Skips explicitly name BE-22's production upload model and fingerprint acceptance; test-only envelope models establish fixture consistency, not production compliance.
- Ruff check and format check on all five changed test/helper modules: passed. Focused BasedPyright: zero errors, warnings or notes. Programming no-excuse audit: passed.
- Removed-concept scan across `contracts/zones`, `docs/plan/zone-boundaries` and component zone specifications/UI plans: only the canonical contract's removal list contains the named removed concepts.
- Independent specification/quality review: resolved mapping-error status (422 versus missing-current 428), remaining envelope-version wording, parking policy, and authoritative validation classification against current. No outstanding P1/P2 in this scope.

A broad `pytest -m 'not integration'` attempt selected unmarked database-dependent tests and failed at database startup (424 tests passed, 56 setup errors). Excluding explicit `api_client` modules still selected seven indirect database-dependent cases (405 tests passed, seven setup errors). These runs do not establish full API acceptance. The focused contract suite does not need the database and passed independently. No persistent or hosted database was reset, and no secret files were opened for diagnostics.

## Remaining gates

DB-19 replaces the experimental migration chain with one current baseline. BE-22 then replaces the production API/model/hash behavior, deletes the second API surface, restores the two explicit runtime tests and regenerates OpenAPI/client declarations twice. Current backend routes and generated declarations are intentionally not claimed compliant by CON-06. Real SQL/API, browser/device and QGIS acceptance remain distinct required gates. MOB-28's actual current-package API check remains pending those dependencies.
