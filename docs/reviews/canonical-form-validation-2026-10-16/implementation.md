# Canonical form validation remediation — 2026-10-16

## Delivery state

The canonical form-validation remediation is complete locally: parser, collector and revision-protected API lifecycle regressions pass against the preserved form-revision remediation. Final verification is recorded in the October 17 section below. **The QGIS repair was never implemented**: the user relayed the other agent's explicit correction of its earlier claim. The incomplete GIS scenario and converter defect remain separate from this bounded form-validation change; no GIS replacement or duplicate-test deletion was performed.

Implementation baseline HEAD: `bb38f134e461c3a5e5884c7adf23b5a228c8481a`.
`git status --short` was empty before edits; there were no uncommitted fixes to preserve in this checkout. The authorization remediation is present in that baseline and its signed authorization regressions pass in the disposable runs below. Implementation and verification left HEAD, the branch and index unchanged for review. The subsequent authorized delivery preparation is recorded below.

This is new remediation evidence. The dated audit at `docs/reviews/engineering-audit-2026-10-16/audit.md` remains unchanged.

### Remote recheck — 2026-10-17

At the user's request, `git fetch --no-tags origin master` refreshed `origin/master` from `bb38f13` to `7f12470c6dfc17aa2542a1b7402f33287cff42a7`. The form-revision remediation **is present on the refreshed remote branch**, introduced by `221e375` and followed by integration and rollout evidence. It supplies strong ETags, `If-Match` preconditions, revision checks and the corresponding migration/client/test changes. The earlier missing-revision finding describes the local checkout and its previously cached remote reference, not this newly fetched commit.

The QGIS remediation is **absent from refreshed `origin/master`**. There is no difference from local HEAD in `qgis/`, `backend/tests/gis_current_acceptance.py`, `backend/tests/zone_api_fixtures.py` or `database/tests/test_gis09_api.py`. The converter still requires removed basis fields, and the Inventory assertion/fixture are unchanged. The remote form-revision report independently records the same missing shared fixture and missing Inventory binding. The user subsequently relayed the other agent's confirmation that it never implemented the QGIS repair and has no passing converter acceptance. There is therefore no missing patch to wait for and no obsolete duplicate to consolidate.

The complete `HEAD..origin/master` patch was applied as **working-file edits**, preserving this task's uncommitted changes, without moving HEAD or staging anything. Its 67 paths were compared directly with the fetched commit: all match byte-for-byte except `backend/README.md`, `contracts/README.md` and `backend/tests/test_workspace_api.py`, which also carry this task's focused additions. The revision migration, service/repository/CAS logic, client preconditions, generated contracts and existing revision tests are preserved. These are inherited changes, not a new UI or migration implementation in this task.

## GIS discrepancy

The exact failing scenario is `backend/tests/gis_current_acceptance.py::test_v1_v2_gis_readback_matches_signed_exports`, re-exported by `database/tests/test_gis09_api.py`. Both the direct invocation and the documented wrapper were examined; runtime results are recorded below.

The failure occurs before successor publication, observation uploads or export conversion, at the assertion `bindings.inventory is not None`. The `zone_site` fixture submits `submission()` with only `form_version: shell-v1`. `create_tenant()` provisions that play form, and this fixture never creates or binds an Inventory form. The returned manifest therefore correctly reports `inventory=None`.

This is an incomplete Inventory scenario in the available checkout. It is **not a proven obsolete duplicate**, so the test was retained unchanged. A passing backend default suite does not include this specially named acceptance module and must not be represented as passing GIS acceptance.

The separate converter defect is unremediated: `qgis/zone-boundaries/prepare.py` still branches on `assignment_basis`, requires it for bound records and compares removed basis fields with CSV. Its unit fixture still manufactures `assignment_basis` and `display_anchor_basis`. The available GIS adapter test compares signed SQL/API export results but does not invoke that converter. Existing QGIS documentation explicitly describes these adapters as historical. No passing repaired converter acceptance exists from the earlier work.

The failure was investigated through the actual manifest, fixture construction, converter source and test wiring; it was not dismissed because it also occurs at HEAD. No GIS test was deleted, rewritten, weakened or consolidated without a demonstrated replacement.

## Preserved form revisions and completed lifecycle coverage

The initial checkout lacked form revisions; the fetched remediation supplies `revision`, strong `etag` values, required `If-Match` on save/discard/publication, and database CAS/publication checks. The definition body remains unchanged. All newly affected lifecycle requests use these actual preconditions.

New regressions exercise the production parser and supported signed API routes:

1. Reject four contradictory variants during form creation and subsequent draft creation; failed draft creation leaves the prior draft unchanged and creates no next version.
2. Reject replacement with the real current `If-Match`, preserving the original definition, revision and ETag.
3. Insert a synthetic invalid definition only in the guarded disposable database, observe its advanced revision, reject the stale publication precondition with 412, then reject publication of the current invalid definition with 422 and no mutation.
4. Edit, review, publish and bind equal/negative/zero-bounded definitions and a bounded `round_type` question; observer upload, viewer readback, CSV and GeoJSON retain the exact answer and envelope metadata. Out-of-range uploads remain rejected.
5. Exercise the actual mobile `parseFormDefinition`, `buildObservation` and `serializeBoundObservation` with corresponding authored bound cases; valid values serialize under nested `answers`, while out-of-range collection is refused.

## Implemented boundary correction

Python's `FormDefinition` already calls `definition_problems` at its canonical parsing boundary. That check now rejects number questions whose supplied `min` exceeds `max`. The same semantic check lives in TypeScript's `validateFormDefinition`, reached by both `parseFormDefinition` and the web editor's `loadDefinition`. Web/mobile definition sources remain byte-identical below the web header.

The existing integer parsing, finite-number checks, safe-integer limits, null rejection, numeric answer validation and answer-range enforcement are unchanged. Equal positive/negative/zero bounds, ordered negative or cross-zero bounds, omitted bounds and ordinary one-sided bounds remain accepted. Optional inverted numeric questions are also rejected. No conditional-form satisfiability solver was added.

Removed only the obsolete question-ID reservations: `site_id`, `form_version`, `coordinates`, `observed_at`, `zone`, `round_type`, `first_round`, `placement`. Removed the same reservations from automatic ID allocation in the web editor. Existing duplicate IDs still receive suffixes there and still fail canonical duplicate checks if explicitly authored twice.

Current upload models keep metadata outside the nested `answers` dictionary. Normalization and answer lookups use question IDs within that dictionary. Export planning reads that dictionary and uses `free_header` to allocate columns separately from record metadata. This real column collision protection, duplicate export-column checks, recorded known collisions, reference/operator/option/order/cycle checks, authorization and immutable historical bindings remain intact. The legacy form engine remains present and unchanged.

The production export-module regressions exercise both namespace cases separately: `round_type` as an answer with `Question_Round_Type`, and the real column collision with export column `round_type` allocated as `answer_round_type`. CSV and GeoJSON retain envelope `standard`, the independent answer, nested answers and frozen form definition. The distinct-column case also traverses the complete supported API lifecycle described above.

## Verification

Node `v24.18.0`, pnpm `10.17.1`, repository Python 3.13 virtual environment, frozen/offline uv execution with a writable temporary cache. JavaScript commands used the explicit Node 24 executable. This correction adds no dependency. The inherited form-revision lockfile includes `react-test-renderer@19.2.4`; web dependencies were installed with that frozen lockfile and lifecycle scripts disabled. The offline attempt lacked that package, so the matching two missing packages were fetched from the public registry. No lockfile was regenerated.

### Final combined verification — 2026-10-17

For the API defect reproduction, only this task's `form_references.py` change was temporarily replaced with the fetched commit's original validator, with a restoration trap. All revision/auth code remained current. The 17 new API cases produced **14 expected failures and 3 passes in 37.19 seconds**: contradictory creates/drafts/updates and stored-invalid publication were accepted, while `round_type` was incorrectly rejected. The three ordinary bounded lifecycles passed. The correction was restored before final verification.

| Check | Final local result |
| --- | --- |
| New API lifecycle cases plus preserved revision/concurrency/workspace/authorization tests | **124 passed**, 204.85 seconds. |
| Full disposable backend suite with inherited revision migration | **825 passed**, 126 existing warnings, **573.49 seconds**. Default collection excludes the specially named GIS acceptance scenario, reported separately below. |
| Full mobile suite, production builder/serializer cases and static checks | **834 passed, 5 skipped**, 6.05 seconds; TypeScript and forms Biome pass. |
| Full web unit suite, including inherited form concurrency tests, TypeScript and focused ESLint | **393 passed**, 2.52 seconds; TypeScript and focused ESLint pass. |
| Backend Ruff/type/format checks | Passed; **0 type errors**. |
| Source parity, strict-rule audits, Git whitespace and focused-patch reverse check | Passed; no type escapes or new production abstractions. The copied definition modules remain at 236 noncomment lines each. |
| GIS wrapper with explicit backend fixture plugin | **1 failed**, 1.99 seconds, at the independent Inventory binding assertion. |

### Initial verification before remote reconciliation — 2026-10-16

Before production edits, the authored shared cases reproduced **12 failures each in Python and mobile**: four accepted inverted-bound definitions and eight incorrectly rejected question IDs. Web reproduced those same failures plus one editor ID-allocation failure (**13 failures**). All remaining bound/type cases passed before the fix.

| Check | Actual local result |
| --- | --- |
| Focused Python shared definition, existing form contracts and namespace/export modules | **58 passed** in 0.09 seconds. |
| Focused mobile forms/domain tests | **124 passed**. |
| Complete mobile Vitest suite | **830 passed, 5 skipped**, 4.58 seconds; includes generated definition-schema drift check. |
| Focused web definition/editor/model cases | **59 passed**. |
| Complete web unit suite | **390 passed**, 1.84 seconds. |
| Disposable API: new contradictory-create cases, existing form lifecycle/ID cases, authorization, bound upload/binding, complete exports and restricted GIS sample readback | **91 passed**, 132.46 seconds. |
| Complete backend suite through disposable harness | **774 passed**, 126 existing warnings, **378.67 seconds**. This default collection excludes the specially named GIS acceptance module reported separately. |
| Current GIS acceptance, direct module | **1 failed** at missing Inventory binding, before any converter call. |
| Documented `sh database/gis09-api-rehearsal.sh -q` | **1 setup error**: fixture `api_client` not found. The database-side wrapper imports only `signer`, while backend-scoped fixtures are not discovered for this external test path. |
| Backend Ruff, BasedPyright and changed-file Ruff formatting | Passed; **0 type errors**. |
| Mobile/web TypeScript checks, mobile forms Biome, changed web ESLint/Prettier | Passed. |
| Python/TypeScript strict-rule checks and form engine parity | Passed. |
| Git whitespace check | Passed. |

Disposable API commands:

```sh
sh database/zone-api-rehearsal.sh -q tests/test_form_validation_api.py tests/test_workspace_api.py tests/test_observation_authorization.py tests/test_bound_uploads.py tests/test_bound_upload_bindings.py tests/test_observation_analysis_exports.py tests/test_gis_readback.py
sh database/zone-api-rehearsal.sh -q
sh database/gis09-api-rehearsal.sh -q
```

These use the cached pinned Supabase PostgreSQL 17.6/PostGIS image with pg_cron, fresh temporary database storage, synthetic identities/signing keys and an ephemeral loopback port. Each harness stops only its own container. They do **not establish hosted compatibility**, current QGIS Desktop acceptance or physical collector acceptance.

An initial attempt to invoke the database-side GIS test directly omitted pytest's backend configuration and failed collection with `ModuleNotFoundError: fieldmaps_api`. The documented wrapper supplies that configuration, but has the separate missing-`api_client` fixture wiring error recorded above. Invoking the backend module directly successfully loads its fixtures and exposes the missing Inventory binding. Neither the collection error nor the wrapper setup error should be conflated with that substantive fixture failure. These missing repairs were reported without modifying the GIS harness or converter.

An execution mistake also needs recording: an early `pytest -m 'not integration'` run omitted explicit disposable selection. Several database-backed modules lack that marker, and the run executed those fixtures (**542 passed, 226 deselected**). The repository's default database helper can read the local password-file fallback, so this run cannot be certified as secrets-free or disposable-only. No credential value was printed. This result is not used as disposable acceptance. Remaining database runs used the guarded disposable harness. No existing database was reset and no hosted operation was performed.

## Changed files

The [focused patch](canonical-validation.patch) contains only this correction's 15 source/test/owning-document paths relative to `origin/master` at `7f12470`. It excludes the inherited revision remediation and this evidence file. `git apply --reverse --check --unidiff-zero` against the combined working files passes. This also preserves the bounded review delta from before the authorized delivery advanced the local branch to that fetched commit.

| File | Purpose |
| --- | --- |
| `backend/src/fieldmaps_api/domain/form_references.py` | Numeric invariant and removal of envelope-only ID reservations. |
| `mobile/src/forms/definition.ts` | Matching canonical TypeScript rules. |
| `web/src/lib/forms/definition.ts` | Matching copied rules, protected by parity check. |
| `web/src/features/forms/raw.ts` | Stop reserving envelope names during editor ID allocation. |
| `contracts/forms/definition.cases.json` | Authored shared numeric and ID expectations. |
| `backend/tests/test_form_definition_cases.py` | Production Python parser and nonfinite-bound regressions. |
| `mobile/src/forms/definition-cases.test.ts` | Production mobile parser cases, nonfinite-bound regressions and collector builder/serializer checks. |
| `web/tests/unit/form-definition-cases.test.mjs` | Production web parser/editor cases and duplicate ID allocation. |
| `backend/tests/test_form_validation_api.py` | Signed create/draft/update/publication regressions, unchanged failed revisions, bounded publication/upload/readback and both export formats. |
| `backend/tests/test_form_namespace_exports.py` | Production normalization/CSV/GeoJSON namespace and real column-collision checks. |
| `backend/tests/test_workspace_api.py` | Replace obsolete create-ID denial expectation with acceptance/readback. |
| `mobile/src/forms/definition.test.ts` | Replace obsolete ID denial expectation. |
| `web/tests/unit/forms-start.test.mjs` | Replace obsolete automatic ID suffix expectation while retaining duplicate protection. |
| `contracts/README.md`, `backend/README.md` | Owning boundary/namespace documentation. |
| This file | Current remediation evidence and the separate unresolved GIS defect. |
| `canonical-validation.patch` | Reviewable focused delta against the fetched revision baseline. |

## Rollout and review requirements

Relative to the fetched form-revision baseline, this correction changes no API shape. Its existing generated OpenAPI and declarations were preserved, so no generation was needed. The generated form JSON Schema is unchanged because these semantic rules run after structural parsing, as with references and duplicate export columns. The canonical correction introduces no migration; the inherited revision migration is retained unchanged.

Review any previously stored contradictory draft or frozen definitions before rollout; stricter canonical parsing can reject such definitions during upload or export. Do not silently rewrite immutable published versions or historical records. API, web and mobile releases should carry consistent validation behavior and retain the existing form-revision migration wherever it is not yet applied. The separate QGIS converter/Inventory acceptance problem still needs its own remediation and does not acquire passing acceptance from this form-validation change.

Implementation and verification performed no branch switch, commit, push, deployment, hosted migration or real provider mutation. The implementation was left uncommitted for review.

## Authorized delivery preparation — 2026-10-17

The user subsequently authorized committing and pushing the local work. A fresh fetch confirmed `origin/master` remains at `7f12470c6dfc17aa2542a1b7402f33287cff42a7`. The local `master` branch was advanced to that existing descendant without changing working files; SHA-256 comparisons confirmed all 81 changed or untracked files were preserved byte-for-byte. This retains the existing authorization/form-revision history and leaves only the canonical validation correction and its evidence for the new commit. No QGIS repair is included. The commit and push results are reported in the delivery handoff.

Pre-commit checks on the unchanged implementation passed again: 41 focused Python parser/export tests, 54 mobile definition tests and 46 web definition/editor tests. Form-engine parity, whitespace and focused-patch reverse checks also passed. The broader disposable integration and static results above remain applicable; no production code changed during delivery preparation.

The committed review patch uses zero-context hunks so storing the patch does not introduce context-line whitespace errors. Validate that artifact with `git apply --reverse --check --unidiff-zero docs/reviews/canonical-form-validation-2026-10-16/canonical-validation.patch`.
