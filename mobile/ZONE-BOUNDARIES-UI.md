# Mobile UI plan: collecting on pinned zone boundaries

[Mobile data plan](ZONE-BOUNDARIES.md) · [Master plan](../docs/plan/zone-boundaries/README.md) · [Contract](../docs/plan/zone-boundaries/contract.md) · [Web UI plan](../web/ZONE-BOUNDARIES-UI.md) · Tasks MOB-30, MOB-31 and MOB-32 (UI), MOB-28, MOB-33 and MOB-29 (data) in [PLAN.md](PLAN.md)

Implementation checkpoint, 2026-10-15: MOB-30 to MOB-32 are implemented and component-tested against MOB-33’s real read models. Simulator screenshots, phone/tablet VoiceOver and restart/recovery walkthroughs remain pending. MOB-29’s immutable bound upload, receipt/rejection and foreground reconnect path is implemented and locally verified through automated and disposable API/QGIS acceptance and the physical iPad/Android collector scenario remains pending ([evidence](../docs/reviews/mob29-2026-10-15/README.md)). Task status is owned only by [PLAN.md](PLAN.md); see the [current roadmap](../docs/plan/current-state.md).

DB-19 and BE-22 supply the current baseline and sole `/v1` API. MOB-28’s real package installation/restart gate passed against a disposable live API on 2026-10-13 ([evidence](../docs/reviews/zone-boundaries-2026-10-13/mob28-mob33.md)). [PACKAGE-LIFECYCLE.md](PACKAGE-LIFECYCLE.md) defines the implemented storage/recovery interfaces; [MOB-33-HANDOFF.md](MOB-33-HANDOFF.md) defines the acknowledged UI interface. The original inspection table below is historical, not a current defect list.

**Pre-launch rule (2026-10-11):** there are no real users:

- every archive uses the sole zone-aware manifest `format: 1`; every new observation binds site/package/zone UUIDs and uploads through `PUT /v1/projects/{p}/observations/{id}`;
- every map starts at version 1 and current-schema historical work keeps its exact map, forms and recorded labels;
- a schema mismatch resets incompatible SQLite data and package caches; ordinary same-schema restarts retain work.

Line references below describe the inspection baseline and can drift. Re-read the cited function before editing it; MOB-28 has already replaced several baseline behaviors.

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

## 2. Historical inspection baseline (2026-10-11)

| Area | Today | Evidence |
| --- | --- | --- |
| Crosshair placement | A fixed × with a lifted pin. The map moves under it. A tap recentres the map, the nudge pad moves 0.5 m, and "Place point here" reads the exact native centre. Keep all of this. | `src/features/collect/CollectMap.tsx:507-514,418-435`, `PlaceStep.tsx:42-53,173-207`, `CollectScreen.tsx:210-218` |
| Zone readout while aiming | "In Zone B" / "Outside Zone B · in Zone C" / "Outside Zone B", from `zoneAt`. It only advises: placing and saving are never blocked. The record always takes the session zone. | `PlaceStep.tsx:118-150,198-207`, `session/provider.tsx:201-212,396-417` |
| Edge membership | Half-open ray casting. A square owns its left and bottom edges but not its right and top; holes are the reverse. It disagrees with `ST_Covers` on 4 of the 16 shared `coverage_cases` (both shared edges, hole edge, hole vertex). On a shared edge, `zoneAt` cannot return the preferred zone. | `src/maps/geometry.ts:39-72`; scratch run of the unmodified file against `contracts/zones/geometry.cases.json` |
| Missing polygon | Falls back to the bounding box. The "Zone boundaries" readiness part passes on zone count alone. | `src/packages/hosted/build.ts:136-152`, `src/maps/geometry.ts:19-37`, `src/packages/open.ts:57` |
| Installed versions | One file per package, at a global path. Refresh replaces the site list wholesale. `isStored` only checks the current package, so an installed v1 reads as "Not downloaded" once v2 is published. Brief refuses a session whose package differs from the site list's. | `src/packages/hosted/provider.tsx:115-129,218-221`, `device.ts:26-28`, `brief.tsx:107` |
| Remove | Deletes the current package's file without checking drafts, unsent records or other accounts, and does not abort a running download. | `src/packages/hosted/provider.tsx:185-195` |
| Draft resume | Reopens `draft.packageId`. If the saved zone is missing, it silently uses `zones[0]`. It never compares package version, form version or site. | `session/provider.tsx:461-494` (fallback at 476-478) |
| One draft per account | Starting a new observation while a recovered draft is offered overwrites that draft. | `session/provider.tsx:331,337`, `storage/draft-store.ts:37-45` |
| Version labels | Project row subtitle (when ready), the Site PackageIsland title, the Brief locked line "MAP vN · FORM x stay locked for this session", and the map overlay. The overlay is replaced during placing. The collect header has none. | `readiness.ts:39-87`, `[site].tsx:241-377`, `brief.tsx:245-258`, `CollectScreen.tsx:280-285,417-425` |
| Inventory | Stored at a client-computed `zoneAnchor`, never drawn as a marker, zone picked from a list or by a map tap (`zoneAt`, first match). | `session/provider.tsx:349-353`, `records.ts:28`, `CollectMap.tsx:515-521` |
| Refresh errors | Recorded but never shown. No manual refresh. | `src/packages/hosted/provider.tsx:41-42,124-126` |
| Download progress | During a hosted download the four checklist rows stay "Waiting"; only the bar says "Part N of 4". | `[site].tsx:137-141` |
| Server side (BE-22 target) | The sole `/v1` site list returns the explicit current package pointer and exact package/zone metadata. A zone-aware `format: 1` manifest pins UUID site/package identities, integer map version, exact play/inventory forms and server anchors/digests. Publication returns a ready downloadable archive. Historical packages and exact retired bound forms remain readable to authorized project members. | [Canonical contract](../docs/plan/zone-boundaries/contract.md), [backend specification](../backend/ZONE-BOUNDARIES.md) |
| Primitives | `Note` (tone, glyph, title, action, live region), `StateBadge` (contract or custom), `RadioRows`, `Segmented`, `StatusLine` with `announce()`, `Island`, `Button`. No sheet primitive; the declared `explain/[question]` sheet has no route file. | `src/ui/index.ts`, `app/(app)/_layout.tsx:28-36` |

The table records the earlier inspection. MOB-28 now installs immutable versions, checks removal references and preserves exact recovery context; it also fences account changes; MOB-29 now persists immutable bound bodies and activates their foreground queue while bundled practice remains held locally. Review [PACKAGE-LIFECYCLE.md](PACKAGE-LIFECYCLE.md) before wiring screens. Edge coverage is now shared through exact `zoneCovers`, including sloping-edge regressions; see [the resolved handoff](MOB-31-HANDOFF.md). MOB-29 retains verification of the implemented transport and integrated acceptance. The UI uses the stored integer package version and UUIDs, never parses identity or numbers from display labels.

## 3. Decisions

Each decision gives the choice, then why, then what would change it. "Lead" marks a product default the lead must confirm or replace (master plan, "Product defaults needing explicit visibility").

### MUI-1 A session is one visit to the collect screen

A session starts at "Start collection" on the Brief and ends when the observer leaves the collect screen with no unfinished observation. While it runs, the opened package never changes. An unfinished observation keeps its own package after the session ends, through restarts, until it is saved or discarded.

The next session opens the **newest verified package installed on the device** for that site. That is not necessarily the site list's current package: if v2 is published but not downloaded, the next session uses v1 and says so.

Why: the Brief already promises "MAP v1 · FORM x stay locked for this session", and observers already think of the collect screen as the session. Downloads are manual (the observer taps Download), so the observer controls when a new version reaches the device, and the Brief states which version the next session will use. This needs no new "End session" control. Only the draft has to survive process death, and it already carries its package (`draft-store.ts:15-29`).

**Decided 2026-10-11:** this option, with the data plan amended to match (ZONE-BOUNDARIES.md, MOB-29). Only the unfinished observation survives a restart. `references.openSession` means "the collect screen has this package open now".

### MUI-2 Delayed adoption, never forced mid-work (Lead: confirm)

- A newer published version is announced on the Projects row, the Site screen and the Brief only.
- Downloading v2 never changes an active session or an unfinished observation.
- When v2 is verified on the device, the next session uses it. Starting a new session on an older installed version is not offered, except by resuming an unfinished observation pinned to it.
- When v2 is published but not downloaded, collection on v1 stays allowed, with a waiting Note. Blocking offline collection would lose fieldwork, and the server accepts uploads bound to superseded packages (contract, "New observation protocol").

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
| Outside every zone | C = ∅ (gap, hole or outside the site) | "Outside every zone on map v1" | Disabled: "Move the × into a zone." |

- The choice is a `Segmented` for two or three candidates and `RadioRows` for more. Choosing a zone uses the existing `switchZone` path (haptic, announce), so it changes the session zone, as "Switch to Zone C" already does (`CollectScreen.tsx:227-231`). The header shows the result.
- **Preselecting S on an edge (Lead: confirm):** the contract forbids an implicit first match (contract "Point attribution"). The session zone is the observer's own earlier choice, shown on screen when they confirm the point. It is not list order. I treat it as explicit. If the lead disagrees, show the edge choice with nothing selected; the cost is one extra tap, only on exact edges.
- **Near-edge hint (UI only, Lead: confirm):** exact edges are almost unreachable with a float crosshair and a 0.5 m nudge, while points a few centimetres from a line are assigned silently. When the × is within 8 screen points of any zone edge at the current zoom, add "Close to the edge of Slide. Zoom in to check." It never changes candidates, validity or the stored record. It only suggests zooming in. Contract gap CR-M5 asks the lead to confirm that a UI-only hint is allowed.
- Amended 2026-10-14 (MOB-31), as built: `coveringZones` filters with the data agent's `zoneCovers` (`src/maps/zone-boundaries.ts`) instead of a second predicate in `geometry.ts`, so collect and the MOB-29 save gate cannot disagree; it passes every `coverage_cases` entry. The choice is a `Segmented` only when a zone is already chosen (on an edge, the session zone) and there are two or three candidates; between other zones nothing is chosen, so it is `RadioRows`, as it is for four or more. The readout is a `StateBadge` with a custom glyph, word and tone (CR-M8 default). The lead defaults stand until answered: the session zone counts as chosen on an edge, and the near-edge hint is shown.

### MUI-4 The bound save gate has two checkpoints and never loses work

1. **Place:** "Place point here" is disabled in the states above, with the reason as a visible line under the button (DESIGN §5: a disabled control carries its reason).
2. **Save:** ReviewStep checks `coveringZones(point)` contains the record's zone again, in case the zone changed after placing. If it does not, show an attention Note: "Not saved yet. The point is outside Slide on map v1. Adjust the point or switch zone. Your answers are kept." with "Adjust point". Disable "Save on this device" with the same reason.

"Adjust point" keeps every answer (as today). Leaving adjust without confirming keeps the previous point. The draft is written on every change the data agent persists. That includes a zone change, which today is not persisted (`provider.tsx:506-512`; MOB-28 must add it).

Lead default: a zone is required for new bound points. A zone-free point option (for example "Record outside the zones") changes the contract (`zone_id` is required in the sole `/v1` envelope) and this table.

### MUI-5 Version labels are always visible and come from the pinned package

- Collect header: "North meadow · Standard · map v1". The version is in mono and stays visible during placing.
- Brief locked line: unchanged wording, fed from the package the session will open.
- Saved card: a "Map and form" fact, "Map v1 · form janet-test-v1".
- Observations list and detail: "map v1" from the record's frozen context.

Labels use `package_version` as an integer formatted `v{n}` (CR-M6). Installed labels come from each stored package's own manifest, never from the site list (the current MOB-30 screens consume stored-version read models).

### MUI-6 Removal is per installed version and reference-checked

The Site screen lists "Older maps on this device". Each row shows what still uses it. "Remove map v1" is enabled only when nothing does. Otherwise it is disabled with its reason: "Used by 1 unfinished observation and 3 records not uploaded yet." The data agent's `remove()` must re-check and refuse (MOB-28), so the UI check is only a preview. Removing the currently selected newest version follows the same rule.

Automatic cleanup of unreferenced superseded versions is a data-layer retention policy (MOB-28). The UI only needs to say "Older maps are removed from this device once nothing uses them" if that policy is adopted.

### MUI-7 Recovery never substitutes

Unfinished observation states, driven by a typed status from the data layer (section 6):

| Status | Card text | Actions |
| --- | --- | --- |
| Ready | "Unfinished observation · map v1 · North meadow · Point placed, 3 of 8 answered. Kept on this device." | Resume (opens v1 pinned), Discard draft |
| Map missing, can download | "Map v1 is not on this device. Your point and answers are kept." | "Download map v1 again · 12 MB", Discard draft |
| Map missing, offline | Same first line, then "Connect to download map v1 again." | Discard draft |
| Map no longer available to you | "Map v1 cannot be downloaded with your current access. Your point and answers stay on this device. Ask your coordinator." | Discard draft |
| Zone missing from map | "This observation's zone (NM) is not in map v1 on this device. Your point and answers are kept. Download map v1 again." | Download again, Discard draft |
| Form missing | "Form janet-test-v1 for this observation is not on this device. Download map v1 again." | Download again, Discard draft |

There is one draft slot per account today (`draft-store.ts:37-45`). A draft that cannot be resumed (map missing while offline, access gone, zone or form missing) must not block all collection until the observer discards research answers. MOB-33 therefore adds parked drafts, keyed by draft ID:

- "Keep for later" parks an unresumable draft and frees the active slot without discarding it. Parked drafts appear on the Projects screen, with Resume when it becomes possible.
- "Start collection" is disabled only while a resumable draft holds the active slot. The reason names its place and links to it: "Resume or discard the unfinished observation at Riverside (map v1)."
- Amended 2026-10-14 (MOB-32), as built: the ready card keeps the existing layout, eyebrow "Unfinished observation", title "North meadow · map v1", then "Point placed, 3 of 8 answered. Kept on this device." The form-missing line names the draft's own form from `Recovered.formVersion` (added by the data agent on 2026-10-14, wired by the UI owner the same day): "Form janet-test-v1 for this observation is not on this device. Your point and answers are kept." It never names a form from a newer map. Every status that cannot resume also offers "Keep for later", or "Keep for your coordinator" when a download cannot help. The Brief's reason names the site and map but does not link; the card itself is above the form.
- For `zone_missing` or `form_missing` on a digest-verified package, a new download cannot help. Offer "Keep for your coordinator" (park) and Discard, not "Download again".
- A recovery download queues behind a running download of the same site.

Discard always uses `Alert.alert` with "Discard draft" / "Keep draft" (existing pattern).

### MUI-8 Account changes reset visible state

On account change (the existing `accountKey` path): leave the collect screen, clear the Site and Brief view state, and show no other account's packages, drafts or downloads. Today downloads and the downloads map survive a switch (`hosted/provider.tsx:94-113`), and the session keeps `sitePackage` and zone (`session/provider.tsx:268-286`). MOB-28 fences the data. The UI only renders what the fenced hooks return.

Sign-in and permission copy keeps preserved work separate from permission to upload:

- Signed out: "Signed out. 5 records stay on this device and upload after you sign in."
- Access removed: "You no longer have access to Play Study. 5 records stay on this device. They upload only if a manager adds you back."

### MUI-9 Inventory stays whole-zone

- ZoneStep keeps its `RadioRows` (`ZoneStep.tsx:45-116`).
- A map tap uses `coveringZones`. One candidate selects it. Several candidates leave the selection unchanged and say "That spot is on the edge of A and B. Choose one in the list."
- Bound inventories never show a point, in the collect map, the records map, the Saved card or the Observations detail.
- Label pills and any inventory display anchor use the manifest's `display_anchor`. Delete the client `zoneAnchor` computation (contract: clients never recompute an anchor).

### MUI-10 Where messages live (no mid-observation prompts)

| Place | Message |
| --- | --- |
| Projects row | "2 sites ready offline · map update for 1 site" |
| Project site row | Badge "Ready offline". Subtitle "3 zones · map v1 · v2 available · 12 MB" |
| Site screen | Update Note, download progress per part, older versions, last check, check now |
| Brief | Which version this session uses, and why it differs from the last session or from the published version |
| Collect | Only the header label and placement readout. No update prompts. |
| Saved | The version fact. No prompts. |

Suggested copy (field language):

- Site, newer available: "Map v2 is available. Download it now to use it from your next session. Your unfinished and saved observations keep map v1."
- Brief, v2 on device: "This session uses map v2. Earlier observations keep map v1."
- Brief, v2 published but not on device: "This session uses map v1, the newest map on this device. Map v2 has been published. Download it when you have a connection."
- Site, download failed: "Map v2 did not finish downloading. Map v1 is still on this device and ready."
- Site, verification failed: "Map v2 could not be checked: zone Slide has no boundary. Map v1 stays on this device. Tell your coordinator."
- Site, refresh failed: "Could not check for map updates. Showing what this device knew at Oct 10 · 09:12."

### MUI-11 Site list failures

The site list is `GET /v1/projects/{p}/sites` in its BE-22 shape; there is no older-server fallback. A 404 means the project is no longer visible to this account (`refreshProblem: "no_access"`). Offline, 401 and 5xx are transient. Every failure keeps the cached list and the installed maps, and shows the refresh problem on the Site screen.

## 4. Screen-by-screen changes

Keep layouts and primitives. One primary action per screen (DESIGN rule 01). Targets of 48 pt or more in the collector. Text follows the device size, and labels wrap.

### 4.1 Projects list and Project screen

- Readiness comes from the verified catalog (MOB-28), not file existence (`hosted-sites.ts:50-56` today).
- Add the update count to the row subtitle (MUI-10).
- Keep current readiness/empty-state copy driven by MOB-33’s read models; the original package-delivery-absent copy is obsolete.
- Replace the pseudo-percent download badge with "Downloading · part 2 of 4" (`readiness.ts:47,76-79`).

### 4.2 Site screen (`app/(app)/(tabs)/(projects)/[project]/[site].tsx`)

PackageIsland, top to bottom:

1. Title "Map package v1" (the newest verified installed version) with badge "Ready offline", or "Not downloaded".
2. Waiting Note when a newer version is available (MUI-10), with "Download v2 · 12 MB" (outline). The size comes from the site list package (`archive_bytes`).
3. While downloading: ProgressBar plus the four checklist rows moving Waiting → Downloading → Verified. Fix the device-mode rows to use the per-part states (`[site].tsx:137-141`). Then "Cancel download".
4. Failure or verification Notes (MUI-10). The older version stays ready.
5. Primary "Set up this session". It opens the newest verified installed package (not `site.packageId`, `[site].tsx:143-162`).
6. "Older maps on this device" list (MUI-6), shown only when more than one version is installed.
7. Footer: "Checked for updates Today · 09:12" with "Check for updates" (TextLink). It calls the fenced refresh.

The removal confirm keeps "Remove Riverside map v1 from this device?" and adds what stays: "Saved observations stay on this device." Bound foreground uploading is implemented in source under MOB-29; local automated/disposable API/QGIS acceptance passes; physical-device acceptance remains pending.

### 4.3 Brief (`…/[site]/brief.tsx`)

- Render whenever a verified package is selected for the site. Drop the `sitePackage.id === site.packageId` equality (`brief.tsx:107`).
- Version Note per MUI-10, above the locked line.
- UnfinishedCard (MUI-7) above the form when an unfinished observation exists for this site, and the "Start collection" disabled reason.
- Zone RadioRows unchanged. Labels come from the pinned package.

### 4.4 Collect (`src/features/collect/`)

- Header detail adds "map v1" (MUI-5).
- PlaceStep: replace the ad-hoc readout (`PlaceStep.tsx:118-150`) with a `StateBadge` (custom glyph, word and tone, or a new contract kind; see CR-M8). Then the candidate choice and the disabled reason. The live region stays polite while aiming. `useAimZone` (`CollectMap.tsx:895-903`) returns `{candidates, status, nearEdge}` and keeps its 100 ms throttle.
- Map: highlight candidate zones with palette means only (heavier `zone.edge` dashes, using the existing focus layer pattern). No UI state colour on the map (rule 03). Fix the spotlight so zone holes are dimmed (`geometry.ts:184-189`); the MOB-31 spotlight fix now dims holes.
- ReviewStep: the save gate Note (MUI-4).
- SavedStep: the version fact. "Place the next observation" is unchanged.
- ZoneStep: tap candidates (MUI-9).
- Keep the map mounted across steps (DESIGN §8).

### 4.5 Observations tab and record detail

- Version label per record.
- Needs-attention copy for bound rejections, keyed by error and issue code (the data agent stores structured codes; data plan MOB-29). Draft copy:
  - `point_outside_zone`: "Needs attention. DECA Mark did not accept North meadow for this point on map v1. The record keeps its number and stays on this device. Tell your coordinator."
  - `zone_not_in_package`, `package_not_in_site`, `package_not_ready`: "Needs attention. DECA Mark could not match map v1 for this record. It stays on this device. Tell your coordinator."
  - `form_not_in_package`: "Needs attention. The form on this record does not belong to map v1. It stays on this device. Tell your coordinator."
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

The UI does not write storage, domain, sync or package code. It asks for these read models and actions. MOB-33 (data agent) writes them in `src/packages/zone-read-models.ts`, with hooks `useSiteVersions(siteId)` and `useRecoveredDraft()` and an in-memory fake for UI tests. It also extends `SiteZone` with `zoneId: string` and `displayAnchor: [number, number]`, and removes the box fallback. The UI owner acknowledges the file before MOB-30 to MOB-32 build on it. Names may change; each field's meaning may not.

```ts
// Per site, scoped to the signed-in issuer/account/project; fenced against account switches.
type SiteVersions = {
  available: { packageId: string; version: number; archiveBytes: number } | null; // site list current
  installed: Array<{
    packageId: string;
    version: number;
    status: "verified" | "needs_redownload";
    bytes: number;
    installedAt: string;
    references: { unfinished: number; unsent: number; attention: number; openSession: boolean };
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
type Pinned = { packageId: string; version: number; siteId: string /* UUID */; zone: { id: string; code: string; label: string } };
type Recovered = {
  draftId: string; pinned: Pinned; placed: boolean; answered: number; asked: number;
  status: "ready" | "package_missing" | "package_unavailable" | "zone_missing" | "form_missing";
  parked: boolean;
  redownload: { possible: boolean; bytes: number | null };
};

// Pure geometry, owned by MOB-31 in src/maps/geometry.ts
coveringZones(point: [number, number], zones: SiteZone[]): SiteZone[];
nearEdge(point, zones, metresPerPoint, thresholdPoints = 8): SiteZone | null;
```

Shared hotspot files: `src/session/provider.tsx`, `src/packages/hosted/provider.tsx`, `src/data/api/client.ts` and `src/storage/*`. The data agent writes them. The UI agent changes them only by a written request answered by the data agent, one file at a time, with no overlapping edits. Shared adapters `src/features/preview/*` and `src/maps/sample-site.ts` change only through MOB-33 or with the data agent's agreement. UI-owned files: `src/features/collect/*`, `src/features/projects/*`, the route screens under `app/(app)/(tabs)/(projects)/**` and `app/(app)/collect.tsx`, `src/maps/geometry.ts` (predicate and spotlight only), `src/ui/*` additions, and the field guide content.

## 7. Contract decisions and remaining change requests

Reconciled 2026-10-15. Implemented decisions below are not requests to rebuild the client. CR-M4 and shared cross-layer case additions remain acceptance work; no new policy approval is implied by this documentation update.

| ID | Request | Why | Affects | Acceptance |
| --- | --- | --- | --- | --- |
| CR-M1 | Closed. In the single-path contract: package detail and archive are readable by any project member, with forms, version and digest (BE-22) | Recovery of a pinned older version | Mobile | — |
| CR-M2 | Implemented by MOB-28/MOB-33: recover exact bound forms from the verified package and authorize historical retired definitions; see [data handoff](MOB-33-HANDOFF.md) | No substitution by current forms | Mobile prepare/recovery | Current package installation/restart accepted locally; physical recovery remains pending |
| CR-M3 | Closed. In the single-path contract: the site list's `package` is the current package and `zones` carry `zone_id`, `zone_code`, `label`, `display_anchor` and `geometry_sha256` | Labels before download | Mobile, web | — |
| CR-M4 | MOB-29 implements sign-in pause, transient retries, permanent needs-attention state and structured top-level/issue codes. Explicit retry resends the same immutable body; it does not edit or relabel the record. Broader correction/re-creation UX remains a separate decision | Unknown/malformed errors retain work for retry; bound UUID/body is immutable | Mobile errors, coordinator, Observations UI | Automated and disposable API rejection acceptance passes; native observer-copy acceptance remains pending |
| CR-M5 | Add diagonal shared-edge, three-zone shared-vertex and non-axis-aligned near-edge cases to `coverage_cases`, state the client predicate (exact, no epsilon), and confirm a UI-only near-edge hint is allowed | All 16 current cases use axis-aligned edges with exactly representable coordinates | Mobile `coveringZones`; web editor hints | New cases pass in the mobile adapter, the web adapter and SQL |
| CR-M6 | Closed. In the single-path contract: `package_version` (shown `v{n}`, from 1) is the only version label | One label | Mobile, web | — |
| CR-M7 | Implemented policy: each collect visit uses the newest verified installed version; unfinished work resumes its exact older version. See [data handoff](MOB-33-HANDOFF.md) | New publication never replaces current work | Mobile Brief/recovery | Simulator/device replay remains pending |
| CR-M8 | MOB-31 uses custom `StateBadge` glyph/word/tone under the documented default in MUI-3 | A vocabulary extension is not a remaining data blocker | Mobile placement | Native Day/Dusk/VoiceOver acceptance remains pending |
| CR-M10 | In progress. MOB-28 supplies one local schema and mismatch reset; CON-06, DB-19 and BE-22 establish the current server contract. MOB-29 implements the sole `/v1` uploader; practice observations remain held locally | Pre-launch rule | Mobile, backend, contracts | One upload path; fresh-install and real API acceptance pass |
| CR-M9 | Data contract and MOB-33 retain the exact display anchor locally; Inventory has no event coordinate | Display aid is not a point event | Mobile domain, serializer, maps | MOB-29’s source serializer omits Inventory coordinates and first-round; disposable API acceptance passes, while physical-device acceptance remains pending |

## 8. Tasks

Status lives in [PLAN.md](PLAN.md). Summary:

| Task | Owner | Depends | Builds |
| --- | --- | --- | --- |
| MOB-33 | Data agent | MOB-28, BE-22 | Site discovery (MUI-11), package readiness with no box fallback, the frozen bound session context with zone UUIDs, exact-version form loading, parked drafts, persisting zone changes on an open observation, and `src/packages/zone-read-models.ts` with its fake |
| MOB-30 | Claude mobile UI | MOB-33 | Version labels on Projects, Project, Site and Brief; update Notes; per-part download progress; older versions; reference-checked removal UI; check for updates; account-switch reset |
| MOB-31 | Claude mobile UI, data agent reviews parity | MOB-33 | `coveringZones`, `nearEdge` and the `coverage_cases` adapter; placement states; bound Place and Save gates; edge choice; inventory tap candidates; spotlight hole fix; header and Saved version labels |
| MOB-32 | Claude mobile UI | MOB-33 | Unfinished and parked observation statuses and actions; the Brief start rule; field guide sections |
| MOB-29 | Data agent with Claude UI | MOB-33, BE-22, MOB-30, MOB-31, MOB-32 | Bound upload, receipts, needs-attention codes and copy (section 4.5), and the physical-device acceptance |

Order: MOB-28 lands the catalog, references and fencing. MOB-33 adds the bound read models. MOB-30, MOB-31 and MOB-32 then run in parallel on disjoint files (section 6), each starting against the MOB-33 fake. MOB-29 integrates and runs the device scenario. If a task runs past five days, split it rather than stretching it.

## 9. Verification

Automated (local, no hosted services):

- `pnpm mobile:check` and `pnpm mobile:test`.
- Vitest: `coveringZones` against every `coverage_cases` entry (unordered set) and the CR-M5 additions; `nearEdge` thresholds at zoom 18, 20.5 and 22; the placement-state reducer for all five states, both map kinds and the save re-check; the Recovered-status-to-card mapping; SiteVersions-to-row-label mapping (installed v1 + available v2, failed v2, needs-redownload v1).
- Component tests (react-test-renderer, already used in `hosted/provider.test.tsx`): PlaceStep renders each state's readout, choice and disabled reason; the Brief start block; UnfinishedCard statuses.
- No upgrade fixtures: a schema change resets local data (pre-launch rule).

On a simulator (iPad and phone, portrait and landscape, left and right hand):

- Each placement state, reached by moving the × across `geometry.cases.json` style fixtures loaded as a local package.
- Large text, VoiceOver (iOS) and TalkBack (Android emulator) through Place → choice → Save.
- Account switch during a download: the second account sees no first-account state.

Physical device (release gate, owned by MOB-29 and QA-07). Run on a real iPad and a real Android tablet, and record the build, commit and device:

1. Download v1. Turn on airplane mode. Start a session, place a point on a shared edge, choose the non-session zone, and force-quit immediately. Reopen: the chosen zone is restored. Answer two questions. Force-quit again.
2. On the manager web, publish v2 with a changed boundary and label.
3. Reopen. Resume the unfinished observation on v1: same zone, point and answers. Save. Record an inventory.
4. Reconnect. The Site screen shows "v2 available". The Brief still says v1 until v2 is downloaded. Try to remove v1 while records are unsent: it is refused, with the reason.
5. Download v2. Start a new session: the header says map v2. Saved v1 records still say v1.
6. Repeat with a failed or cancelled v2 download (v1 stays ready), and with a v2 that fails verification.
7. Screenshots of every state in daylight on the tablet.

Done evidence: the commands above with output, simulator screenshots per state, and a device run log. A green unit suite does not stand in for missing device evidence: mark it pending. Native builds from this checkout have hit a code-signing failure before (see `mobile/README.md`), so the device run may need the user's own terminal.

## 10. Decisions to retain and remaining integration question

The implemented defaults are newest verified map for a new visit, exact older map for unfinished work, the session zone preselected on a shared edge, an informational near-edge hint, a required covering zone for bound points, and custom placement badges. These are recorded above and in [MOB-33-HANDOFF.md](MOB-33-HANDOFF.md); they do not block MOB-29.

CR-M4’s machine retry/rejection handling is implemented and locally verified under MOB-29. Retry resends the same immutable UUID/body; records do not offer answer correction under that UUID. Any broader correction/re-creation UX remains a separate decision. Simulator/VoiceOver and physical-device replay remain pending. Current disposable API exports have native QGIS readback acceptance; general scoped live-reader provisioning remains separate.
