# DECA Mark product context

Who DECA Mark is for, what it must never claim, and how it speaks. Every UI change and the impeccable design skill read this file first. How it looks is in [DESIGN.md](DESIGN.md) and [`contracts/contour.json`](contracts/contour.json). Roles and journeys are owned by [docs/plan/product.md](docs/plan/product.md), and the pages and decisions U1–U10 by [docs/ux/sitemap.md](docs/ux/sitemap.md). This file summarises them for design work. If they disagree, those files win.

## Register

product

Product UI: the design serves the task. The landing and privacy pages use the same system and voice.

## What DECA Mark is

DECA Mark is offline field collection for research teams. A researcher on a playground marks where a child's play happened on a site map and answers a versioned, conditional form, usually with no signal. The record is saved on the device first and uploads when the app is open and connected. On the web, a project's managers prepare maps from QGIS, publish form versions, invite observers and review what came back. Analysts read the same observations as typed layers in QGIS or as exports. The pilot is Janet's playground study: Play Study, in the DECA Lab organization. Today the collector's form engine, drafts, SQLite queue, sync and sign-in are real, and so is the whole web workspace (D30): it reads and writes the API, with no fixture data.

## Design system

The design system is **Contour** (D19). **Day** is the default everywhere and **Dusk** is a preference: the web account menu, and "Screen: Day · Dusk" in mobile Preferences. Map canvases keep their own palette from `contracts/map-palettes.json` (Day, the default, and Night) per D18, and UI state colours never appear on a map. Type is Geologica for words and Spline Sans Mono for IDs, versions, codes and counts: "things you might read aloud". Icons are Lucide in both apps, plus a custom two-bar "held" glyph (D22). Tokens flow from `contracts/contour.json` through `scripts/contour-tokens.mjs` to `web/src/styles/contour.css` (generated and checked in). Mobile reads them in `mobile/src/ui/tokens.ts`. `pnpm tokens:check` fails on drift or contrast. Primitives live in `web/src/components/contour/*` and `mobile/src/ui/*`, and the galleries are web `/dev/contour` and mobile `app/(dev)/gallery`.

## Users

| Person                                           | Where and how                                                                                                                                                                       | The job                                                                                                                 | Register                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Field observer** (research assistant, student) | Phone or tablet, standing on a playground in daylight, often in direct sun. One hand free, sometimes gloves, usually no signal. Their attention is on the children, not the screen. | Place a point, answer one question at a time, save, and repeat. Never lose a record. Type as little as possible.        | **Field language**                                                                        |
| **Project manager / coordinator**                | Web, at a desk on a laptop or on an iPad                                                                                                                                            | Turn a QGIS project into map packages, publish form versions, invite observers, see what came back and what is blocking | **Research language**                                                                     |
| **PI / research lead** (Janet)                   | Web, QGIS, exports                                                                                                                                                                  | Form versions that never reinterpret old data, coverage against the protocol, and evidence to hand on                   | **Research language**                                                                     |
| **Viewer / GIS analyst**                         | Web (read only), CSV and GeoJSON exports, QGIS                                                                                                                                      | Read data and reports, export the permitted scope, and open stable typed layers                                         | **Research language**, with exact numbers                                                 |
| **Org owner / admin**                            | Web, at a desk, occasionally                                                                                                                                                        | Create the organization and its projects, manage members, own the data, settle deletions                                | Plain administrative language. Consequences come before any action that cannot be undone. |

- **Field language** is short and concrete, about the place and the device: "Place a point", "Save on this device", "Ready offline", "Riverside · North meadow · Round 1".
- **Research language** names the method precisely: coverage by zone and round, form version, protocol notes, publication, reader access, "Record abundance is not completeness". It is still plain sentences, never jargon for its own sake.
- **What the field implies for design.** Day theme first. Targets of 48–60 on the collector. One action to do now. Placement works without a precise tap ("Place at map centre"). Text follows the device text size. Labels wrap and never truncate.

## Roles

Authorization lives in the database and is checked on every request (D12).

| Level        | Role             | Can                                                                                                                                        |
| ------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Organization | **Owner**        | Everything an admin can, plus delete the org, manage admins and transfer ownership. Every org has at least one owner.                      |
| Organization | **Admin**        | Create projects, invite and remove members, and act as a manager on every project in the org                                               |
| Organization | **Member**       | Belong to the org. Project access comes from project roles.                                                                                |
| Project      | **Manager**      | "Manage forms, maps, team and publication": sites and map packages, form versions, invitations, members, exports                           |
| Project      | **Observer**     | "Collect observations in the native app": collect and upload, and read the project's sites, forms, map packages and their own observations |
| Project      | **Viewer**       | "Read data and reports; export the permitted scope". Team and Settings are hidden.                                                         |
| Project      | GIS reader grant | A per-project read-only login for QGIS (D10). This is not a user role.                                                                     |

- **Training.** Every new account joins the server Training project as an observer (D4, D13). It is for practising every step offline. Training observations are visible only to their creator, purged after 30 days, and never in research exports. On mobile its Practice garden is downloaded like any site.
- **The role is always visible.** The web header shows it in mono (MANAGER, ADMIN, OBSERVER). An observer who signs in on the web gets "You collect in the app".
- **Settings sit at three levels:** `/account` for everyone, org settings for owners and admins, and project settings for managers.

## Journeys the pilot must support

Full steps are in [docs/plan/product.md](docs/plan/product.md#journeys-the-pilot-must-support).

- **J1: The manager sets up a study (web).** Sign up, then enter the 6-digit code. The organization comes from the bootstrap script, and an owner or admin creates the first project on the organization's Projects page (D30). In Sites › Map packages, upload the QGIS export and inspect the checks; the newest ready package is the one observers download. In Forms, open the draft, review the publication and publish. In Team, create the 8-character observer join code (shown once) or an invitation. Overview then shows what came back, coverage by zone and round, and what is blocking.
- **J2: The observer collects (mobile).** Create an account and enter the code. Set the profile: name and initials, which become the observer code. Practise in Training. Join with the code or the invitation link. Download the site on Wi-Fi, with the size shown first; on cellular the app asks. "Before you begin" sets the zone, round and observer code, and the map and form versions stay locked for the session. Then Place → Answer → Review → Saved, with no transition between observations. Back online, records upload by themselves. A rejected record stays visible as "Needs attention" with its reason.
- **J3: The analyst reads (QGIS and exports).** The manager exports CSV or GeoJSON for a filtered scope, and the export repeats that scope. For live access, the operator issues a per-project read-only login, and the analyst opens the typed layer, where `form_version` tells versions apart.
- **J4: An account leaves.** Signing out with unsent records warns first, and the records wait on the device for that account. Deleting an account removes memberships and anonymizes the profile. Observations keep the observer code as a research label.

## Glossary (U1)

One set of words in both apps, matching the database. Proper names such as "Play Study" are not glossary words.

| Word                        | Means                                                                                                           | Avoid                                                                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Project**                 | A study inside an organization, with its own team, sites and forms                                              | Study, Assignment, "Assigned to you"                                                                                                      |
| **Site**                    | One real place, such as Riverside or Fall Creek                                                                 | Place, Places, Package (for the place)                                                                                                    |
| **Zone**                    | A named area inside a site, from the active map package                                                         | Region, polygon, bounding box                                                                                                             |
| **Form**, with **versions** | The questionnaire. A version (`demo-v1`, `janet-test-v1`) is a draft, then published (locked), then retired.    | Instrument, questionnaire, survey, workbook                                                                                               |
| **Map package**             | An immutable, versioned map of a site uploaded from QGIS (`v3`). "Ready offline" needs all four parts verified. | Base map, basemap, offline map, bundle, tiles                                                                                             |
| **Observation**             | One collected record: a point plus site, zone, round, form version, observer code and answers (`OBS-0244`)      | Entry, submission, response. "Record" only in sentences about storage and upload ("5 records not uploaded"), never as a tab or page name. |
| **Round**                   | The protocol round number the observer picks. Nothing is scheduled.                                             | Visit, shift, schedule, Today, "assigned"                                                                                                 |
| **Observer code**           | The initials on every observation, up to ten uppercase characters. Changes apply to future observations only.   | User ID, username. "Initials" only on the field where a person types them.                                                                |
| **Training**                | The practice project every account joins                                                                        | Demo, sandbox, test project                                                                                                               |
| **Queue states**            | On device · Uploading · Uploaded · Needs attention · Held ("waits on the project, not on the observer")         | Synced, Pending, Sent, Failed, Error                                                                                                      |
| **Review states** (U5)      | Not yet reviewed · Approved · Excluded                                                                          | Accepted, Rejected (for a review)                                                                                                         |

## Honesty

DECA Mark holds research evidence. The interface must never say more than the system knows.

1. **Say where the work is.** Every save, error and empty state says whether the work is on this device, uploading, uploaded or held. On the phone, an error's first line says where the draft or record is.
2. **Never overclaim readiness or delivery.**
   - "Uploaded" appears only after the server acknowledges the record.
   - "Ready offline" appears only when the site map, zone boundaries, form definition and field guide are all verified.
   - Device readiness is not available on the web yet, and the site page says so instead of guessing.
   - Overview counts state "Records still on devices are not counted here."
   - The collector header shows the real map and form versions.
3. **Everything on the web is live (D30).** There are no fixtures, no sample workspace and no Preview data marker. A page that cannot load says so and never shows an empty list. A list of observations holds at most the newest 500, and anything counted or exported from a list that long says "Based on the newest 500 observations."
4. **Say what is not built, once.** A feature with no backend shows "X is not available yet." with why and what to do instead. It is never a disabled button or a mock-up. Today that covers:
   - the zone editor (U2: edit zones in QGIS);
   - the organization form library (U4);
   - reviewing and excluding records (U5);
   - the rounds plan (U6);
   - saved named views (U7: a link to the filtered view replaces them);
   - device readiness, live QGIS database access, deleting projects, organizations, sites or map packages, and resending an invitation.
5. **No control claims to do what it does not do.** A button does what its label says or is not on the page. Where something does not exist yet, say so: the Android link on the home and collect pages appears only when one is set, and nothing points to a store that does not exist yet.
6. **Counts claim only what they count.** Coverage is the records present by zone and round type, not completion, and no target is claimed until a project sets one (U6).
7. **Do not fabricate verification**, whether of production, a device or background sync (AGENTS.md).

## Voice and copy

Plain, exact and calm. DECA Mark sounds like a careful colleague who is precise about where your data is and what to do next.

- **Buttons are verb + object:** "Save on this device", "Correct and send again", "Publish v2", "Return to projects". Avoid bare "OK", "Submit" and "Yes".
- **Sentence case everywhere.** Mono eyebrow labels are uppercase by style, not by typing.
- **No "Oops", no exclamation marks, no "successfully" and no blame.** Say what is needed ("Up to ten uppercase characters."), not what the person did wrong.
- **Errors say what happened, what is safe, then what to do.**
- **A disabled control always carries its reason.** Destructive actions list what is affected before the type-to-confirm.
- **The visible change of state is the confirmation.** Toasts offer Undo, and nothing celebrates.
- **Mono for anything someone might read aloud:** `OBS-0249`, `v3`, `demo-v1`, `DECA2026`, "4 of 6", "60 of 126 MB". Times carry their context, such as "Oct 02 · 11:32" or "Today 11:25".
- **Words follow the role:** field language for observers, research language for managers (see Users).

The "instead of" column is wording from the earlier apps or a common default. The "write" column is the designed Contour copy.

| Instead of                                                             | Write                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Assigned to you" (collector home)                                     | "Projects · Research spaces you have joined." with "This list does not imply scheduled assignments."                                                                                                                                                                              |
| "Synced"                                                               | "Uploaded", only once the server has acknowledged the record                                                                                                                                                                                                                      |
| "A draft survived the crash"                                           | "Unfinished observation · Point placed, 3 of 8 answered. Kept on this device." with **Resume** and **Discard draft**                                                                                                                                                              |
| "Save" / "Submit"                                                      | "Save on this device", under the line "Saves on this device. Upload is a separate step."                                                                                                                                                                                          |
| "Saved successfully!"                                                  | "Saved on this device · OBS-0249 · Upload waiting · offline"                                                                                                                                                                                                                      |
| "Upload failed (422)"                                                  | "Needs attention. The observer code is missing from this record. Add it, then send it again. The record keeps the same number." with **Correct and send again**                                                                                                                   |
| "Something went wrong. Please try again."                              | "We could not load this page. Nothing was removed. Check your connection and try again."                                                                                                                                                                                          |
| "Error loading screen" (collector)                                     | "Your draft is still on this device. The screen could not load, but the point and answers you entered are kept."                                                                                                                                                                  |
| "No results"                                                           | "No observations match this view. Change your filters to see more observations. Your underlying records are unchanged."                                                                                                                                                           |
| "You don't have permission."                                           | "You do not have access to this page. Your current role can view project observations, but cannot change this area. Ask a project manager to review your access."                                                                                                                 |
| "No internet connection"                                               | Collector: "Offline. Records remain on this device and upload later." Web: "You are offline. Showing what loaded at 11:36. Changes cannot be saved."                                                                                                                              |
| "Are you sure you want to sign out?"                                   | "Sign out? Your unsent work needs a clear owner. 5 observations have not been uploaded. They remain on this device for ps2245@cornell.edu. Another account cannot upload them." with **Upload eligible records first** · **Sign out and keep local records** · **Stay signed in** |
| "Passwords don't match!" (on every keystroke)                          | "Does not match yet", shown after the field loses focus, and under the disabled button "The button turns on when both passwords match."                                                                                                                                           |
| "Publish form" + "Are you sure?"                                       | "Publishing creates demo-v2. It never changes demo-v1." with "I understand that a published version cannot be edited." then **Publish demo-v2**                                                                                                                                   |
| "Download complete. Offline ready."                                    | "60 of 126 MB" while each part moves Waiting → Downloading → Verified. "Ready offline" appears once all four verify, and "Set up this session" turns on then.                                                                                                                     |
| "All devices ready"                                                    | "Device readiness is not available yet.", with what to do instead                                                                                                                                                                                                                 |
| "These screens read local fixtures, not the database" on every section | Nothing: the web is live (D30, see Honesty)                                                                                                                                                                                                                                       |

## Brand personality

**Calm, exact, trustworthy.** A field instrument, not a dashboard product. The references are survey plats, waterproof field notebooks, topographic sheets and playground signage. The emotional goal is confidence that nothing was lost: "Observe with confidence. Keep every record."

## Anti-references

- A dark interface as the default. A dark screen turns into a mirror in direct sun, which is why the Night Transit direction was rejected.
- A row of four KPI tiles; cards as the default container; a SaaS left rail plus top bar copied without thought.
- Empty states built around a cartoon illustration; colour as the only signal of a state.
- Shimmer, hover lift, animated counters, glass blur, simulated latency and celebration effects.
- Marketing tone inside the product, and any wording that implies scheduling, readiness or delivery the system has not confirmed.

## Design principles

1. **The field comes first.** Design for daylight, one hand, gloves and no signal, then scale up to the desk.
2. **Say where the work is, and never overclaim.** Every state is true, attributed and timed.
3. **One thing to do now.** Each screen has one primary action, and every other action steps back.
4. **One vocabulary, two apps.** The same words, state glyphs and colours on the phone, the web and in QGIS. A state is always a glyph, a word and a colour.
5. **Versions are visible.** Map and form versions sit on the screen, so evidence can always be traced to what produced it.

## Accessibility and inclusion

- **Contrast:** WCAG AA, 4.5:1 for text and 3:1 for UI, in Day and Dusk, enforced by `pnpm tokens:check`. Axe has no serious or critical findings on the web.
- **Touch targets:** at least 44 px on the web and 48–60 in the collector. Answer tiles are 60.
- **Text:** follows the device text size and the browser zoom. Labels wrap and never truncate. Larger question text is a preference.
- **Keyboard and screen readers:**
  - On the web: a skip link, focus moving to the page heading on navigation, and roving focus in tables.
  - Live regions announce saves, uploads, filters and validation.
  - VoiceOver covers sign in → join → place → answer → review → save.
- **Motion:** reduced motion removes movement, keeps fades at 100 ms or less, and makes map moves jump.
- **Collector preferences:** haptics only when the switch is on, a preferred hand for landscape layouts, the screen theme, and the map palette.

## What success looks like for the pilot

The pilot is Janet's field session on a real iPad and a real Android tablet, read back in QGIS (Phase 5). It succeeds when:

- **Observers stay on the children.** They go from Before you begin to Saved and on to the next observation without hunting for a control. They always know whether a record is on the device or uploaded.
- **Nothing is lost.** A record survives a force quit, a restart and an expired session, and uploads exactly once. A rejected record says what to fix.
- **Managers see the field return.** Coverage, what is blocking and what needs attention, without mistaking a capped list for the whole record. The page says when counts are based on the newest 500 observations.
- **The form holds.** Janet's form is published and validated the same way on the device and on the server. Its observations open in QGIS with typed columns and the form version that produced them.

The full pilot-ready list is in [docs/plan/product.md](docs/plan/product.md#pilot-ready-means).
