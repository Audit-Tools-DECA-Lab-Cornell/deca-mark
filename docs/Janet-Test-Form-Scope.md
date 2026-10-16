# Janet test form: next implementation slice

> Historical September research/form scope. The canonical form/engine now exist; this is not the next implementation queue. Its dual-acceptance and preserve-old-schema instructions are superseded by the [pre-launch policy](plan/README.md#pre-launch-compatibility-policy-2026-10-11). Retain workbook inclusion/provenance and unresolved protocol questions. Current technical/pilot acceptance lives in [the roadmap](plan/current-state.md), CON-02, WEB-09 and GIS-01.

Prepared September 18, 2026 from `Variables to use for App testing.xlsx`, Sheet1, and the current mobile/API contracts. This is an implementation scope, not an approved research instrument or a deployed form. The workbook remains unchanged.

## Starting point

The practice form saves initials, people count, and notes to SQLite, uploads through the authenticated API, and exposes accepted observations in QGIS. Two test observations have completed this development path. Preserve the existing `shell-v1` form and its records when introducing a new form version.

The next slice should exercise reusable form definitions and conditional answers with a small, source-backed subset. It should not require a full web form builder first. Publish a separate test version only after its option codes, required fields, and rule interpretations are explicit.

## Candidate first subset

| Source cells | Field or behavior | Implementation requirement |
| --- | --- | --- |
| B4:G5 | Automatic timestamp and observer initials | Preserve time with timezone; support up to 10 uppercase characters for initials. |
| B42:G42 | Play event summary | Text up to 1,000 characters. |
| B44:G49 | Child age range | Single choice from the six supplied ranges; store stable codes separately from labels. |
| B83:G100 | Primary play types 1 and 2 | Separate answers using the nine supplied choices. Whether the second slot is required remains a protocol decision. |
| B101:G133 | Play subtypes and non-play Other | Independent subtype and Other answers for each play slot; do not share slot 1's values with slot 2. The test sheet supplies one subtype set; confirm the full library's two-slot interpretation before publishing. |
| B135:G137 | CARS activity intensity | Preserve the three supplied category bands. Do not turn bands into inferred numeric scores. |
| B188:H197 | Wildlife interaction, type, Other, description | The Yes branch reveals follow-ups. Confirm whether Other description appears only when type is Other, as the broad rule currently reveals all three follow-ups. Description fields have a 100-character limit. |

These fields exercise text, single choice, dependent choices, and nested conditions. Add round climate, environmental zones, inventory, and other groups after their context and option lists are explicit. This candidate subset is not a decision to discard the remaining variables.

## Confirmed inclusion decision

The user confirmed that the first test form must exclude all 16 hidden variable rows: Sheet1 rows 33–40 and 180–187. Keep those variables in the unchanged source workbook for later review with Janet. Record inclusion explicitly in the form definition; this decision applies to the first test form, not every future form.

Display rules must not reintroduce excluded fields. In particular, H169 references `LooseParts14` and `LooseParts16`, which are excluded. Resolve those references against the explicitly included fields before publishing; retain the original rule text as source provenance.

## Contract and implementation order

1. Define versioned form JSON with stable field/option identifiers, labels, constraints, explicit inclusion, and a restricted condition format. Preserve source workbook row references. Validate unique export names, dependency references, and cycles before publishing. Never execute workbook text as code.
2. Implement the same visibility and validation behavior on mobile and the API, using shared language-neutral fixtures. Proposed test behavior: answers hidden by a parent change are excluded from the saved payload, and hidden required fields do not block saving. Confirm this behavior before research use.
3. Render the definition offline and save `form_version_id` plus validated answers in the existing SQLite transaction and account-scoped queue. Preserve `shell-v1` records and pending uploads. A deployment must accept both versions during transition.
4. Add a new immutable server form version and a typed QGIS analysis view for its accepted answers. Keep the existing practice view working. Compare stable codes, coordinates, timestamps, and both play subtypes across mobile, PostGIS, and QGIS.
5. Verify offline save/restart, parent-answer changes, independent play slots, reconnect/retry without duplicates, and account isolation. Native testing and QGIS readback follow automated contract and migration checks. Only then expand the subset or build the web publishing interface.

## Questions carried forward

| Workbook evidence | Open decision |
| --- | --- |
| H19, H21, H23, H25, H27, H29, H31 | Inventory conditions say Yes, but answers are quantity bands. Define the exact predicate and whether a None option is needed. |
| H54, H70, H138, H188 | Specify category predicates and when Other text appears. Do not mechanically interpret nonempty categories as true. |
| E17/E199, E168/E169, E176/E177, blank E51 | Approve distinct export names for collisions and the missing gender export field. Preserve original source names in provenance. |
| G171, G173, G175, G177, G179; project zones; round inheritance | Supply project choice lists and decide which answers carry forward across observations, rounds, dates, and zones. Never fabricate the missing lists from examples. |

The next code change should begin with form-definition parsing and condition fixtures, while these content decisions remain separate from the reusable engine. Full source review is in `QGIS-Field-Collection-Feasibility.md`.

## Implementation status

Updated September 22, 2026. The mobile collector now carries a reusable form engine and a
`janet-test-v1` definition covering the candidate subset above: timestamp and initials, play event
summary, child age range, both play type slots with their subtypes, CARS bands, and the wildlife
branch. All 16 hidden rows remain excluded, and the definition records that decision explicitly.

Steps 1 to 3 of the contract order are done on the device: the definition carries stable
identifiers, a restricted declarative condition format and source row references; unique export
names, dependency references and cycles are validated before the definition can be used; and
answers save into the existing SQLite transaction and account-scoped queue alongside untouched
`shell-v1` records. Answers hidden by a parent change are dropped from the payload, and the count
is reported to the observer rather than discarded silently. Hidden required fields do not block a
save, because only visible questions are validated.

Steps 4 and 5 are not done. `janet-test-v1` is a draft version, so its records are held on the
device and never queued: the API accepts only `shell-v1`, and there is no server form version or
GIS view for the new answers yet. Publishing it needs dual acceptance in `backend`, an immutable
`form_versions` row, and a typed analysis view.

The questions carried forward are unresolved and are surfaced in the app rather than settled in
code. The wildlife branch has no supplied export columns and no interaction type list, so its
columns are empty and the list is marked as pending; the second play subtype slot keeps an
independent answer but has no export column; presenting gender, the manufactured loose-parts
collision on `Nat_LP_Intn_Binary`, and the "list to be provided" natural materials checklist are
carried as protocol notes and their fields are held out of this version. Option codes in the
definition are provisional implementation identifiers, not workbook values.

## Inventory round (2026-10-07)

Janet asked for three rounds on every project — Standard, Reliability and Inventory — with the
inventory "entered by zone" and the zone chosen by the observer. `contracts/forms/janet-inventory-v1.json`
implements the Inventory round from Sheet1 rows 13–32: weather (several), wind and shade (one
each), and the seven loose-parts quantity bands, each followed by its item list. The eight hidden
inventory rows (33–40) stay excluded. Three choices are recorded as protocol notes for Janet to
confirm: each quantity has a None option and the list opens for any quantity except None (H19–H31
say "if YES" over quantity bands); the item lists are typed until the common checklist is supplied
(G20–G32); and climate is asked with each zone rather than once per round. Shared cases in
`contracts/forms/cases/janet-inventory-v1.cases.json` run in both the mobile and the Python engines.
Like `janet-test-v1`, the version is a draft: its records are held on the device until the project
publishes it on the server.
