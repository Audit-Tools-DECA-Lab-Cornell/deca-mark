# Final audit cleanup — local remediation, October 17, 2026

> **Later source reconciliation:** The supplied upstream QGIS repair is commit
> `49caa05f2c00a6511da482319505bf002935614d`, a direct child of the original HEAD.
> Its production converter/consumers and historical evidence are now preserved in this
> worktree. See [the reconciliation report](upstream-qgis-reconciliation.md) for the
> final source, fresh verification and cleanup-only delta relative to that commit.
> The QGIS implementation, counts and provenance below record the earlier local snapshot.

The justified cleanup is implemented and verified locally. The separately requested
[QGIS converter repair](../qgis-repair-2026-10-17/implementation.md) is also implemented.
**The entire audit is not closed.** Account-deletion recovery was not implemented;
it and consolidated rollout verification still require explicit assessment. Existing
targets with experimental stored form definitions require the transition below.

## Baseline and preservation

HEAD before and after this work is `9928f536f12bee59dd245c75ee53779b0f5683a4`.
The initial worktree was clean; there was no uncommitted work to recover or discard.
No branch switch, commit, push or deployment occurred. The user clarified during this
task that no earlier QGIS repair existed, and explicitly authorized its focused repair.
The October 16 reports remain unchanged as historical evidence.

Read before editing: root AGENTS.md; the pre-launch policy in docs/plan/README.md;
backend, database, contracts/zone-contract and QGIS documentation; the engineering audit,
authorization implementation/rollout, form-revision/post-merge, and canonical-validation
reports. Every named candidate was checked against current files and repository callers.
The named legacy/archive/query candidates were still present. The reserved-question-ID
restriction was already removed at HEAD and was preserved without another rewrite.

The authorization and form-revision migrations, canonical validation/reference checks,
client definitions/editor rules, upload schema, fingerprint implementation, golden upload
cases, generated OpenAPI and client lockfiles remain byte-identical to HEAD; see
[preserved.sha256](preserved.sha256). The baseline migration differs only in its fresh
synthetic shell definition INSERT. No security policy, function, grant or trigger changed. The [function preservation check](preserved-functions.txt) also confirms 12 existing revision-lifecycle, canonical validation and archive safety function bodies are unchanged.

## Deleted paths and supported consumers

| Deletion | Current-source justification and replacement |
| --- | --- |
| domain/legacy_forms.py; stored-format discriminator/union; legacy export dispatch | The only repository initializer using the experimental `fields` form was the synthetic shell definition. Tenant fixtures copied it. That initializer and small synthetic export snapshots are now canonical. Current authored/lifecycle definitions already use `questions`. Unknown externally stored definitions are a rollout prerequisite, not assumed absent. AnswerError remains a ValueError in domain/forms.py. |
| Practice-form “cannot copy” restriction | Canonical synthetic shell definitions can use the existing create-draft/parser/revision/publication lifecycle. A signed lifecycle test exercises both the original and copied shell version. |
| services.zone_archives.extract; ExtractJob; Bootstrap; worker extraction branch | Only tests called the extract service. Real publication still calls extract_base_archive through PublishJob. Real corruption/deadline tests now use supported publication. |
| repositories.zones.available; queries.zones.CAPABILITY and GET_FORMS | Searches found no supported callers. The SQL capability function is retained because the real site query still calls it. |
| Authored upload/receipt validators in tests/zone_case_models.py | Authored payload cases now exercise BoundObservationUpload and BoundUploadReceipt directly. Remaining case models only load fixture data; fingerprint payloads also use the production model. |
| Fixture-only status/replay/change assertions | Retained small unique-ID and geometry-reference checks. First-publication behavior runs in zone-first-upload.sql and API import tests; prior-result replay/current-pointer behavior runs in test_zone_api_publication.py; all five validation-change classifications run in zone-validation-changes.sql and API draft tests. |

There is no replacement compatibility framework. No named deletion candidate required
retention after the demonstrated consumers were converted. Deliberately retained supported
operations include extract_base_archive, ImportJob/PublishJob, site capability evaluation,
Training, immutable historical package/form/zone bindings, canonical collision/reference
checks, authority rechecks and retry receipts. Account-deletion recovery remains outside
this implementation.

## Guarantees and replacement regressions

- The fresh server shell retains exactly `people` and `notes`: required integer count
  0–999 and optional text up to 1,000 characters, with the same answer IDs, labels and
  export names. It does not acquire the collector practice file’s observer question.
  The collector practice file and Training’s canonical Janet definition are unchanged.
- The replacement signed lifecycle test copies/publishes shell-v2, packages either
  shell-v1 or shell-v2, rejects missing/invalid/out-of-range answers, accepts the original
  boundary values, replays the exact receipt, refuses a changed retry, and checks readback,
  CSV, GeoJSON, frozen forms and recorded package/zone IDs. Existing suites cover late
  uploads with retired forms/superseded packages, Inventory, Training and creator isolation.
- Canonical answer rules remain the existing rules: optional blank text is pruned;
  integer-valued JSON numbers use current canonical semantics. Requiredness, accepted
  meaningful answers, bounds and exported answer columns are preserved. Invalid-answer
  errors now use canonical messages, e.g. `people: range`, through the same shared error path.
- Golden upload JSON/canonical bytes/SHA-256 values were not regenerated or edited.
  Production fingerprint/normalization checks compare to the independent goldens;
  identity/content mutation cases now also call the production fingerprint function.
- Publication corruption and actual subprocess deadline tests assert safe failures and
  temporary-directory cleanup. Successful import-to-publication checks retain ground,
  path and tree bytes. Worker environment isolation, process cancellation, capacity,
  checksum validation and Linux CPU/memory/file-size limits remain intact.
- Database tests now carry integration markers. Pure signed input-validation cases were
  moved to validation_client without database settings or startup. api_client refuses
  unmarked use before loading settings; no integration scenario was skipped to pass.

## Verification actually executed

| Check | Result |
| --- | --- |
| Full disposable backend, including prior authorization/revision/validation/race regressions | [817 passed](backend-full.txt), 112 warnings, 615.18 seconds. The specially named GIS scenario is separate below. |
| Ordinary documented database-free selection | [510 passed, 307 deselected](unit.txt), 70.08 seconds. |
| Final database-free selection with database variables removed and audit guards | [510 passed, 307 deselected](unit-guarded.txt), 65.84 seconds; no private-config reads, real TCP connections or Docker access were attempted. |
| Fresh baseline/migrations/seeds, full SQL/Auth-hook suite and local execution of hosted assertions | [Passed](sql.txt); 2,545 numbers and geometry JCS digest match Node 24; all seven publication/CAS/retry/revocation/forgetting concurrency scenarios pass. No hosted SQL was executed. |
| Retained signed GIS scenario plus actual production converter | [1 passed](../qgis-repair-2026-10-17/gis-api.txt), 11.79 seconds, independently reported. |
| Converter unit safety regressions | [8 passed](../qgis-repair-2026-10-17/qgis-unit.txt), including multipart/attribution/count/ZIP and point/Inventory failures. |
| Real mobile HTTP/SQLite outbox restart/publication/replay/Inventory/export acceptance | [1 passed](mobile-api.txt), 5.34 seconds; its TypeScript acceptance also passed. |
| Full mobile suite | [834 passed, 5 existing optional acceptance skips](mobile-tests.txt). No new skip was introduced. |
| Full web unit suite | [393 passed](web-tests.txt). |
| Backend/QGIS Ruff and Python typing | [Ruff passed](ruff.txt); [0 type errors/warnings/notes](backend-types.txt). |
| Client type/lint checks, form-source parity and plan checks | [Web passed](web-check.txt); [mobile passed](mobile-check.txt) with 23 existing informational Biome diagnostics; [parity passed](forms-parity.txt); [plan check passed](plan-check.txt). |
| Changed Python formatting and whitespace | [40 files pass](format-changed.txt); git diff --check passes. The broader optional formatting sweep reports [17 unchanged pre-existing differences](format-baseline.txt), left outside scope. |
| Generated contract/golden drift | OpenAPI deterministic export tests pass; generated contract, authored form/zone JSON and client lockfiles have no diff. |

Node was v24.19.0, pnpm 10.17.1, repository uv/Python 3.13.5 tooling. Missing locked web
react-test-renderer was installed with the frozen lockfile and lifecycle scripts disabled;
the final web suite passes. Initial root-directory collection and restricted TestClient
attempts were not counted as passes; final commands ran from backend with normal local
thread/socket support. Strict typing findings in new test wiring were corrected.

All database runs used fresh task-owned containers with temporary storage and cleanup traps,
built from postgis/postgis:17-3.5 at the digest in baseline.json plus postgresql-17-cron,
using the existing test Dockerfile and public CA trust. Docker reported no remaining
containers after completion. This is **smaller alternate-image disposable acceptance**,
not pinned-Supabase/full-Auth/Storage, hosted-provider, installed-QGIS/Desktop or physical
device verification. No existing database or volume was reset or removed.

Reproducible commands after inspecting the scripts (select the available alternate image):

```sh
export DECAMARK_REHEARSAL_IMAGE=decamark-cleanup-tests:local
export EMAIL_ENABLED=false
sh database/zone-api-rehearsal.sh -q
sh database/baseline-rehearsal.sh
sh database/gis09-api-rehearsal.sh -q
sh database/zone-api-rehearsal.sh -c pyproject.toml \
  "$PWD/database/tests/test_mobile_bound_upload_api.py" -q -s
(cd backend && uv run --frozen --no-sync --offline python -m pytest -m 'not integration' -q)
pnpm mobile:test
pnpm --dir web test:unit
pnpm mobile:check
pnpm web:check
pnpm forms:parity
pnpm plan:check
```

The [verification-only audit hook](no_database.py.txt) used in the final pure run was
executed from ignored work/final-cleanup/no_database.py; it denies private repository config reads, TCP
connects and Docker subprocesses without replacing application behavior. The ordinary
selection was also run independently without that hook.

## Existing-record transition and rollout prerequisite

The removed experimental format is a definition such as
`{"fields":[{"code":"people","type":"integer","minimum":0,"maximum":999,"required":true},
{"code":"notes","type":"text","maxLength":1000}],"status":"practice-only"}`,
without canonical `questions` and metadata. The prior baseline initialized this at
practice project `10000000-0000-4000-8000-000000000002`, form version
`10000000-0000-4000-8000-000000000004`, code shell-v1. Other external `fields` definitions,
including legacy boolean/decimal/choice variants, must not be assumed equivalent.

This cleanup changes fresh initialization only. It does not update existing published
forms, observations, package bindings or migration ledgers. **Do not reapply the baseline
to an existing target.** A previously applied baseline does not gain this initializer
change through migration-up. Publishing a canonical successor alone leaves historical
packages and observations bound to the original experimental definition.

Before rollout, an operator must explicitly select and assess each target. A read-only
inventory query, not executed on any existing/hosted database in this task, is:

```sql
SELECT v.project_id, v.id, v.code, v.state,
  (SELECT count(*) FROM fieldmaps.observations o
   WHERE o.form_version_id = v.id) AS observations,
  (SELECT count(*) FROM fieldmaps.site_packages p
   WHERE p.form_version_id = v.id OR p.inventory_form_version_id = v.id) AS packages,
  (SELECT count(*) FROM fieldmaps.zone_drafts d
   JOIN fieldmaps.site_packages b ON b.id = d.base_package_id
   WHERE b.form_version_id = v.id OR d.inventory_form_version_id = v.id) AS drafts
FROM fieldmaps.form_versions v
WHERE NOT (v.definition ? 'questions')
ORDER BY v.project_id, v.code;
```

The [read-only preflight SQL](transition-preflight.sql) was validated against the current
disposable schema, returning no noncanonical definitions; it was not run against an
existing target. The [final focused run](final-focused.txt) passed all 15 preflight,
publication-process and fingerprint cases.

A nonempty inventory is a **release blocker** until an explicitly reviewed preservation
and transition decision accounts for all affected frozen definitions, package/offline
references and read/export access. This runtime no longer validates package-bound uploads or parses typed exports for those
definitions. Raw stored JSON may still be readable on some definition/detail endpoints;
that does not preserve their complete collection/read/export workflow. No in-place immutable rewrite, reset, new adapter or concealed migration
is supplied here. Keep the prior runtime/read/export capability available for affected
records until that separate transition is resolved; this is a prerequisite, not an
implemented recovery system. Existing current-format records retain their historical
bindings and retry semantics.

Coordinate the existing authorization/revision migrations and matching application
releases wherever needed; this work did not assess or change any hosted installation.
Consolidated rollout verification and account-deletion recovery remain open.

## Review delta

[Measured code delta](code-delta.json), excluding documentation/evidence and ignored work:
production Python **+85 / −301 = −216 lines** across 15 files; Python tests
**+524 / −410 = +114 lines** across 26 files, including the new 59-line pure query-input
module. The synthetic initializer is one replaced SQL line; pytest marker documentation
is one replaced TOML line. The added tests cover the newly authorized GIS repair and
production workflows; line reduction is not the acceptance criterion.

No secrets or secret files were read; no real application providers were contacted.
Only public dependency/image registries were used for tooling. No existing databases
were reset, hosted services changed, commits made, pushes performed or deployments run.
