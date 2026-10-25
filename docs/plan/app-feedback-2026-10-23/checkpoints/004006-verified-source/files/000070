# P22 shared contract cases

Owner: shared contract case lane. Scope is synthetic shared answer/definition cases and the mobile answer-fixture parser only. No form engine, production answer type, backend runner, UI, generated schema, secret, database, hosted system, or Git operation was changed.

## Progress

- Read the root instructions, contract README, and reviewed feedback-v2 decisions.
- `definition.cases.json` already named schema 2 and refusal version 3; preserved those values and added parser-boundary expectations for integer/decimal bounds, source-kind restrictions, date-time configuration, and IANA timezone validation.
- Added 11 synthetic answer cases covering integer and decimal validation, negative fractions, boolean type rejection, missing required automatic values, hidden required automatic absence, leap-day validity, invalid date/time values, UTC `Z` timestamps, and offset rejection.
- The mobile fixture parser now accepts JSON booleans in test inputs while keeping production `AnswerValue` unchanged; the intentional malformed fixture is cast only at the test-engine boundary.
- Checkpoints `002200-cases` and `002201-cases` capture the first two file batches. Current pending checkpoint follows this journal update.

## Verification

- Mobile: `pnpm --dir mobile exec tsc --noEmit` passed.
- Mobile shared cases: `pnpm --dir mobile exec vitest run src/forms/contracts.test.ts src/forms/definition-cases.test.ts` passed, 117 tests.
- Python shared cases: `backend/.venv/bin/python -m pytest backend/tests/test_form_contracts.py backend/tests/test_form_definition_cases.py` passed, 70 tests (one existing Starlette deprecation warning).
- Web definition cases: `pnpm --dir web exec node --experimental-strip-types --test tests/unit/form-definition-cases.test.mjs` passed, 49 tests. An earlier `pnpm --dir web test:unit -- form-definition-cases` invocation ran the full web unit suite and passed 417 tests.
- No physical-device, hosted, QGIS, database, deployment, or accessibility acceptance is claimed.

## Final parity addition

- Extended the definition-case format with optional top-level `definitionPatch`, applied before the question patch in the mobile, web, and Python runners. Added three shared cases for matching question-ID export columns, a mismatched export column, and a null marker. Clarified the format in `contracts/README.md`.
- Focused verification passed: Python definition cases 56; mobile definition cases 62; web definition cases 53; mobile TypeScript check passed. Checkpoints `002203-cases` and `002204-cases` capture the definition data/docs and the TypeScript runner edits; the final pair is pending.
