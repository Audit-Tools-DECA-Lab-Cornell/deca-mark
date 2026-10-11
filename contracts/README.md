# Shared contracts

Language-neutral JSON shared by the independently managed mobile, web and API applications. There is no shared runtime package or dependency installation here. Task status belongs in [the contract plan](../docs/plan/contracts.md).

| File | Source and editing rule | Consumers |
| --- | --- | --- |
| `form-definition.schema.json` | Generated from `mobile/src/forms/definition.ts` using Zod's `io: "input"` mode. Never edit by hand. | Definition tooling; backend structural validation in BE-10 |
| `forms/shell-v1.json`, `forms/janet-test-v1.json` | Canonical, reviewed definitions. Initially exported from the mobile fixtures; edit the JSON, not the thin TypeScript imports. | Mobile registry/tests now; Training seeds (DB-07), publishing (DB-09), backend validation (BE-10) and GIS later |
| `forms/cases/*.cases.json` | Hand-authored expected behavior. Never regenerate expectations from the engine. | Mobile Vitest now; the same cases in Python during BE-10 |
| `contour.json` | Hand-authored Contour design tokens: the Day (default) and Dusk colours, with the Dusk values the design left out derived and listed under `derived`; the contrast pairs; fonts; the type, spacing, layout, radius, size and motion scales; and the state vocabulary (kind × state → label, Lucide icon and tone). Edit the JSON, then run `pnpm tokens`. Map colours do not belong here. | `scripts/contour-tokens.mjs` generates `web/src/styles/contour.css` (checked in, never edited by hand); web code reads the state vocabulary and motion through `web/src/lib/contour.ts`; the collector reads the file in `mobile/src/ui/tokens.ts` |
| `map-palettes.json` | Hand-authored cartography for every map canvas: `day` (default) and `night`, with identical keys. The app chrome follows Contour's own Day or Dusk theme; only the map changes palette, and UI state colours never appear on it. | Mobile field map (MapLibre) and web observation and package-preview maps (Leaflet) |
| `openapi.json` | Generated from FastAPI with `make -C backend openapi`; never edit by hand. | Separate generated TypeScript declarations in web and mobile |
| `zones/*.cases.json` | Authored synthetic geometry, publication, upload and fingerprint expectations. Never regenerate expectations from implementation. See [zone contracts](zones/README.md). | Backend input tests now; DB/API/mobile integration adapters as their owning zone tasks land |

## Generate and verify

With Node 24 and pnpm 10.17.1, from the repository root:

```sh
pnpm --dir mobile contracts:forms
pnpm --dir mobile test
pnpm mobile:check
pnpm plan:check
pnpm tokens:check
pnpm contracts:generate
```

`pnpm tokens:check` fails if `web/src/styles/contour.css` has drifted from `contour.json`, or if any declared colour pair misses its WCAG minimum in Day or Dusk: 4.5:1 for text, 3:1 for UI.

The form generator only writes the JSON Schema. It does not overwrite authored forms or cases. The mobile suite compares the committed schema to fresh generation and discovers every `*.cases.json` file. Run the generator twice and confirm the second run makes no change. CI runs these tests through its mobile job and separately regenerates OpenAPI and both app declarations to reject contract drift.

OpenAPI generation needs the installed backend dependencies and each app's own `openapi-typescript` dependency. It needs no running API, database or credentials. Generated declarations live in `web/src/lib/api/schema.d.ts` and `mobile/src/data/api/schema.d.ts`; runtime input validation remains necessary.

Each app's adjacent `errors.ts` parses error envelopes into typed errors and local user copy. Error codes determine retry, sign-in and rejection, with transport fallbacks for 401 and 5xx. Unknown or malformed responses remain retryable; on mobile this preserves the local record, including when an older API returns an unstructured 403/409/422. Known validation/access/conflict codes remain rejected. Run `pnpm --dir web test:api-errors` and `pnpm mobile:test` to verify these decisions.

## Definition rules

The input schema accepts omitted defaults and unknown properties. Parsing fills the defaults and discards unknown properties. JSON Schema checks structure; it does not replace `parseFormDefinition`'s reference, cycle, ordering and export-column checks. Server parity requires those checks too.

Question IDs and option codes identify answers; labels may change without changing those identifiers. Export columns are only for analysis. Preserve unresolved protocol notes, empty export names and pending option lists. Do not infer new research fields or choices from test fixtures. `janet-test-v1` remains a draft and is not enabled for upload by this work. Published versions require a new version for changes.

Number answers are finite JSON numbers, validated as integers against `min` and `max`. Single choices hold an option code; multiple choices hold distinct option codes. Text limits count Unicode code points, matching JSON Schema and Python string length. Blank text and empty selections count as unanswered. A present value of the wrong type is invalid even when the question is optional.

Visibility follows authored dependency order. Hidden answers cannot reveal descendants. Validate visible answers before pruning: `required`, `type`, `range`, `option`, `duplicate` and `maxLength` errors block saving. Hidden answers are pruned without errors. The interactive mobile pruning helper also removes stale options after a parent changes; that cleanup must not make an invalid incoming payload pass validation. The builder validates first and then prunes.

## Shared case format

Each file names a `formVersion`, an optional-use `definitions` map of synthetic test forms, and a `cases` array. A case has a unique `id`, an optional `definition` key selecting one of those synthetic forms, and ordered `steps`. Without that key it uses `forms/<formVersion>.json`.

Each step supplies a complete `answers` snapshot and an `expected` object:

- `visible`: question IDs in authored order, before interactive option cleanup.
- `problems`: ordered `{ "id", "reason" }` objects from validating the supplied visible answers.
- `answers` and `dropped`: the interactive cleanup result and fully removed question IDs. Partial multi-choice cleanup retains the question.
- `options`, when present: resolved option codes for named dynamic questions.

Only a step with no problems can be saved. Multi-step cases model parent-answer changes; each step is a full snapshot, not a patch. Synthetic forms cover input kinds and conditions absent from Janet's current subset. They are test data, not proposed research variables. The defaults case omits every defaulted property and includes unknown properties.

BE-10 must run these cases through Python before claiming server parity. Native device, hosted upload and QGIS acceptance are separate checks.
