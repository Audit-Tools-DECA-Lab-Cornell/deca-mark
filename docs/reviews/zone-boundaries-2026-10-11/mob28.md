# MOB-28 local foundation review

> Historical evidence for the date/revision below. It is not a current task board or hosted-health check. See [current position and next work](../../plan/current-state.md) and the owning plans for later implementation and remaining acceptance.

Baseline: `33faa58` plus the uncommitted mobile/storage/package changes. Acceptance data is synthetic. No persistent or hosted database was reset, no device/release acceptance is claimed, and no commit/push occurred.

## Delivery state

**Local implementation reviewed; task remains `doing`.** The owner replaced the dual-path contract with one API and zone-aware archive format. The mobile foundation now implements that rewrite. Actual current-package installation/restart acceptance cannot pass until CON-06, DB-19 and BE-22 supply the single-contract backend and regenerated API types. The task status lives only in [mobile/PLAN.md](../../../mobile/PLAN.md).

## Concrete behavior

- Schema 5 creates the current collector schema directly. A mismatch resets every user table/view transactionally, including quoted names, FTS shadow tables and populated foreign-key structures. A failed reset restores the old data/version and foreign-key setting. Auth files are outside this collection database.
- A durable marker requires purging obsolete hosted package/cache files before the collector mounts. Interrupted cleanup retries after reopening SQLite; completed cleanup is not repeated on same-schema startup. Valid current drafts, records, sync state, selections and references survive restart.
- Only the new zone-aware `format: 1` manifest and `/v1` discovery are supported. Old manifest parsing, discovery fallback/capability cache, SQL protocol/canonicalization columns, numeric-round conversion and the flat practice uploader are removed. Bundled preview stays local; bound collection and transport remain explicitly gated for MOB-33/MOB-29.
- Installations validate requested UUIDs, archive size/digest, exact bound play/inventory forms, full zone geometry, bounding boxes, counts, anchors, geometry digests and complexity ceilings. Immutable file publication precedes a fenced SQLite catalog/grant/selection transaction. Failed, corrupt, cancelled or quota-limited installation cannot displace the last verified selection.
- Package references include records in every local state, drafts, stored sessions and a foreground lease. Removal rechecks them transactionally. Account generation fencing protects A–B–A transitions, carried answers and retained callbacks. Bound records/drafts require the site UUID to match their package. Recovery requires the recorded package/version/zone/form and never substitutes another map or first zone.

Ordinary removal revokes the account grant while retaining shared immutable bytes conservatively. There is no ordinary file garbage-collection policy yet. Schema reset clears those files.

## Checks actually run

| Check | Result |
| --- | --- |
| `pnpm mobile:check` | PASS: TypeScript and Biome; seven information-only literal-key suggestions |
| `pnpm mobile:test` final frozen source | PASS: 506 tests, 61 files; one actual API acceptance test gated |
| Focused storage review | PASS: 55 tests across 14 files |
| Independent specification review then quality review | PASS for local foundation, no unresolved local P1/P2; independently ran 505 tests before the final archive-length regression was added, plus typecheck/lint/diff checks |
| `pnpm plan:check` | PASS: 157 tasks across 13 owning files |
| QGIS converter regressions | PASS: six tests; Ruff/format and shell syntax pass |
| `git diff --check` | PASS |
| Actual single-contract API installation driver | BLOCKED: executed against disposable loopback API, OpenAPI still exposes `/v2`; fails explicitly with the DB-19/BE-22 prerequisite before installation |

The single-contract gate is reproduced with `sh database/mobile-package-rehearsal.sh -q -s` under Node 24/pnpm. The driver uses `MOB28_SINGLE_PATH_FIXTURE`; the old fixture cannot silently skip the child test and produce a false pass. Its backend setup must be aligned with the BE-22/DB-19 fixtures when those land. No archive translation is permitted to make the check pass.

The earlier actual BE-18 format-2 package pipeline passed installation and real SQLite/filesystem restart. That result is historical evidence only, not acceptance of the rewritten single-contract source. GIS-09's prior-baseline evidence is in [gis09.md](gis09.md); it likewise requires repeat readback after the new backend baseline.

## Review findings closed

The original shell binding loss, cross-account carried answers and retained callback races are fixed. Final review also found and closed bound site UUID inconsistency and reset failures caused by FTS shadow-table deletion and populated foreign-key tables. Each has a concrete regression check. Generated API declarations remain owned by BE-22's coordinator regeneration; they are not edited by hand here.

## Compatibility adjudication and handoff

Verdict: **REMOVE**. Evidence is the owner's explicit pre-launch policy: no real users and incompatible experimental data may be reset across components. Current-schema offline correctness remains required; no old-client/old-schema bridge is justified.

Use [mobile/PACKAGE-LIFECYCLE.md](../../../mobile/PACKAGE-LIFECYCLE.md). Complete CON-06, then DB-19, then BE-22 and stable generated types; rerun the actual package gate before marking MOB-28 done. MOB-33 provides the agreed one-visit session/read models, then MOB-30–32 and MOB-29 complete the collector. Physical-device, browser and QGIS integrated acceptance remain QA-07.
