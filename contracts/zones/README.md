# Zone contracts and authored cases

The [single-path contract](../../docs/plan/zone-boundaries/contract.md) is authoritative: one `/v1` API, one zone-aware `format: 1` archive and one `observation-jcs-1` fingerprint. These fixtures are synthetic test data, never study observations. Expectations are authored independently of production algorithms; do not regenerate them from a geometry, publication or upload engine.

| Artifact | Inputs and expected results | Acceptance owner |
| --- | --- | --- |
| `geometry.cases.json` | Named GeoJSON, structural validity, topology, point coverage, containment, normalization and inclusive limits | Backend geometry tests, database topology tests and MOB-29 geometry adapters |
| `publication.cases.json` | Initial state and ordered operations; explicit first-upload identity mapping; concurrency, replay and validation change classifications | DB-19 and BE-22 real SQL/API acceptance |
| `upload.cases.json` | One nested-answer envelope, canonical fingerprint vectors, receipt and historical-attribution scenarios | CON-06 artifact integrity; BE-22 production upload; MOB-29 serializer and receipt acceptance |

Every file declares `synthetic: true` and unique case IDs within each section. Geometry aliases refer to the literal full-precision coordinates in `geometry.cases.json`, not zone codes or UUIDs. `coverage_cases.covering` is a candidate set, never an assignment decision. `relation_cases.interior_overlap` means positive-area intersection, including containment; `containment_cases.covered` means actual site-shape coverage, never bbox coverage. `publish_issue: null` means validity in isolation, not readiness of an entire package.

Publication aliases such as `d1`, `create-1` and `pub-1` resolve to distinct synthetic UUIDs in the harness. Substitute the same draft alias in ETags and path/body IDs. Except in explicitly named missing-precondition cases, adapters supply the acknowledged revision, request ID and current identity. Execute competing managers concurrently and assert one winner. Package UUIDs ending in 001, 002 and 003 identify example map versions 1, 2 and 3; draft revisions are independent.

First-upload cases start with no current package and explicitly map every zones-layer source feature to a new stable UUID/code. `source_zone_ids` supplies the source features; adapters provide valid ground, forms and named zone geometries. An incomplete mapping creates no package. Publication replay returns its original package, `replayed: true` and the site's current package ID, without activating the returned historical result. Validation cases compare one identity's current and draft geometry/label; removed summaries describe its retained current snapshot. Setup and expected-state instructions are harness data, not additional wire fields.

Envelope `valid` means request structure only. Passing it does not establish authority, package/form membership, point coverage or persistence. `fingerprints` freeze independently authored RFC 8785 byte strings and their SHA-256 values, including number normalization and UTF-16 key ordering. Hashing a fixture string checks its integrity; production fingerprint acceptance must also feed the input through the actual serializer.

Run the artifact checks without an API process, database, device or secrets:

```sh
cd backend
.venv/bin/python -m pytest tests/test_zone_case_integrity.py tests/test_zone_geometry_contract.py tests/test_zone_upload_contract.py tests/test_zone_upload_fingerprint.py -q
```

CON-06 updates the shared contract and artifact adapters. DB-19 supplies the current database baseline; BE-22 supplies production models, routes, fingerprints and regenerated OpenAPI/client declarations. Until those tasks pass, test-only contract models and independent RFC 8785 checks establish fixture consistency only. Explicitly skipped production obligations remain pending and must be replaced by real implementation checks in BE-22. Stateful publication, uploads, filesystem retention, browser, device and QGIS scenarios require their own runtime evidence.
