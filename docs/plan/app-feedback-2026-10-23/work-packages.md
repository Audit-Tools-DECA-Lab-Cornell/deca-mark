# Work packages, model routing and ownership

Use with [the approved specification](README.md), [recovery protocol](recovery.md), and [Claude execution prompt](claude-prompt.md). These are execution packets, not duplicate component task definitions. The coordinator maps them to existing or newly allocated owning-plan tasks when scheduling implementation, reconciles current dependencies, and runs `pnpm plan:check`.

## Waves

| Wave | Packets and models | Exit gate |
| --- | --- | --- |
| 0 | `P00-review` Opus: compare at most three concrete approaches and review UX/contracts. `P00-recovery` Sonnet coordinator: initialize working recovery and ownership. `P00-coverage` Haiku: inspect bounded entrypoints and requirements. | Accepted specification, every requirement assigned, simulated interruption/resume drill passes. No application implementation is claimed by the initial planning ledger. |
| 1 | `P10-forms` Sonnet: existing-format authoring, wording, IDs/export rules. `P11-invites` Sonnet: invite/join behavior, wording and default. `P12-reports` Haiku: report date-range and Round Type. | Focused tests and real local browser acceptance for each completed slice; specification review before quality review. |
| 2 | `P20-ts` Sonnet: both TypeScript definition/engine copies and generated form schema. `P21-python` Sonnet: Python definitions/validation and export interpretation. `P22-cases` Haiku: independent expected cases. | Shared contract interface frozen first, cases and both engine copies agree, version guards/wiring and generation pass. |
| 3 | `P30-web` Sonnet: extended field authoring and web preview. `P31-mobile` Sonnet: native inputs, capture context and offline retention. `P32-acceptance` Haiku: separate end-to-end scenarios and evidence. | Real local full collection/export scenario passes, with precise remaining native/hosted acceptance. |
| 4 | `P40-integration` Sonnet coordinator: serialized integrated checks. `P41-review` Opus: spec compliance, then quality/UX/accessibility/responsive review, then review fixes. | No unresolved required acceptance defects; final evidence and checkpoint ready. |

## Requirement allocation

| Packet | Requirement references |
| --- | --- |
| P10-forms | R01–R10, R12–R15, R28, R30. |
| P11-invites | R16–R22. |
| P12-reports | R23–R24. |
| P20-ts/P21-python/P22-cases | R11, R25, R26 engine/contract portion and necessary existing schema-version wiring. |
| P30-web/P31-mobile/P32-acceptance | R11, R25, R26 UI/capture/acceptance; final editor and export regression coverage. |

R27 and R29 are deferred. Later packet references are responsibilities for a distinct implementation layer, not a second product-task status.

## Initial ownership boundaries

| Lane | Files/responsibility allowed after coordinator assigns exact paths | Restrictions |
| --- | --- | --- |
| Forms/web | `web/src/features/forms/` and its existing focused tests; in Wave 1, assigned backend export-planning files/tests for the ID rule. | No shared engines, invitation modules, generated artifacts or shared tokens. Wave 1 export files transfer to Python owner for Wave 2 and back only explicitly. |
| Invitations | `web/src/features/people/`, relevant Team/auth/join modules and tests, `backend/src/fieldmaps_api/invitation_schemas.py` and assigned invitation service/query/test files. | Exact auth/layout allowlist before editing; do not alter unrelated sign-in pages. Any SQL-function change needs explicit transfer of an isolated migration source file. No migration application. |
| Reports | `web/src/features/reports/` and assigned report specs. | No shared date/time engine or export module changes; report filter semantics are preserved. |
| Contract/client | TS owner: web/mobile forms engines and mobile form schema generator; Python owner: form domain/service/schema/query files and their existing tests; cases owner: `contracts/forms/definition.cases.json`, selected authored answer-case files and a separate coverage report. | Freeze property names, defaults, source restrictions and cases before parallel implementation. TS owner alone copies matching engines/generates form schema. Existing Python/TS tests belong to their implementer, not cases owner. |
| Capture/integration | Web owner: form settings/preview UI after Wave 1 transfer; mobile owner: collector inputs, capture/draft/session/package adapters; acceptance owner: separately assigned new scenarios; coordinator: shared docs/tokens/OpenAPI/declarations/central ledger and infrastructure. | No concurrent writers to same files. Generated outputs, DB fixtures and browser infrastructure are serialized. |

The coordinator must put concrete paths and exclusions in each worker dispatch. Directory ownership is an initial boundary, not blanket permission to overwrite unrelated work.

## Routing and cost

Use Haiku for deterministic reconnaissance, approved mechanical edits, documentation, evidence and bounded checks. Use Sonnet for coordination, nontrivial code, tests and integration. Use Opus for cognitive walkthroughs, alternatives, contract-risk decisions and adversarial review. Record requested and actual model; if routing is unavailable, report it instead of silently substituting a more expensive model.

Maximum three active workers, plus the coordinator; do not dispatch nested worker trees. During a costly Opus review, let unnecessary implementation agents idle. One substantive design review and one spec/quality review sequence per meaningful slice; bundle copy-only edits. Do not have every worker reread the whole repository, original deck or all historical audits.

Every worker receives the relevant requirement text, settled decisions, exact paths, known source facts, required checks, journal path, current checkpoint, and explicit warning that others share the checkout. Responses use compact evidence pointers rather than raw full logs.

## Review sequence and escalation

1. Implementer checks its diff and focused acceptance; journals outcome and concerns.
2. Independent Opus reviewer checks specification compliance. Missing behavior returns to the owner; interrupted review is not approval.
3. Once compliant, reviewer checks correctness, UX/psychology, responsiveness, accessibility and preservation guarantees.
4. Owner fixes concrete findings; reviewer verifies the changed inputs and evidence.
5. Coordinator updates owning component status and execution pointers. After three failed fix attempts, stop editing that issue, record the attempts/doubtful assumption and ask one precise diagnostic question; continue independent packets.

Reviewers are read-only. Do not create automatic PRs or use Git commits as a substitute for the documented checkpoint system.
