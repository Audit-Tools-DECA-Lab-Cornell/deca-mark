# Zone contracts and authored cases

The [version-1 contract](../../docs/plan/zone-boundaries/contract.md) is authoritative. These fixtures are synthetic test data, never study observations. Expectations are authored independently of production algorithms; do not regenerate expected results from a geometry or publication engine.

| Artifact | Input and expected result | Owner consuming it |
| --- | --- | --- |
| `geometry.cases.json` | Named GeoJSON; draft structural validity; publish issues; all covering zones for a point; selected-zone acceptance; overlap/containment/normalization and inclusive limits | Backend input models now; DB-16 topology, BE-18 publication and MOB-29 geometry adapters later |
| `publication.cases.json` | Initial state (`given`) and ordered operations (`steps`) with expected status, conflict code and retained state | DB-16 and BE-18 restricted-role/concurrent HTTP tests |
| `upload.cases.json` | V1/v2 `envelopes`, frozen v1 canonical strings/hashes, v2 fingerprint vectors and stateful `scenarios` | Input schema/hash regressions now; BE-19/MOB-29 real upload/receipt tests later |

All files declare `contract_version: 1`, `synthetic: true` and unique case IDs within each section. GeoJSON numbers are literal full-precision fixture coordinates. `coverage_cases.covering` is a candidate set: ordering is not an assignment decision. Geometry names are aliases, not zone codes or UUIDs. Adapters assign stable synthetic UUIDs within their local fixture scope. `relation_cases.interior_overlap` means a positive-area intersection, including containment; `containment_cases.covered` means the actual site shape covers the zone, not its bbox. `publish_issue: null` means topology/extent valid in isolation, not that an entire package is publishable without ground/form checks.

Publication aliases `d1`/`d2`, `create-1`, `pub-1`/`pub-2` resolve to distinct synthetic UUIDs in the harness. Substitute the same aliases in ETags as in path/body IDs. Missing steps fields mean omitted preconditions only in the explicitly named missing-precondition cases; otherwise adapters supply the acknowledged revision/request/current identity from the fixture. Run racing steps concurrently where the case names two managers; assert one winner, not which manager wins. Scenario fields are fixture setup instructions, not new wire fields. A stored result/current pointer assertion is a database/runtime assertion, never evidence from reading this JSON.

Envelope `valid` covers schema structure only. The fixture forms/answers do not prove eligibility, package membership, point coverage or successful persistence; actual service tests must supply the authorized site/package/snapshot/form and assert those separately. `canonical`/`sha256` on v1 cases are golden shipped serializer outputs, including omitted versus explicit-null context. `fingerprints` freeze v2 normalized canonical documents and SHA-256 bytes; hashing the authored canonical string only checks fixture integrity. It does not verify a future JCS implementation. V2 vectors include numeric/Unicode ordering cases to expose Python-JSON versus ECMAScript differences.

Current local checks (no API process, database, device or secrets):

```sh
cd backend
.venv/bin/python -m pytest tests/test_zone_upload_contract.py tests/test_zone_geometry_contract.py tests/test_zone_draft_contract.py tests/test_zone_case_integrity.py -q
```

The backend models now describe the locally implemented BE-18 authoring/discovery routes
and BE-19 bound upload route; generated `openapi.json` and client declarations expose them.
`test_zone_upload_fingerprint.py` runs the authored v2 canonical-byte vectors through the
actual serializer. Stateful local API and SQL acceptance uses the disposable rehearsal
commands documented in the backend README. Keep format-1 payloads, hashes, archives and
local rows unchanged. Never label unexecuted filesystem or device scenarios as passing
based on these contract tests.
