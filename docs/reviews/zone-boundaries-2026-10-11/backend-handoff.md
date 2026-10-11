# Backend/database review and frontend handoff — 2026-10-11

## Verdict and scope

**Backend/database local implementation: accepted. Web implementation: ready to start.
Unconditional web-and-mobile handoff or release readiness: not established.** No confirmed
backend correctness or security blocker was found in the reviewed source. Mobile data work
remains necessary; it is not included in the completed backend scope.

The reviewed baseline is `78eb825547e17d0d7c1320027865ad2c58d14725`, committed and pushed to
`origin/master`. DB-15/16 and BE-18 were already committed in `6da4359`; BE-19 in `92f8451`.
This review adds documentation and reproducible review tests, not API or database changes.
Task status remains solely in the owning PLAN files.

| Work | Handoff decision |
| --- | --- |
| CON-05, DB-15/16, BE-18/19/20 | Source and disposable local acceptance complete; publication remains disabled by default |
| WEB-30, WEB-31, WEB-36 | Unblocked starting tasks; Claude can implement now using the existing UI plan |
| Later web tasks | Follow the owning dependency graph; WEB-39 and WEB-42 require WEB-36 |
| MOB-28 | Still todo, owned by the mobile data implementer; blocks MOB-30/31/32 integration |
| MOB-29 | Still todo; requires MOB-28 and mobile UI tasks, with data/UI coordination |

Claude owns the web tasks and mobile UI tasks; **the backend being complete does not mean
all remaining work belongs exclusively to Claude**. The existing mobile catalog, retention,
session binding, recovery, upload serializer and receipt paths still need MOB-28/29 work.
`SiteVersions`, `Pinned` and `Recovered` are proposed interfaces, not delivered components.

## Review findings and dispositions

1. **Stale handoff baseline — corrected.** The earlier prompt described planning and missing
   backend APIs. The [implementation prompt](../../plan/zone-boundaries/claude-prompt.md)
   now identifies the pushed API baseline, starting tasks, actual routes and remaining ownership.
   Earlier UI-plan baseline statements must not override current contracts/source.
2. **Mobile dependency — remains open in MOB-28/29.** Preserve exact package/form recovery,
   reference-protected retention, immutable queued protocol/body and captured attribution.
   Do not substitute a new UI-only catalog for the data implementation.
3. **Session durability mismatch — explicit integration gate.** The data plan requires session
   context to survive process death (`mobile/ZONE-BOUNDARIES.md`); the UI proposal that only
   drafts persist cannot silently weaken that requirement. Resolve the durable pinned-session
   interface in MOB-28 before dependent UI integration. A change to visit/session semantics,
   including a new Continue/End flow, requires a product decision rather than an inferred policy.
4. **Browser acceptance environment — still required.** `database/zone-api-rehearsal.sh` is a
   disposable API/Postgres harness, not a browser/Auth stack. `scripts/e2e-local.sh` uses the
   persistent local Supabase setup and does not supply the proposed zone seed. Provide an
   explicitly disposable browser/Auth/API configuration and synthetic zone seed before real
   zone UI acceptance; do not implicitly enable publication in persistent or hosted environments.
5. **Release gate — unchanged.** Hosted rollout, real browser interaction, physical-device
   offline/process-death/upgrade recovery and QGIS acceptance remain QA-07 work. Synthetic
   signed HTTP does not establish those results.

### Web change-request dispositions

These dispositions distinguish implemented contracts from UI requests; they do not approve
new backend scope. Request IDs refer to the reviewed web UI plan.

| Requests | Disposition for implementation |
| --- | --- |
| W1, W2, W5 | If-Match CORS support, bounded draft body and BE-20 read/export models are implemented |
| W3, W6 | Runtime ETag and structured error fields exist; generated OpenAPI does not fully describe all headers/error variants. Read headers and narrow/validate error bodies in the adapter. Typed-schema polish is additive, not a new runtime prerequisite |
| W4 | Raw draft geometry is retained; the fresh signed PUT/GET/PUT regression confirms a closed Polygon with a rotated start and repeated vertex remains byte-structure equivalent |
| W7 | Canonical semantic change classification/hash is absent. Do not claim a semantic diff from raw JSON comparisons; omit that claim or propose an extension |
| W8, W10 | Missing provenance/display names and future version numbers must not be invented; use truthful generic copy |
| W9 | Preserve 200/201 publication responses and refetch current discovery. An idempotent replay returns its original package without reactivating it |
| W11, W12 | Existing history/detail/manifest and v2 current discovery support the baseline UI. Extra provenance and unavailable-reason enums are not delivered fields |
| W13 | Enumerate supported format-2 history and fetch exact package-scoped zones with bounded caching; a batched identities route is not required by the frozen contract |
| W14 | Publication requires the current base. Restore old geometry into a new draft based on current, rather than publishing an obsolete base |
| W15 | BE-20 pagination, summary, ZIP exports and metadata exist. Extra observer/day/form facets, latest_received_at, no-zone filter, standalone zones export and exact over-limit counts are not approved requirements. Use a safe fixed filename or same-origin proxy when Content-Disposition is not browser-exposed |
| W16, W17 | Contour, state styling, icons and UI product copy are frontend/design work |
| W18 | Handle structured unsupported_operation before general 5xx retry handling; disabled publication is not a transient outage |

### Mobile change-request dispositions

| Requests | Disposition for implementation |
| --- | --- |
| M1 | Existing package metadata/archive routes and format-2 manifest fields support exact retrieval. A proposed viewer-404 behavior conflicts with existing authorized read roles |
| M2 | Fetch forms by exact version_code and verify version_id. Authorized retired definitions remain readable for historical recovery; current mobile preparation rejects retired forms and must be corrected in MOB-28/29 without relaxing eligibility for new publication |
| M3, M6 | V2 current discovery and map_revision equal to package_version are already specified |
| M4 | MOB-29 needs the upload error/action matrix. Immutable failures require attention; do not mutate/recreate the same UUID or downgrade to v1. A new-record recreation flow needs an explicit product decision |
| M5 | Shared-edge, three-way-vertex and cross-language parity cases remain mobile geometry acceptance work; do not claim those client cases are already complete |
| M7 | Resolve the durability mismatch above. Required zones and delayed package adoption are already established; do not reopen those decisions without a proposed contract change |
| M8, M9 | Contour belongs to UI work. Inventory compatibility anchors remain local display data and are excluded from bound event coordinates |

## Evidence and review coverage

Separate fresh reviewers examined code quality, security, goal compliance and contextual
handoff consistency. Code-quality and security reviews found no confirmed blocker (medium
confidence, source review). Goal/context reviews rejected an unconditional handoff because of
the dependencies and documentation/environment gaps above. Those implementation gates remain
open even after correcting the prompt. No blanket five-reviewer PASS is claimed.

The QA reviewer stopped at a usage limit. The parent completed the two added regression
checks and records their actual results below; this is not a completed independent QA sign-off.

| Evidence | Actual result |
| --- | --- |
| Prior complete backend run on the reviewed source | 678 passed in 368.15 seconds; reused evidence, not rerun for this documentation change |
| Prior SQL acceptance | 425 assertions, 2,545 Node 24 coordinate comparisons and six publication races passed |
| Fresh selected backend regression run | 23 existing tests passed in a 25-case invocation; two newly authored tests initially failed because the test used an unclosed ring and the wrong CSV column name |
| Corrected added tests | 2 passed, 5 deprecation warnings in 4.49 seconds in a new disposable rehearsal |
| Saved evidence command verified | The exact repository-relative command below passed both cases in 4.19 seconds after formatting |
| New raw-geometry case | Signed manager PUT, GET and repeated PUT preserve the exact closed Polygon coordinates, repeated vertex and starting vertex |
| New historical case | Publish successor label, upload against old package, read v2 detail and export CSV/historical geometry: old package, label and geometry remain unchanged |

The fresh existing cases cover signed authoring/publication and stale-write races, duplicate
creation/upload replay, old package upload, 601-row complete CSV/GeoJSON reads, cross-tenant
and Training ownership, 10,000/10,001-row boundaries, source-size preflight, restricted query
plans, concurrent snapshot consistency, canonical form extensions, disconnect and timeout cleanup.
Full BE-20 bounds, timings and limitations are in [be20.md](be20.md); earlier bound-upload
acceptance is in [be19.md](be19.md).

The initial added tests were corrected without changing application code. A standalone rerun
first failed collection because pytest selected the external file's root and missed the backend
pythonpath; explicitly selecting `backend/pyproject.toml` fixed collection. No application defect
was hidden by those test corrections. Full ephemeral logs were saved as
`/tmp/handoff-qa-selected.log` and `/tmp/handoff-qa-corrected.log` during this review.

Reproduce the two durable review cases from the repository root:

```sh
sh database/zone-api-rehearsal.sh -c pyproject.toml -q \
  ../docs/reviews/zone-boundaries-2026-10-11/evidence/test_handoff_regressions.py
pnpm plan:check
```

The runner changes into backend before invoking pytest; the explicit config supplies its
source path. It starts only its own synthetic loopback Postgres container, applies migrations
there and stops that container on exit. No secret files, hosted services or persistent database
changes are necessary. Run database performance rehearsals sequentially.

One nonblocking maintainability observation remains: `services/zone_discovery.py` composes SQL
using string replacement. A future refactor can make that composition explicit; this review
found no behavioral defect requiring it. Export capacity is per process, not a global replica
budget. Neither point changes the current client contract.

## Immediate handoff

Give Claude the [implementation prompt](../../plan/zone-boundaries/claude-prompt.md) and begin
WEB-30. Complete MOB-28 with the data owner before wiring mobile UI. Keep publication off until
the remaining acceptance and rollout gates are explicitly satisfied.
