# Mobile UI plan: collecting on pinned zone boundaries

[Mobile data plan](ZONE-BOUNDARIES.md) · [Master plan](../docs/plan/zone-boundaries/README.md) · [Contract](../docs/plan/zone-boundaries/contract.md) · [Web UI plan](../web/ZONE-BOUNDARIES-UI.md) · Tasks MOB-30, MOB-31 and MOB-32 (UI), MOB-28 and MOB-29 (data) in [PLAN.md](PLAN.md)

Status: a plan, not built. Baseline: local source on 2026-10-11. During this planning, BE-18 appeared in the working tree as uncommitted source while its task still read `todo`:

- **Present in source:** `GET /v2/projects/{p}/sites`, historical `/zones` and the manager draft routes. They are in the regenerated `src/data/api/schema.d.ts`.
- **Not present:** the v2 observation upload (`PUT /v2/…/observations/{id}`, BE-19) and the v2 reads exist nowhere.

Treat the BE-18 source as moving until BE-18 is marked done. Line references can drift. Re-read the cited function before editing it.

The mobile data agent owns storage, domain, sync and package lifecycle ([ZONE-BOUNDARIES.md](ZONE-BOUNDARIES.md)). This file owns what observers see and do, and the interfaces the UI needs from the data layer. If the two conflict on data behaviour, the data plan and the contract win. Raise the conflict with the lead instead of working around it.

## 1. Outcome for observers

When this is done, an observer can:

1. Download a site once and collect offline on that exact map version, all session, even after a manager publishes a newer one.
2. See which map version they are using: on the site, in the brief, in the collect header and on every saved observation.
3. Learn that a newer map exists at a calm moment (site screen, brief), never in the middle of an observation. Download it beside the old one and use it from the next session.
4. Place points with the existing crosshair. The panel says whether the point is inside the session's zone, on the edge between zones, in another zone, or outside every zone. On a bound map they cannot save a point the zone does not cover. The unfinished observation is kept while they move the point or choose a zone.
5. Force-quit, restart or lose signal and resume the exact unfinished observation: same map version, zone, point and answers. If that map is missing, the app says so and offers to download it again. It never quietly switches to another zone or a newer map.
6. Never lose a map that unfinished or unsent work still needs. "Remove" says which work uses the map.

Never:

- Swap the map under an active session or an open observation.
- Pick a zone by list order, or let the bounding box stand in for a missing boundary on a new-format map.
- Show an inventory as a point, or put a GPS position into a record.
- Ask for anything after each observation. Fast repeat stays as it is: Saved → "Place the next observation" → aim, with no transition.
- Make an observation depend on a network call.

## 2. What the code does today (verified)

| Area | Today | Evidence |
| --- | --- | --- |
| Crosshair placement | A fixed × with a lifted pin. The map moves under it. A tap recentres the map, the nudge pad moves 0.5 m, and "Place point here" reads the exact native centre. Keep all of this. | `src/features/collect/CollectMap.tsx:507-514,418-435`, `PlaceStep.tsx:42-53,173-207`, `CollectScreen.tsx:210-218` |
| Zone readout while aiming | "In Zone B" / "Outside Zone B · in Zone C" / "Outside Zone B", from `zoneAt`. It only advises: placing and saving are never blocked. The record always takes the session zone. | `PlaceStep.tsx:118-150,198-207`, `session/provider.tsx:201-212,396-417` |
| Edge membership | Half-open ray casting. A square owns its left and bottom edges but not its right and top; holes are the reverse. It disagrees with `ST_Covers` on 4 of the 16 shared `coverage_cases` (both shared edges, hole edge, hole vertex). On a shared edge, `zoneAt` cannot return the preferred zone. | `src/maps/geometry.ts:39-72`; scratch run of the unmodified file against `contracts/zones/geometry.cases.json` |
| Missing polygon | Falls back to the bounding box. The "Zone boundaries" readiness part passes on zone count alone. | `src/packages/hosted/build.ts:136-152`, `src/maps/geometry.ts:19-37`, `src/packages/open.ts:57` |
| Installed versions | One file per package, at a global path. Refresh replaces the site list wholesale. `isStored` only checks the current package, so an installed v7 reads as "Not downloaded" once v8 is published. Brief refuses a session whose package differs from the site list's. | `src/packages/hosted/provider.tsx:115-129,218-221`, `device.ts:26-28`, `brief.tsx:107` |
| Remove | Deletes the current package's file without checking drafts, unsent records or other accounts, and does not abort a running download. | `src/packages/hosted/provider.tsx:185-195` |
| Draft resume | Reopens `draft.packageId`. If the saved zone is missing, it silently uses `zones[0]`. It never compares package version, form version or site. | `session/provider.tsx:461-494` (fallback at 476-478) |
| One draft per account | Starting a new observation while a recovered draft is offered overwrites that draft. | `session/provider.tsx:331,337`, `storage/draft-store.ts:37-45` |
| Version labels | Project row subtitle (when ready), the Site PackageIsland title, the Brief locked line "MAP vN · FORM x stay locked for this session", and the map overlay. The overlay is replaced during placing. The collect header has none. | `readiness.ts:39-87`, `[site].tsx:241-377`, `brief.tsx:245-258`, `CollectScreen.tsx:280-285,417-425` |
| Inventory | Stored at a client-computed `zoneAnchor`, never drawn as a marker, zone picked from a list or by a map tap (`zoneAt`, first match). | `session/provider.tsx:349-353`, `records.ts:28`, `CollectMap.tsx:515-521` |
| Refresh errors | Recorded but never shown. No manual refresh. | `src/packages/hosted/provider.tsx:41-42,124-126` |
| Download progress | During a hosted download the four checklist rows stay "Waiting"; only the bar says "Part N of 4". | `[site].tsx:137-141` |
| Primitives | `Note` (tone, glyph, title, action, live region), `StateBadge` (contract or custom), `RadioRows`, `Segmented`, `StatusLine` with `announce()`, `Island`, `Button`. No sheet primitive; the declared `explain/[question]` sheet has no route file. | `src/ui/index.ts`, `app/(app)/_layout.tsx:28-36` |

Prompt facts confirmed: hosted packages download and verify into device files; removal has no dependency checks; `domain/observation.ts` keeps package ID/version and zone code/label but `sync/contracts.ts::uploadPayload` drops the package (`contracts.ts:42-56`); edge membership is ambiguous; restoring a draft can pick the first zone. One correction: the hosted `packageVersion` in a record's context is the display string `vN`, not an integer (`build.ts:174`). The data agent must add the integer and UUIDs; the UI must not parse them out of display strings.

## 3. Decisions

Each decision gives the choice, then why, then what would change it. "Lead" marks a product default the lead must confirm or replace (master plan, "Product defaults needing explicit visibility").

### MUI-1 A session is one visit to the collect screen

A session starts at "Start collection" on the Brief and ends when the observer leaves the collect screen with no unfinished observation. While it runs, the opened package never changes. An unfinished observation keeps its own package after the session ends, through restarts, until it is saved or discarded.

The next session opens the **newest verified package installed on the device** for that site. That is not necessarily the site list's current package: if v8 is published but not downloaded, the next session uses v7 and says so.

Why: the Brief already promises "MAP v7 · FORM x stay locked for this session", and observers already think of the collect screen as the session. Downloads are manual (the observer taps Download), so the observer controls when a new version reaches the device, and the Brief states which version the next session will use. This needs no new "End session" control. Only the draft has to survive process death, and it already carries its package (`draft-store.ts:15-29`).

Alternative (Lead): if the protocol needs a session that spans several visits, add a durable session record with explicit "Continue session" and "End session" on the Brief. The data plan's "durable session context" (ZONE-BOUNDARIES.md, MOB-29) supports either. The UI cost is one Brief state and one leave-dialog choice. Do not build both.

### MUI-2 Delayed adoption, never forced mid-work (Lead: confirm)

- A newer published version is announced on the Projects row, the Site screen and the Brief only.
- Downloading v8 never changes an active session or an unfinished observation.
- When v8 is verified on the device, the next session uses it. Starting a new session on an older installed version is not offered, except by resuming an unfinished observation pinned to it.
- When v8 is published but not downloaded, collection on v7 stays allowed, with a waiting Note. Blocking offline collection would lose fieldwork, and the server accepts uploads bound to superseded packages (contract, "New observation protocol").

Lead decision: whether a study ever needs (a) immediate mandatory updates or (b) a manual choice of an older version for new sessions. Either changes MUI-2 and CR-M7.

### MUI-3 Membership is the closed-set candidate list

Replace the single-zone `zoneAt` answer, everywhere the UI uses it, with `coveringZones(point, zones)`. It returns every zone whose geometry covers the point, boundary included: outer edges, vertices and hole edges count; hole interiors do not (contract "Point attribution"). It uses an exact on-segment test (orientation equals zero, plus a bounding check), with no epsilon and no metre buffer. It must pass every `coverage_cases` entry, compared as an unordered set. MOB-31 owns this pure function and its adapter test in `src/maps/geometry.ts`. MOB-29 reuses it for the save gate. The data agent reviews parity.

Placement states, for the session zone S and the candidates C:

| State | Condition | Readout (field language) | "Place point here" (bound map) |
| --- | --- | --- | --- |
| Inside | C = {S} | "In North meadow" | Enabled |
| On an edge | S ∈ C, more than one zone | "On the edge of North meadow and Slide", with a choice; S is preselected | Enabled for the selected zone |
| In another zone | S ∉ C, C = {Z} | "Outside North meadow · in Slide" plus "Switch to Slide" | Disabled: "Switch to Slide or move the ×." |
| Between other zones | S ∉ C, more than one zone | "Outside North meadow · on the edge of Slide and Swings", with a choice and nothing preselected | Disabled until a zone is chosen |
| Outside every zone | C = ∅ (gap, hole or outside the site) | "Outside every zone on map v7" | Disabled: "Move the × into a zone." |

- The choice is a `Segmented` for two or three candidates and `RadioRows` for more. Choosing a zone uses the existing `switchZone` path (haptic, announce), so it changes the session zone, as "Switch to Zone C" already does (`CollectScreen.tsx:227-231`). The header shows the result.
- **Preselecting S on an edge (Lead: confirm):** the contract forbids an implicit first match (contract "Point attribution"). The session zone is the observer's own earlier choice, shown on screen when they confirm the point. It is not list order. I treat it as explicit. If the lead disagrees, show the edge choice with nothing selected; the cost is one extra tap, only on exact edges.
- **Near-edge hint (UI only, Lead: confirm):** exact edges are almost unreachable with a float crosshair and a 0.5 m nudge, while points a few centimetres from a line are assigned silently. When the × is within 8 screen points of any zone edge at the current zoom, add "Close to the edge of Slide. Zoom in to check." It never changes candidates, validity or the stored record. It only suggests zooming in. Contract gap CR-M5 asks the lead to confirm that a UI-only hint is allowed.
- **Legacy (format-1) maps:** show the same readout, computed with the corrected predicate, but never disable placing or saving. Legacy collection keeps its current advisory behaviour, labelled legacy (data plan, MOB-29). Changing legacy flows is out of scope.

### MUI-4 The bound save gate has two checkpoints and never loses work

1. **Place:** "Place point here" is disabled in the states above, with the reason as a visible line under the button (DESIGN §5: a disabled control carries its reason).
2. **Save:** ReviewStep checks `coveringZones(point)` contains the record's zone again, in case the zone changed after placing. If it does not, show an attention Note: "Not saved yet. The point is outside Slide on map v7. Adjust the point or switch zone. Your answers are kept." with "Adjust point". Disable "Save on this device" with the same reason.

"Adjust point" keeps every answer (as today). Leaving adjust without confirming keeps the previous point. The draft is written on every change the data agent persists. That includes a zone change, which today is not persisted (`provider.tsx:506-512`; MOB-28 must add it).

Lead default: a zone is required for new bound points. A zone-free point option (for example "Record outside the zones") changes the contract (zone_id required in the v2 envelope) and this table.

### MUI-5 Version labels are always visible and come from the pinned package

- Collect header: "North meadow · Standard · map v7". The version is in mono and stays visible during placing.
- Brief locked line: unchanged wording, fed from the package the session will open.
- Saved card: a "Map and form" fact, "Map v7 · form janet-test-v1".
- Observations list and detail: "map v7" from the record's frozen context.

Labels use `package_version` as an integer formatted `v{n}` (CR-M6). Installed labels come from each stored package's own manifest, never from the site list (today the labels come from the site list: `hosted-sites.ts:28-41`).

### MUI-6 Removal is per installed version and reference-checked

The Site screen lists "Older maps on this device". Each row shows what still uses it. "Remove map v7" is enabled only when nothing does. Otherwise it is disabled with its reason: "Used by 1 unfinished observation and 3 records not uploaded yet." The data agent's `remove()` must re-check and refuse (MOB-28), so the UI check is only a preview. Removing the currently selected newest version follows the same rule.

Automatic cleanup of unreferenced superseded versions is a data-layer retention policy (MOB-28). The UI only needs to say "Older maps are removed from this device once nothing uses them" if that policy is adopted.

### MUI-7 Recovery never substitutes

Unfinished observation states, driven by a typed status from the data layer (section 6):

| Status | Card text | Actions |
| --- | --- | --- |
| Ready | "Unfinished observation · map v7 · North meadow · Point placed, 3 of 8 answered. Kept on this device." | Resume (opens v7 pinned), Discard draft |
| Map missing, can download | "Map v7 is not on this device. Your point and answers are kept." | "Download map v7 again · 12 MB", Discard draft |
| Map missing, offline | Same first line, then "Connect to download map v7 again." | Discard draft |
| Map no longer available to you | "Map v7 cannot be downloaded with your current access. Your point and answers stay on this device. Ask your coordinator." | Discard draft |
| Zone missing from map | "This observation's zone (NM) is not in map v7 on this device. Your point and answers are kept. Download map v7 again." | Download again, Discard draft |
| Form missing | "Form janet-test-v1 for this observation is not on this device. Download map v7 again." | Download again, Discard draft |

While an unfinished observation exists, "Start collection" on the Brief is disabled with "Resume or discard the unfinished observation first." Starting would overwrite the single draft (`draft-store.ts:37-45`). If the data agent adds more than one draft per account, relax this rule. Discard always uses `Alert.alert` with "Discard draft" / "Keep draft" (existing pattern).

### MUI-8 Account changes reset visible state

On account change (the existing `accountKey` path): leave the collect screen, clear the Site and Brief view state, and show no other account's packages, drafts or downloads. Today downloads and the downloads map survive a switch (`hosted/provider.tsx:94-113`), and the session keeps `sitePackage` and zone (`session/provider.tsx:268-286`). MOB-28 fences the data. The UI only renders what the fenced hooks return.

Sign-in and permission copy keeps preserved work separate from permission to upload:

- Signed out: "Signed out. 5 records stay on this device and upload after you sign in."
- Access removed: "You no longer have access to Play Study. 5 records stay on this device. They upload only if a manager adds you back."

### MUI-9 Inventory stays whole-zone

- ZoneStep keeps its `RadioRows` (`ZoneStep.tsx:45-116`).
- A map tap uses `coveringZones`. One candidate selects it. Several candidates leave the selection unchanged and say "That spot is on the edge of A and B. Choose one in the list."
- Bound inventories never show a point, in the collect map, the records map, the Saved card or the Observations detail.
- Label pills and any inventory display anchor use the manifest's `display_anchor` for format-2 maps. `zoneAnchor` remains for legacy maps only (contract: clients never recompute an anchor).

### MUI-10 Where messages live (no mid-observation prompts)

| Place | Message |
| --- | --- |
| Projects row | "2 sites ready offline · map update for 1 site" |
| Project site row | Badge "Ready offline". Subtitle "3 zones · map v7 · v8 available · 12 MB" |
| Site screen | Update Note, download progress per part, older versions, last check, check now |
| Brief | Which version this session uses, and why it differs from the last session or from the published version |
| Collect | Only the header label and placement readout. No update prompts. |
| Saved | The version fact. No prompts. |

Suggested copy (field language):

- Site, newer available: "Map v8 is available. Download it now to use it from your next session. Your unfinished and saved observations keep map v7."
- Brief, v8 on device: "This session uses map v8. Earlier observations keep map v7."
- Brief, v8 published but not on device: "This session uses map v7, the newest map on this device. Map v8 has been published. Download it when you have a connection."
- Site, download failed: "Map v8 did not finish downloading. Map v7 is still on this device and ready."
- Site, verification failed: "Map v8 could not be checked: zone Slide has no boundary. Map v7 stays on this device. Tell your coordinator."
- Site, refresh failed: "Could not check for map updates. Showing what this device knew at Oct 10 · 09:12."

## 4. Screen-by-screen changes

Keep layouts and primitives. One primary action per screen (DESIGN rule 01). Targets of 48 pt or more in the collector. Text follows the device size, and labels wrap.

### 4.1 Projects list and Project screen

- Readiness comes from the verified catalog (MOB-28), not file existence (`hosted-sites.ts:50-56` today).
- Add the update count to the row subtitle (MUI-10).
- Fix the stale empty-state copy that says package delivery is not built (`[project].tsx:41-42,105`).
- Replace the pseudo-percent download badge with "Downloading · part 2 of 4" (`readiness.ts:47,76-79`).

### 4.2 Site screen (`app/(app)/(tabs)/(projects)/[project]/[site].tsx`)

PackageIsland, top to bottom:

1. Title "Map package v7" (the newest verified installed version) with badge "Ready offline", or "Not downloaded".
2. Waiting Note when a newer version is available (MUI-10), with "Download v8 · 12 MB" (outline). The size comes from the v2 site list package (`archive_bytes`).
3. While downloading: ProgressBar plus the four checklist rows moving Waiting → Downloading → Verified. Fix the device-mode rows to use the per-part states (`[site].tsx:137-141`). Then "Cancel download".
4. Failure or verification Notes (MUI-10). The older version stays ready.
5. Primary "Set up this session". It opens the newest verified installed package (not `site.packageId`, `[site].tsx:143-162`).
6. "Older maps on this device" list (MUI-6), shown only when more than one version is installed.
7. Footer: "Checked for updates Today · 09:12" with "Check for updates" (TextLink). It calls the fenced refresh.
8. Legacy note when the newest installed map is format 1 and the server reports a format-2 current package: "This map is an older kind. Observations made with it upload without their map version. Download map v8 to record the version." Omit it for sites that have never been adopted, because there it adds noise without an action.

The removal confirm keeps "Remove Riverside map v7 from this device?" and adds what stays: "Saved observations stay on this device and still upload."

### 4.3 Brief (`…/[site]/brief.tsx`)

- Render whenever a verified package is selected for the site. Drop the `sitePackage.id === site.packageId` equality (`brief.tsx:107`).
- Version Note per MUI-10, above the locked line.
- UnfinishedCard (MUI-7) above the form when an unfinished observation exists for this site, and the "Start collection" disabled reason.
- Zone RadioRows unchanged. Labels come from the pinned package.

### 4.4 Collect (`src/features/collect/`)

- Header detail adds "map v7" (MUI-5).
- PlaceStep: replace the ad-hoc readout (`PlaceStep.tsx:118-150`) with a `StateBadge` (custom glyph, word and tone, or a new contract kind; see CR-M8). Then the candidate choice and the disabled reason. The live region stays polite while aiming. `useAimZone` (`CollectMap.tsx:895-903`) returns `{candidates, status, nearEdge}` and keeps its 100 ms throttle.
- Map: highlight candidate zones with palette means only (heavier `zone.edge` dashes, using the existing focus layer pattern). No UI state colour on the map (rule 03). Fix the spotlight so zone holes are dimmed (`geometry.ts:184-189`); today a hole looks inside the focused zone.
- ReviewStep: the save gate Note (MUI-4).
- SavedStep: the version fact. "Place the next observation" is unchanged.
- ZoneStep: tap candidates (MUI-9).
- Keep the map mounted across steps (DESIGN §8).

### 4.5 Observations tab and record detail

- Version label per record.
- Needs-attention copy for bound rejections, keyed by error and issue code (the data agent stores structured codes; data plan MOB-29). Draft copy:
  - `point_outside_zone`: "Needs attention. DECA Mark did not accept North meadow for this point on map v7. The record keeps its number and stays on this device. Tell your coordinator."
  - `zone_not_in_package`, `package_not_in_site`, `package_not_ready`: "Needs attention. DECA Mark could not match map v7 for this record. It stays on this device. Tell your coordinator."
  - `form_not_in_package`: "Needs attention. The form on this record does not belong to map v7. It stays on this device. Tell your coordinator."
- Whether such a record can be corrected, re-created or only kept is not specified (CR-M4). Until the lead decides, offer no "Correct and send again" for bound records. Records are immutable under their UUID.

### 4.6 Field guide (`app/(app)/(tabs)/account/field-guide.tsx`)

Add short sections: "Map versions" (why a session keeps its map), "Zone edges" (what the edge choice means), "Outside every zone" (move the point; the observation is kept). Keep the existing search and the open-in-place sections.

## 5. Accessibility and field conditions

- Readout changes are announced politely while aiming and assertively when a save is blocked. Focus never moves on its own while aiming.
- Candidate choices are full-width rows at 48 pt or more, inside the panel, so they follow the preferred hand. Never put them on the map: the map controls are not mirrored (`CollectMap.tsx:221-232`).
- VoiceOver and TalkBack names: "Zone choice, North meadow, selected, 1 of 2"; "Place point here, dimmed. Switch to Slide or move the cross."
- Daylight: Day palette and Day theme by default. State is a glyph plus a word plus a colour, and colour is never the only signal.
- Reduced motion: no pin drop animation; camera moves jump.
- Test text size at the largest accessibility setting with long zone labels. Labels wrap and never truncate.

## 6. Data-layer interfaces the UI needs (from the mobile data agent)

The UI does not write storage, domain, sync or package code. It asks for these read models and actions. Names are proposals; the data agent may rename them, but each field must exist with this meaning. Agree them in a short interface file under `src/packages/` before either side builds on them.

```ts
// Per site, scoped to the signed-in issuer/account/project; fenced against account switches.
type SiteVersions = {
  available: { packageId: string; version: number; format: 1 | 2; archiveBytes: number } | null; // v2 site list current
  installed: Array<{
    packageId: string;
    version: number;
    format: 1 | 2;
    status: "verified" | "needs_redownload";
    bytes: number;
    installedAt: string;
    references: { unfinished: number; unsent: number; attention: number; openSession: boolean };
    geometryFallbackZones: string[]; // format 1 only: zone codes drawn as boxes
  }>;
  nextSessionPackageId: string | null; // newest verified installed
  lastCheckedAt: string | null;
  refreshProblem: "offline" | "signed_out" | "no_access" | "server" | null;
  download: { packageId: string; part: 0 | 1 | 2 | 3; state: "running" | "failed" | "verify_failed"; message?: string } | null;
};
// Actions
download(packageId): Promise<void>; cancelDownload(packageId): void;
remove(packageId): Promise<{ removed: true } | { removed: false; references: SiteVersions["installed"][number]["references"] }>;
refresh(): Promise<void>;

// Session, from session/provider.tsx (data agent owns writes)
type Pinned = { packageId: string; version: number; format: 1 | 2; bound: boolean; siteId: string /* UUID when bound */; zone: { id: string | null; code: string; label: string } };
type Recovered = {
  draftId: string; pinned: Pinned; placed: boolean; answered: number; asked: number;
  status: "ready" | "package_missing" | "package_unavailable" | "zone_missing" | "form_missing";
  redownload: { possible: boolean; bytes: number | null };
};

// Pure geometry, owned by MOB-31 in src/maps/geometry.ts
coveringZones(point: [number, number], zones: SiteZone[]): SiteZone[];
nearEdge(point, zones, metresPerPoint, thresholdPoints = 8): SiteZone | null;
```

Shared hotspot files: `src/session/provider.tsx`, `src/packages/hosted/provider.tsx`, `src/data/api/client.ts` and `src/storage/*`. The data agent writes them. The UI agent changes them only by a written request answered by the data agent, one file at a time, with no overlapping edits. UI-owned files: `src/features/collect/*`, `src/features/projects/*`, the route screens under `app/(app)/(tabs)/(projects)/**` and `app/(app)/collect.tsx`, `src/maps/geometry.ts` (predicate and spotlight only), `src/ui/*` additions, and the field guide content.

## 7. Contract and data-plan change requests

Send these to the lead before building a divergent client. Each lists the reason, the consumers affected and acceptance cases.

| ID | Request | Why | Affects | Acceptance |
| --- | --- | --- | --- | --- |
| CR-M1 | Partly in BE-18 source (`PackageSummary` gained `format`, `zone_contract_version`, `map_revision`; list takes `supported_format`). Still freeze an observer-readable `GET /v1/projects/{p}/packages/{package_id}` with `site_id`, `site_code`, `version`, `format`, `zone_contract_version`, `archive_bytes`, `archive_sha256`, form bindings, and an `is_current` or `superseded_at` hint | Re-downloading a pinned old version and showing "v8 available" need exact metadata without the site list. Today PackageDetail has no format-2 fields (`backend/src/fieldmaps_api/schemas.py:167-184`) | Mobile recovery and update detection; web history | An observer fetches a superseded package's metadata; the digest verifies; a viewer and observer of another project get 404 |
| CR-M2 | Name the endpoint for an observer to fetch a bound package's exact play and inventory definitions by `form_version_id`, retired versions included | `prepare.ts::publishedForm` rejects retired versions; exact-version recovery needs them (data plan) | Mobile prepare/recovery | Retired bound form returns 200 to an authorized observer; unbound retired form stays refused for new maps |
| CR-M3 | In BE-18 source: `SiteV2.package` is the current package with `format`, and `zones` add `zone_id`, `zone_code`, `display_anchor`, `geometry_sha256` (`zone_response_schemas.py`). Write that meaning into contract.md so it stays frozen | Pre-download labels and "v8 available" depend on it | Mobile Project/Site screens; web | Fixture site with v7 installed and v8 current renders "v8 available" from the v2 list only |
| CR-M4 | Add an upload action matrix (HTTP, code, retry / rejected / sign-in, needs-attention) covering `idempotency_conflict`, `conflict`, `payload_too_large`, `not_found`, `account_deleted`, `membership_required` and each 422 issue code; and decide what an observer may do with a rejected immutable bound record (keep only, discard, or re-create under a new UUID) | Today an unknown code retries forever (`src/data/api/errors.ts:73`); records cannot change under their UUID (contract fingerprint) | Mobile errors, coordinator, Observations UI | Each code lands in the documented state in a unit test; the UI shows the documented action set |
| CR-M5 | Add diagonal shared-edge, three-zone shared-vertex and non-axis-aligned near-edge cases to `coverage_cases`, state the client predicate (exact, no epsilon), and confirm a UI-only near-edge hint is allowed | All 16 current cases use axis-aligned edges with exactly representable coordinates | Mobile `coveringZones`; web editor hints | New cases pass in the mobile adapter, the web adapter and SQL |
| CR-M6 | Name `package_version` (integer, shown `v{n}`) as the version people see. The BE-18 source sets `map_revision` equal to the version for format 2 and null otherwise; say so in contract.md, or drop the field | Two names for one label (contract "Package format 2"); the DB sets them equal (`20261011122000_zone_publication.sql:202`) | Mobile labels; web labels | One field drives every "map vN" label |
| CR-M7 | Record the session and adoption policy (MUI-1, MUI-2) in the master plan's update table: new sessions use the newest verified installed version; older versions only through an unfinished observation | The contract permits superseded uploads but does not say who may start new sessions on them | Mobile Brief; manager reports | Lead-approved row; Brief behaviour matches it |
| CR-M8 | Add a shared `placement` state kind to `contracts/contour.json` (inside, onEdge, otherZone, outside), or approve custom StateBadges for these four | DESIGN says states are a fixed vocabulary; mobile allows custom badges and the web does not (`mobile/src/ui/StateBadge.tsx:32-39` versus `web/src/lib/contour.ts:29-33`) | Both apps, if the web ever shows membership | `pnpm tokens:check` passes; both galleries show the states in Day and Dusk |
| CR-M9 | State that a bound inventory record stores the manifest `display_anchor` locally, for display only, and that it is excluded from the v2 body | The record schema requires coordinates (`domain/observation.ts:19`), and the contract removes them for v2 inventory | Mobile domain, serializer, maps | A bound inventory is never a marker; the v2 body has no coordinates |

## 8. Tasks

Status lives in [PLAN.md](PLAN.md). Summary:

| Task | Owner | Depends | Builds |
| --- | --- | --- | --- |
| MOB-30 | Claude mobile UI | MOB-28 | Version labels on Projects, Project, Site and Brief; update Notes; per-part download progress; older versions; reference-checked removal UI; check for updates; account-switch reset |
| MOB-31 | Claude mobile UI, data agent reviews parity | MOB-28 | `coveringZones`, `nearEdge` and the `coverage_cases` adapter; placement states; bound Place and Save gates; edge choice; inventory tap candidates; spotlight hole fix; header and Saved version labels |
| MOB-32 | Claude mobile UI | MOB-28 | Unfinished-observation statuses and actions; the Brief start block; field guide sections |
| MOB-29 | Data agent with Claude UI | MOB-28, BE-19, MOB-30, MOB-31, MOB-32 | Bound upload, receipts, needs-attention codes and copy (section 4.5), and the physical-device acceptance |

Order: MOB-28 lands the catalog, references, fencing and format-2 parsing. MOB-30, MOB-31 and MOB-32 then run in parallel on disjoint files (section 6). MOB-29 integrates and runs the device scenario. If a task runs past five days, split it rather than stretching it.

## 9. Verification

Automated (local, no hosted services):

- `pnpm mobile:check` and `pnpm mobile:test`.
- Vitest: `coveringZones` against every `coverage_cases` entry (unordered set) and the CR-M5 additions; `nearEdge` thresholds at zoom 18, 20.5 and 22; the placement-state reducer for all five states, both map kinds and the save re-check; the Recovered-status-to-card mapping; SiteVersions-to-row-label mapping (installed v7 + available v8, failed v8, needs-redownload v7, format-1 legacy note shown and hidden).
- Component tests (react-test-renderer, already used in `hosted/provider.test.tsx`): PlaceStep renders each state's readout, choice and disabled reason; the Brief start block; UnfinishedCard statuses.
- Upgrade fixture: open a v3 SQLite database containing a v1 record and a draft. After MOB-28's migration the UI lists both with their old version labels, and nothing is rewritten.

On a simulator (iPad and phone, portrait and landscape, left and right hand):

- Each placement state, reached by moving the × across `geometry.cases.json` style fixtures loaded as a local package.
- Large text, VoiceOver (iOS) and TalkBack (Android emulator) through Place → choice → Save.
- Account switch during a download: the second account sees no first-account state.

Physical device (release gate, owned by MOB-29 and QA-07). Run on a real iPad and a real Android tablet, and record the build, commit and device:

1. Download v7. Turn on airplane mode. Start a session, place a point near a shared edge, choose the zone, answer two questions. Force-quit.
2. On the manager web, publish v8 with a changed boundary and label.
3. Reopen. Resume the unfinished observation on v7: same zone, point and answers. Save. Record an inventory.
4. Reconnect. The Site screen shows "v8 available". The Brief still says v7 until v8 is downloaded. Try to remove v7 while records are unsent: it is refused, with the reason.
5. Download v8. Start a new session: the header says map v8. Saved v7 records still say v7.
6. Repeat with a failed or cancelled v8 download (v7 stays ready), and with a v8 that fails verification.
7. Screenshots of every state in daylight on the tablet.

Done evidence: the commands above with output, simulator screenshots per state, and a device run log. A green unit suite does not stand in for missing device evidence: mark it pending. Native builds from this checkout have hit a code-signing failure before (see `mobile/README.md`), so the device run may need the user's own terminal.

## 10. Open questions for the lead

1. MUI-1: session as one collect visit (recommended) or a durable multi-visit session?
2. MUI-2: confirm delayed adoption with no older-version choice for new sessions.
3. MUI-3: does a preselected session zone on a shared edge count as an explicit choice?
4. MUI-3: allow the UI-only near-edge hint?
5. MUI-4: confirm a zone is required for every new bound point (no zone-free capture).
6. CR-M4: what may an observer do with a rejected bound record?
7. CR-M8: add a `placement` state kind to Contour, or allow custom badges?
