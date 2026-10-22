# DECA Mark frontend audit: final report

> **Repository copy (2026-10-22).** This report and its evidence are kept in `docs/reviews/frontend-audit-2026-10-17/` (see [README.md](README.md)). Paths below that begin `/tmp/claude-0/…/scratchpad/` now live under `cloud/` in this folder. The owner answered section 9 the same day (decisions D31–D34); the resulting tasks are ordered in [docs/plan/pilot-readiness.md](../../plan/pilot-readiness.md).

**Repository:** Audit-Tools-DECA-Lab-Cornell/deca-mark
**Revision reviewed:** `0279fd38f732eb3167fb174b9c2c19e177c273b1`. The audit started at `9928f536`. Between the two, the frontend changed only in `mobile/src/sync/upload-failure.ts` (+3 lines, the `published_form_bounds` message), two new mobile outbox tests and `web/vercel.json` (+8 lines).
**Working tree:** clean at the start and at the end. No application code, dependency, lockfile, document or configuration was changed, and nothing was committed or pushed.
**Dates:** 2026-10-17 to 2026-10-22, in two runs:
- **Mac run.** Nine dimension reviews with per-dimension evidence checks, browser journeys, lab performance on a production build, and a partial iOS-simulator run.
- **Cloud run.** Re-verification at `0279fd3` on a fresh local stack with every migration applied, the Forms journeys, a controlled loading-boundary experiment, a hydration investigation, Opus triage and adversarial skeptics on the top findings.

**Owner decisions applied:**
- The product is pre-launch, and every installed device is a development device.
- Resetting local or server data is fine.
- No legacy or compatibility code. The collector's SQLite wipe on a schema change is therefore policy, not record loss.
- Runtime versioning is a product feature: observers keep the map, zone and form version they started on.

**Evidence categories.** Each finding carries one of four labels, and they are not equally established:
- CONFIRMED DEFECT: reachable, and the behaviour was shown.
- DEMONSTRATED COMPLEXITY: the cost was shown, but no user-visible defect.
- MEASUREMENT NEEDED: the cost is plausible but unmeasured.
- DESIGN PREFERENCE.

---

## 1. Verdict

**Overall: keep both frontends in their current form. They are fit for a controlled pilot after about a week of targeted fixes, not before.**

**Leave the core alone.** The record-integrity core is the best code in the repository:
- single-transaction saves;
- upload bodies frozen at save and replayed by id;
- "Uploaded" shown only after a matching server receipt;
- exact map, zone and form version pinning;
- verified package installs;
- account fences;
- honest capped counts;
- failed reads that never render as empty lists.

**What is not ready is the surface around that core.**
- On phones, the collector hides the answer field and Continue under the keyboard.
- At sign-out and account deletion, it tells observers it does not upload.
- A double tap can enter an answer nobody read.
- On the web, any failed Server Action throws away form-editor and settings edits behind a false "could not load its records" screen.
- The lab's own QGIS project fails to upload, and the error blames the zone rings.

None of this needs a rewrite, a state or query library, a hosting change or a different map engine. Every top item is a local change in one to five files.

| Area | Verdict |
|---|---|
| **Web architecture** | Sound and conservative App Router use. Routes are dynamic and per user; reads share a per-request `cache()`; fetches use `no-store`; `settle()` with `LoadFailure` keeps failures honest; prefetch is deliberately off; large uploads go from the browser straight to the API. **Two systemic gaps:** Server Actions are assumed never to reject (C03), and the shared text inputs accept typing before hydration and then lose it (C07). Loading boundaries sit one segment too deep (C17). Old-route redirects, legacy service-worker cache names and the fields-only form reader are dead weight under the owner's policy (C19). |
| **Native architecture** | Storage and sync are excellent: a serialized SQLite write queue, atomic commit, account fences, verified staged installs, and draft recovery that never substitutes another map, zone or form. **The React wiring around them is weak:** memo keys on the session object cancel downloads on every token refresh (C10); a 5-second tick forces re-reads when nothing changed (C15); retry delays outlive reconnects (C09); rotation remounts the map (C21); and the release Observations tab is still the pre-Contour screen with its own state words (C02). |
| **Performance** | The web is fast where it was measured: TTFB 12-57 ms, CLS 0 on 30 routes, and no long tasks on 29 of 30 routes (M1 Pro, production build, local API). **The one demonstrated defect** is a warm tab-switch floor of about 250 ms. Its cause is proven: `loading.tsx` remounts under React 19.3's 300 ms reveal throttle. Moving one file fixes it (C17). Data at 500 rows is the heaviest page (15.2k nodes, 2.2 MB of HTML), and about a third of that is a duplicated card list (C18). Mobile costs are unmeasured on Hermes. |
| **UI/UX** | The manager UI is unusually honest about caps, time zones and export scope. It breaks where separate objects meet: a blocked upload is blamed on zone rings (C04), and the Forms list and Overview hide which form version observers actually get (C11). The collector's placement, recovery and readiness UX is strong. Its answer-and-save loop loses data quality on phones (C01, C05), and its upload wording is false exactly where observers decide (C02). |
| **Accessibility** | Web accessibility is genuinely good: 0 axe violations in 70 runs (WCAG 2.0/2.1/2.2 A and AA, Day and Dusk, 1440 and 390 px), plus a working skip link, route focus, a keyboard-complete zone editor and a global reduced-motion rule. The real web defects are small and sit in shared code: dialog focus return, the password toggle's accessible name, and single-key shortcuts. The native primitives are good in code, but the release Observations tab sits outside them, VoiceOver gets no placement readout, the map camera ignores Reduce Motion, and the promised preferences exist only in developer builds. **No screen-reader pass on a real device has ever run.** |
| **Testing** | High quality, poor wiring. CI does not run the 393 web unit tests, `forms:parity` or the token check, although together they take about 6 s and the docs say CI runs them. The real collector-to-API acceptance driver is orphaned. There is no native runner, so every top collector defect was found by hand or on the simulator, not by the suite. The e2e suite is solid, but its one flaky test is a real hydration defect (C07). |

---

## 2. Top five findings

These five are ranked by impact on researchers at first real use. All five survived an adversarial skeptic. Three were downgraded or corrected, and the corrections are included below.

### #1 · C01. On phones, the keyboard hides the answer field and Continue in Collect; Android has no keyboard avoidance

**HIGH · CONFIRMED DEFECT**
- **Confidence:** high for iPhone portrait; medium for iPad, Android tablet landscape and phone landscape, which rest on code and arithmetic only.
- **Platform:** collector (iOS and Android).
- **Journey:** 3, collect offline (Answer and Saved steps).
- **Evidence:** iOS 26.5 simulator on an iPhone 17 Pro with a dev build (screenshots 14, 15, 16d and 19, plus frames from the accessibility tree). The keyboard-avoidance arithmetic was reproduced against the installed React Native 0.86.3 `KeyboardAvoidingView` (KAV) source.

**Where:**
- `mobile/src/features/collect/CollectScreen.tsx:476-483`: the panel KAV, with `behavior={Platform.OS === "ios" ? "padding" : undefined}` at `:479`.
- `:499`: the map slot takes `46%` of the screen.
- `QuestionStep.tsx:141-145`: the ScrollView sets `keyboardShouldPersistTaps` but has no `keyboardDismissMode`. The Textarea is at `:198-207`, and the fixed Back/Continue footer at `:241-257`.
- `SavedStep.tsx:145-152`: the forward button sits inside the ScrollView.
- `CollectMap.tsx:247-253` and `:762-809`: the six map controls, about 334 pt in a single column.
- Two copies of `useKeyboardVisible` exist (`features/auth/use-keyboard.ts`, `features/onboarding/use-keyboard-visible.ts`).

**Trigger.** An observer on a phone reaches a text or number question. The worst case is the required multi-line play-event summary in `janet-test-v1`. It has no return key, so tapping elsewhere does not dismiss the keyboard. The only exits are the mode strip (which enters Adjust point) or X. On Android edge-to-edge builds, which are mandatory in Expo 57, every text question is affected.

**Observed:**
- **At rest:** the answer input is clipped to a sliver under the sticky footer. The panel scrolls at most 67 pt, and scrolling slides the question heading under the progress bar.
- **Keyboard up:** the keyboard top is at 539 pt, the field at 529-579 and Back/Continue at 592-648. The typed text is invisible.
- **Why padding fails:** the KAV pads only about 119 pt, where 301 pt is needed. React Native computes the KAV frame relative to its parent, but compares it with the keyboard's window coordinate, and the body sits about 183 pt below the top of the window.
- **Saved step:** the card is 400-450 pt in a panel of 293-317 pt, so "Place the next observation" needs a scroll on every observation.

**Consequence.** Observers type research answers blind (the required summary, the 8 inventory text questions, number fields). Typos enter the data, or the observer stalls. Pilot tablets in landscape are also affected through the same offset bug: the field is visible but Continue is behind the keyboard.

**Smallest correction.** This is the skeptic's corrected version; the original "map slot to 0" fix was not enough.
1. Keep one `useKeyboardVisible` in `src/ui` and delete the other copy.
2. Measure the body's window y with `onLayout`. Pass `keyboardVerticalOffset={bodyY}` and `behavior="padding"` to the panel KAV on both platforms, and delete the `Platform` branch. This alone fixes tablets in landscape.
3. On phones, while the keyboard is up, set the map slot's height to 0 by style. Keep the map mounted; do not use `display:none`, which unmounts on Fabric. Hide the status row too. In phone landscape, also hide the header, the mode strip and the links row.
4. Add `keyboardDismissMode="on-drag"` to the QuestionStep ScrollView.
5. Check that the KAV's `LayoutAnimation` does not animate the map slot, which DESIGN forbids. If it does, drop the panel KAV and set `paddingBottom` from the keyboard height.
6. Pin the Saved step's forward button outside its ScrollView, as the Place, Question and Review steps already do. Use two control columns when the map frame is under about 340 pt.

**Must remain:**
- MapLibre stays mounted across steps.
- Slot size changes instantly, never animated.
- Drafts are still written on every keystroke.

**Verification:**
- On iPhone SE and iPhone 17 Pro (portrait), iPhone landscape, iPad landscape and an Android tablet in landscape: type into the play-event summary and assert from frames (not a visibility assertion) that `Continue.maxY ≤ keyboard.minY` and the field is above the keyboard.
- A drag dismisses the keyboard, and the camera is unchanged afterwards.
- On Saved, "Place the next observation" is visible without scrolling.

**Effort:** 1-1.5 days, including device checks.

### #2 · C04. A map upload refused by the imagery check is reported as a broken zone ring

**HIGH · CONFIRMED DEFECT**
- **Confidence:** high.
- **Platform:** web plus API (package preparation).
- **Journey:** 1, the manager uploads a map package.
- **Evidence:** reproduced in the browser on the cloud stack. A `.qgz` containing an "ESRI World Imagery" XYZ layer was put through Read project and then Upload.

**Observed:**
- Read project auto-fills the QGIS project slot and badges it "Ready". Its note says the basemap "was not converted … remain in QGIS", which reads as harmless.
- Upload package returns `422 validation_failed {issues:[{code:"invalid_structure", zone_ids:[]}]}`.
- The page shows "Not uploaded. A zone's shape could not be read. Check that each of its rings is closed and has at least three different points."

**Where the real reason is lost.** The server's precise reason names the layer and its host. It is dropped at three points:
- `backend/.../domain/zone_archive.py:229-231` (`prepare_import_base` raises a generic `PackageError`);
- `domain/zone_archive_worker.py:48-49` (`sys.exit(2)`);
- `services/zone_archives.py:48-50` and `zone_publication.py:224-226`, which map the failure to `zones.issue("invalid_structure")`.

The web then maps that issue code to the ring copy (`web/src/features/packages/UploadStep.tsx:147-181`).

The scope is wider than imagery. Every worker-side `PackageError` gets the same ring message: the publication extent, the 16 MB archive limit and project parse errors.

**Trigger.** Any QGIS project with an online basemap. The lab's own tooling enables one: `qgis/fall-creek/qgis_project.py` turns on ESRI World Imagery. The product's guide (`docs/QGIS-Base-Map-Testing.md`) tells managers to add an XYZ basemap before drawing.

**Consequence.** The first real upload of the lab's own project is near-certain to be refused, through the primary flow. The reason given sends the manager to repair zones that are valid. Every collection depends on this upload. Nothing is lost, and an unsignposted workaround exists: remove the project file and upload GeoJSON only.

**Smallest correction.** Backend only, about 2-4 hours. No new issue code and no web change.
1. In `zone_archive.py`, raise the blocked checks' detail instead of the generic sentence.
2. In the worker, write `str(e)` to `error.txt` before `exit(2)`.
3. In `zone_archives.py`, re-raise with that text.
4. In `zone_publication.py`, return `validation_failed` with the message and no issues. `uploadProblem`'s existing final branch already shows `failure.detail`.
5. Rewrite the remedy in `packages.py:_check_imagery_licence`. It currently says "supply institution-owned imagery", which is wrong for this product because archives never contain imagery. It should say something like: "<layer> (<host>) is an online basemap. DECA Mark packages vector layers only. Remove it in QGIS, or remove the QGIS project file from this upload."
6. Emit the same sentence at Read project time from `project_worker.py`.

Optional, and the owner's call: the archive never contains tiles, so the network-raster check could become a warning instead of a block.

**Must remain:**
- Unlicensed network imagery is still refused (unless the owner changes that rule).
- Real ring errors keep their own copy, which comes from SQL validation with zone ids.

**Verification:**
- Add an XYZ layer to `qgisUpload()` in `web/e2e/packages.spec.ts`. Assert that the alert names the layer and the remedy and does not mention rings.
- `test_site_packages.py::test_an_unlicensed_source_is_rejected_without_publishing` currently asserts only the 422. Make it also assert the code and message, which is why this defect went unnoticed.
- The unclosed-ring control still shows the ring copy.

**Also stale:** `docs/QGIS-Project-Import.md:5` and `docs/QGIS-Base-Map-Testing.md` say a blocked package keeps its reasons. At `0279fd3` none is stored: the only insert into `site_packages` writes `ready`.

### #3 · C02. The collector misstates its upload state where observers make decisions

**MEDIUM · CONFIRMED DEFECT**
- **Confidence:** high.
- **Platform:** collector (all sizes).
- **Journeys:** 4, sign-out, account deletion and the Observations tab; 3, the Saved step.
- **Evidence:** strings and the live uploader checked at HEAD; the practice-record path traced with the real `observation-store` and registry; the backoff reproduced with the real coordinator.
- The skeptic downgraded this from high: permanent loss needs a narrow combination of conditions.

**Where:**
- `mobile/app/(app)/(tabs)/account/index.tsx:135-138`: the note "This version does not upload yet. … Nothing is lost by waiting", directly under an Uploaded count. The doc comment at `:36-41` says the same.
- `account/sign-out.tsx:125-131`: "This version does not upload yet, so they wait here either way."
- `account/delete-account.tsx:186-191`: the Alert "This version cannot upload them first. They stay on this device and can never upload."
- `features/account/leaving.ts:35-40` ("held for the project") and `:83` (`uploadFirstLabel`, exported but unused).
- `features/collect/SavedStep.tsx:115-120` and `features/guide/content.ts:84`.
- `app/(app)/(tabs)/observations/index.tsx`: a `<Redirect href="/records">` to a root-stack sibling. It replaces the whole `(app)` group, so the dock disappears.
- `app/records.tsx:31-36`: shows pending as "Held" and synced as "Synced".

**Observed.** The uploader is live: `SyncProvider` is mounted and drains while the app is signed in, in the foreground and online. Yet:
- Account and Sign out say the app does not upload.
- Delete account says uploading first is impossible.
- Practice records (local-only, never uploaded) are labelled with the contract word "held", which means "waiting on the project".
- The Observations tab swaps the app for the dark legacy screen. It has its own words, an 11.5 pt text-only state chip and no heading.

This is already tracked: `mobile/PLAN.md:263` and `:563`, and `MOB-07-HANDOFF.md:11`. A test pins the false copy on purpose: `account-screens.test.tsx:144`.

**Consequence.**
- "Is my work safe?" gets different answers on different screens.
- Signing out is presented as harmless. In fact it pauses uploads, though nothing is lost.
- Permanent loss is narrow. It needs account deletion while online, with a bound record still inside its retry delay (up to 300 s, see C09), and an observer who accepts "can never upload" twice.

**Smallest correction** (with the skeptic's corrections):
1. Delete both "does not upload yet" notes and the doc comment. On Sign out say: "Signing out pauses their upload until {email} signs in again on this device."
2. On Delete account with unsent records, offer "Upload N first" wired to **`sync.retry()`**, not `wake()`. `wake()` respects `next_attempt_at` and made 0 upload calls in 240 s in the reproduction.
3. Decide what counts as practice with **`!isBoundObservation`**, not `isShellObservation`. The shell check misses Practice garden inventory-round records (`janet-inventory-v1`, unbound). Exclude practice records from "not uploaded" and word them as "never uploaded".
4. Before sharing `queue.ts STATUS_TO_STATE` across screens, remap `local-only` away from "held".
5. Replace the Redirect with a Contour list inside the tab stack, which takes 1-2 days. A cheaper interim is to render the existing screen inside the tab stack so the dock stays.

The Nocturne theme cannot be deleted with the records screen, because `screen-message.tsx` and the auth splash still use it.

**Must remain:**
- "Uploaded" only from a validated receipt.
- A signed-out account's records stay under its own scope.

**Verification:**
- Seed one bound pending row with 7 attempts and a future `next_attempt_at`, one `shell-v1` practice row and one unbound `janet-inventory-v1` row.
- "Upload 1 first" uploads at once.
- The counts show 1 unsent, and both practice rows read "never uploaded".
- A router-level test shows the dock still mounted after tapping Observations.
- A grep finds neither false string.

**Effort:** copy and counts 2-3 h; the Observations list 1-2 days.

### #4 · C03. A failed Server Action unmounts the web screen and throws away unsaved edits

**MEDIUM · CONFIRMED DEFECT**
- **Confidence:** high.
- **Platform:** web.
- **Journey:** 1, editing a form draft and project settings; 5, "Show the next 500".
- **Evidence:** reproduced in the browser on the cloud stack, on the draft editor at 1440 and 390. Every trigger gave the same result: an aborted action POST, cleared cookies (the proxy answers with a 307 to `/sign-in`), offline, a bogus `Next-Action` id (deploy skew) and a 401 text/plain response.
- The skeptic kept medium. The original pass had raised it to high.

**Observed:**
- The project error boundary renders "REQUEST INTERRUPTED · Something went wrong. Your records remain available … What failed: The page could not load its records."
- The editor unmounts and the unsaved edit is gone. "Try again" shows the old saved wording with no unsaved marker, so a manager may believe the edit was kept.
- Project settings behave the same way.
- All five Forms dialogs (Publish, Retire, Discard, New form, Start from this version) reach the same boundary.
- "Show the next 500" fails silently: the button re-enables and no message appears.

**Where:**
- `web/src/features/forms/DraftEditorScreen.tsx:145-208` (`start(async …)` with no catch)
- `project-settings/SettingsScreen.tsx:120-133`
- `data/DataScreen.tsx:186-205` (try/finally with no catch)
- `PublishScreen.tsx:79`, `RetireDialog.tsx:37`, `DiscardDialog.tsx:41`, `NewFormDialog.tsx:79`, `FormVersionsScreen.tsx:100`
- `sites/CreateSiteDialog.tsx` and `EditSiteDialog.tsx`, and `account/ProfileForm.tsx` (`/account` has no `error.tsx`)
- `web/src/proxy.ts:33-43` (the 307)
- `next/dist/client/components/router-reducer/reducers/server-action-reducer.js:69-80` and `:111-121`

**Consequence:**
- A manager loses every edit made since the last Save of a form draft, which can be a whole question set, or of the settings form.
- The explanation on screen is false: the page did load, and the save is what failed.

**How often deploy skew triggers it.** Less often than first claimed. Action ids stay stable across rebuilds as long as `.next/cache` keeps its encryption key, which lives 14 days. Skew fires on key rotation, on a build without the cache, or when an action is renamed or moved. Whether Vercel Skew Protection is on cannot be read from the repository.

**Smallest correction:**
1. Catch the rejection at each call site. Start with the editor save, then Settings, `loadMore` (copy the catch at `DataMap.tsx:178`), the Sites dialogs and `ProfileForm`.
2. Use three-way copy, because "Nothing was saved" is only true when the action never ran:
   - **Never ran** (an `unstable_isUnrecognizedActionError(e)` error, or a sign-out sentinel): "Nothing was saved …"
   - **Unknown outcome:** "DECA Mark could not confirm the save. Your wording is still here. Save again when you are connected."
   - **412 after an unknown outcome:** a 412 alone does not prove the earlier save went through, because another manager may have saved in between. Read the draft back: say "Your earlier save went through" only when its content equals the submitted wording; otherwise keep the wording and open the normal conflict choice. *(Corrected 2026-10-22 after review; the first version treated the 412 as proof.)*
3. Never advise a reload while edits are unsaved, and keep the leave guard armed.
4. Optional: answer `next-action` POSTs from the proxy with a 401 sentinel instead of a 307, so the copy can name the sign-out. It cannot affect the zone editor, which talks to the API directly.
5. Fixing C06 (local sign-out) removes the most plausible "session ended" trigger.

**Must remain:**
- ETag / If-Match compare-and-set with its conflict copy.
- No optimistic UI.
- An unknown outcome is never reported as saved.

**Verification.** One Playwright spec at 1440 and 390 covering:
- aborted POST, cleared cookies, offline and a bogus action id: the editor stays mounted, the edit is kept and the page never shows ErrorView;
- a reply lost after the commit (`route.fetch()` then abort): the page must not say "Nothing was saved", and the second Save's 412 is resolved by reading the draft back; a second manager saving in between must end in the conflict choice, not "went through";
- the leave guard is still armed afterwards;
- "Show the next 20" on the zone-review project (520 rows).

**Effort:** 0.5-1 day plus the spec.

### #5 · C05. A double tap on an auto-advancing answer silently answers the next question

**MEDIUM · CONFIRMED DEFECT**
- **Confidence:** medium. The mechanism was reproduced; real tap rates are unmeasured.
- **Platform:** collector.
- **Journey:** 3, Answer step.
- **Evidence:** reproduced with the real `QuestionStep`, the real `reduceSession` and the `janet-test-v1` form under fake timers.

**Observed.** Single-choice questions auto-advance after `AUTO_ADVANCE_MS = 160` (`mobile/src/features/collect/CollectScreen.tsx:42`, `:205-218`):
- **Second tap at 120 ms:** clears the first answer. This un-choose is documented and tested (`session.ts:83-89`), it is visible, and Review flags the empty required question.
- **Second tap at 250 ms:** lands on the next question. Q1 then Q2 gives `{age_range, play_type_1: exploratory}` and a screen titled "Exploratory play — which kind?".
- **The quiet variant:** a double tap on Q2 answers the optional subtype Q3 and lands on "A second play type, if there is one". That looks like the natural next question, and Review never flags optional answers.
- **Likely the most common trigger:** a mis-tap followed by a quick correction 200-400 ms later.

**Consequence.** Play-type or subtype codes that nobody chose enter the research data unless the observer reads every Review row while watching children. PRODUCT names gloves and divided attention as design conditions.

**Smallest correction.** Put the guard in `CollectScreen.dispatchStep`, not in `QuestionStep`, which is not keyed per question (`:352`). It is about 8 lines:
- A re-tap of the option whose advance is pending returns early without cancelling, so the advance still happens.
- `choose` and `toggle` are ignored for about 350 ms after an advance.

The skeptic tested this guard. It keeps Q1 on a re-tap at 120 ms, ignores the tap on Q2 at 250 ms, still lets a different option chosen within 160 ms win, and still lets a deliberate un-choose after Back clear the answer.

**Must remain:**
- The 160 ms auto-advance.
- Validation only at Review.
- Every answer persisted at once.

**Verification.** A hook or component test with fake timers covering four cases: re-tap at 120 ms, tap on Q2 at 250 ms, correction within 160 ms, and un-choose after Back. This needs the timer logic reachable without MapLibre; a reducer test cannot see it.

**Effort:** 1-3 h plus the test.

**Runners-up.** If the five above are fixed, these come next:
- **C11:** managers cannot see which form version observers actually use. Reproduced in the browser.
- **C06:** web sign-out ends the phone collector's session. A one-argument fix.

---

## 3. Other material findings

**How the findings were grouped.**
- 76 original findings plus about 40 new items from the cloud run collapse into 43 clusters.
- Duplicates are merged, and each cluster's member ids are listed in the clusters file.
- Clusters C01-C05 are described above. C19 and C20 got only orchestrator spot checks, not the adversarial pass (see §10).

### Collector: records, sync, packages

| Id | Sev · category | Finding | Evidence | Key location → fix (effort) |
|---|---|---|---|---|
| C08 | med · DEFECT | Draft write failures are invisible. "Draft kept on this device as you answer" is hard-coded. A tap on a Review row during "Saving…" leaves a ghost draft that makes the next observation's draft writes fail, so that observation lives only in memory. An unreadable draft blocks all collection with no way to discard it. | Reproduced with the real draft and observation stores (ghost draft, then `DraftConflictError` and a UNIQUE failure) | `CollectScreen.tsx:423-437`, `draft-persistence.ts:29-38,88-95`, `ReviewStep.tsx:171-177` → drive the status line from the last write; disable rows while saving; add a Discard card for an unreadable draft (0.5-1 d) |
| C09 | med · DEFECT | Retry delays (5 s doubling to 300 s) survive reconnect and foregrounding. Ten seconds after the 7th failure, a reconnect wake made 0 upload calls; the upload went out after about 305 s. | Reproduced with the real coordinator and sync store | `sync/coordinator.ts:65-82`, `provider.tsx:117-129` → reset `next_attempt_at` for pending rows on connectivity and foreground (1-2 h) |
| C10 | med · DEFECT | Every token refresh (about hourly, and on resume) rebuilds `api` and `PackageOperations`. A running download is aborted silently, installed sites flash "Not downloaded · needs a connection", every package is re-verified on the JS thread, and `/v1/me` and `/sites` are fetched again. | Code-derived, with the dependency chain verified against auth-js | `packages/hosted/provider.tsx:50-104`, `auth/me-provider.tsx:174` → key on `client, userId, session !== null` (1-2 h) |
| C15 | low · DEFECT | The 5 s tick bumps the revision when nothing changed. Account and Sign out flash "Reading records from this device…", Sign out ignores taps for a moment, every focused screen re-reads and re-parses all rows, and the map rebuilds its sources. | Reproduced with the real `foreground.ts` (13 drains, 13 `changed()` calls) | `sync/provider.tsx:50,100,127-129`, `foreground.ts:18-21`, `use-observations.ts:18-47` → call `changed()` only on a real change; keep rows while re-reading (0.5 d) |
| C21 | low · DEFECT | Rotation remounts the collect map and step panel, which resets the camera and the aim. This contradicts the screen's own "map stays mounted" rule. | Code-derived (two layout trees) | `CollectScreen.tsx` → one tree; switch layout by style |
| C25 | low · DEFECT | A site download that fails after the archive arrived (for example, the form version fetch fails) says "Map vN did not finish downloading", which blames the map. | Simulator run plus code | Classify the failing step in the download error |
| C35 | low · MEASUREMENT | The Observations list and the collect map load every record ever kept (ScrollView, no pruning). The map re-serializes its style on every render. Installs keep several whole-package copies and re-verify every version at start. | Code; node:sqlite lower bound 13.7 ms at 500 rows | Measure on the pilot device first |

### Web: correctness and UX

| Id | Sev · category | Finding | Evidence | Key location → fix (effort) |
|---|---|---|---|---|
| C06 | med · DEFECT | Web Sign out and "Not you?" call `signOut()` with auth-js's default **global** scope. That ends the phone collector's session too: uploads stop at its next token refresh. Meanwhile the Account page says "Signing out here does not affect the app". | Code-derived against the installed auth-js (`GoTrueClient.js:3417`) | `web/src/lib/auth/actions.ts:138`, `features/auth/actions.ts:127` → `{ scope: "local" }`, as `features/account/actions.ts:103` already does (15-30 min) |
| C07 | med · DEFECT | Text typed before hydration is reverted, merged or ignored. A controlled `<textarea>` is overwritten at hydration with no `onChange`. A select-all that races hydration saves NEW+OLD. Inputs keep the typed text on screen but not in React state: sign-in rejects filled fields, and the settings name is wiped by the next render. Save before hydration does a native GET. The window is 0.1-0.2 s in the lab and 1.3-2.5 s cold on a throttled profile. This is why `settings.spec` fails 5 times in 20. | Reproduced in the browser with chunk delivery held (5/5 per mode); proven in a minimal app on the real React 19.3 canary | `components/contour/{TextInput,Textarea,PasswordInput,CodeInput}.tsx` → one `useHydrated()` gate (readOnly until hydrated, submit disabled); the spec waits for the saved toast (2-4 h; the fixed spec passed 80/80) |
| C11 | med · DEFECT | Managers cannot see which form version observers collect with. The Forms row says "PUBLISHED v2 · USED BY Site A", but the site's map names v1. Overview says "Nothing needs attention". The upload step preselects v1. Delivering v2 needs a full QGIS re-upload with zone-by-zone confirmation, and an older zones layer silently replaces boundaries edited on the web. | Reproduced in the browser (synthetic `uxw2-clean` project) | `features/forms/model.ts:49,78-91`, `overview/model.ts:86-147`, `packages/forms.ts:49-60` → show "Site A · v1" in the row, add an Overview waiting item, default to the newest version (0.5 d). A server "rebind" action is feature work (2-4 d). |
| C12 | med · DEFECT | Below 1280 px (every iPad, narrow laptops) the Data site plan renders after the whole loaded table, up to 500 rows. Selecting a marker scrolls away from the map. | Code-derived plus the 390 px screenshot | `features/data/DataScreen.tsx:375-401` → put the plan first, at a compact height, below `xl` (1-2 h) |
| C16 | low · DEFECT | Failed reads are handled inconsistently. The publish review turns failed reads into "No other version of this form is published". One outage shows two different screens: a shell-less LoadFailure on a fresh load, "Something went wrong" on client navigation. Org no-access pages have no h1. The error card's "Reference" is a hash of a client message that matches no log. | Outage observed in the browser; publish page re-checked in code | `forms/versions/[version]/publish/page.tsx:143-155`, `o/[org]/layout.tsx:21-39`, `ErrorView.tsx:17-28` → settle those reads; one `requireProject()` helper (0.5-1 d) |
| C26 | low · DEFECT | The zone editor shows "Checking whether your last change was saved…" indefinitely in an outage: 6 s observed, and 40 s on an aborted PUT. A fast-failing PUT is resent without backoff. | Browser | Fix the status text and add a backoff; keep the save queue |
| C27 | low · DEFECT | A new invitation's one-time code and link are discarded by Esc or a tap outside the dialog. The email delivery outcome is never shown. | Code plus browser | `InviteDialog.tsx`, `InvitationCreated.tsx` |
| C28 | low · DEFECT | The observer filter is exact and case-sensitive: lowercase initials give "No observations match this view". | Reproduced with the real filter | `features/data/view.ts` |
| C29 | low · DEFECT | The "Data" breadcrumb on an observation returns to an unfiltered Data page. Browser Back is fine. | Code | Carry the view through the link |
| C30 | low · DEFECT | Only the zone editor checks which account owns the page. Browser-direct package uploads and QGIS import use whoever is signed in now. Palette recents keep another account's labels. | Code | Reuse the zone editor's `expectUser` fence |
| C31 | low · DEFECT | The installed web app, opened offline, shows the public landing page instead of saying it needs a connection. | Code plus a service-worker simulation | `lib/pwa/service-worker.js` |

### Accessibility (see also C02 and C14)

| Id | Sev · category | Finding | Evidence |
|---|---|---|---|
| C22 | low · DEFECT | Collect map: VoiceOver hears nothing when the cross leaves its zone (live regions are Android-only), two messages are announced twice, the map camera ignores Reduce Motion, and the cluster marker is a 36 pt target with no hitSlop. | Code |
| C23 | low · DEFECT | 13 of 22 dialogs never return focus to what opened them (the Invite dialog failed 6 of 6 in the browser). The password Show/Hide control fails Label in Name on web and native. | Browser plus code |
| C24 | low · DEFECT | The preferences PRODUCT.md and DESIGN.md promise (Dusk, larger question text, preferred hand, haptics, map palette) can be set only in developer screens (`mobile/app/(dev)/`). Spot-checked by the orchestrator. | Code |
| C32 | low · DEFECT | Single-key shortcuts (`g` chords, `?`, `/`) fail WCAG 2.1.4. The shortcuts dialog documents Approve, Exclude and Esc keys that do nothing. | Code |
| C43 | low · PREFERENCE | Type tokens are px, so a larger browser default font does not grow text, and 320 px at a 200% root overflows. Browser zoom works (no overflow at 1440 px at 200%), so WCAG 1.4.4 and 1.4.10 are met through zoom. | Browser |

### Web performance and complexity

| Id | Sev · category | Finding | Evidence → fix |
|---|---|---|---|
| C17 | low · DEFECT | The project and org `loading.tsx` remount on every tab switch, so React 19.3's 300 ms reveal throttle holds ready pages behind an empty card. | Controlled experiment, §4.3 → move `p/[project]/loading.tsx` up to `p/loading.tsx`, and treat the org one the same way (30 min-2 h) |
| C18 | low · COMPLEXITY | Data renders every loaded record twice: a desktop table plus a CSS-hidden card list. That is 15.2k nodes and 2.2 MB of HTML at 500 rows; the cards are 4.5k nodes. | Measured; SSR attribution with the real `DataTable` → render one structure (2-4 h; expect about 30% fewer nodes and bytes, not more) |
| C33 | low · COMPLEXITY | zod plus openapi-fetch (382 KB raw, 89 KB gzip) ships on every authenticated project and org page only because `LoadFailure` imports a helper from a zod module. supabase-js is bundled three times in three route-group chunks (about 70 KB gzip each). | Build analysis → move `isNoAccess` and `isNotFound` out of the zod module; one shared lazy supabase import |
| C34 | low · MEASUREMENT | Server render cost: the Overview calls `listPackages` once per site (10 calls at 10 sites; 4.2-4.5 s of summed API time at 28 sites, inside a 478-507 ms document). Some pages await independent reads one after another. Every map render downloads, unzips and projects the package. Some mutations render twice (three redundant `router.refresh()` calls). | M1 fan-out log → measure on hosted latency; use `Promise.all` and earlier promise starts; delete the redundant refreshes but keep `saveDraftAction`'s revalidate |
| C36 | low · COMPLEXITY | The Data filter schema is not typed against `ObservationFilters`, Reports has a second date parser, and map layer names are declared five times. | Code → one export plus `parseView` |
| C37 | low · COMPLEXITY | The collector's lucide icon barrel is about a quarter of the iOS JS bundle (6.7 MiB Hermes), and `expo-font` is used but not declared. | Bundle attribution → per-icon imports |

### Testing (detail in §7)

- **C13 · medium · DEFECT.** Existing guards never run automatically: CI skips the 393 web unit tests, `forms:parity` and `contour-tokens --check`, the collector-to-API acceptance driver, and the recovery-cookie checks.
- **C14 · medium · MEASUREMENT.** No native runner and no assistive-technology run on a device. This cluster also holds N-4 (the tab bar missing from the XCUITest tree) and A11Y-08 (on Android, disabled reasons are exposed only as tooltips).
- **C38 · low · PREFERENCE.** Cost and naming of the browser suite.

### Policy, simplification and hardening

- **C19 · low · COMPLEXITY.** Compatibility and dead code that the no-legacy policy makes deletable. Listed in §6.
- **C20 · low · PREFERENCE (policy).** A `SCHEMA_VERSION` change drops every collector table, including unsent observations and drafts, with no count or warning (`mobile/src/storage/database-migrations.ts:61-80`). This is sanctioned today. **Launch gate:** before any device holds real records, freeze `SCHEMA_VERSION` for the pilot or add a refuse-if-unsent guard. After that point, the same behaviour is critical record loss.
- **C39 · low · PREFERENCE.** Hardening with no reachable defect:
  - `safeNext` is safe end to end, because the sign-in action re-applies it and refuses `//host`. It is not idempotent alone: `/a/..//evil.com` becomes `//evil.com`.
  - No Content-Security-Policy, frame-ancestors or X-Content-Type-Options header is set.
  - The `fm-place` cookie survives sign-out, though `homeFor` re-checks it.
- **C40-C42 · low.** Upload success may render off-screen at ≥1280 px (MEASUREMENT). The empty-project Overview points its primary action at an empty Data page. Role and org are not shown in the header below 1024 px, and an observer's header says "MEMBER".

**Refuted:**
- **WDI-3** (open redirect). Not reachable end to end; folded into C39 as hardening.
- **J-10** (multi-word search). Search ANDs its terms; the runtime result was a seed artifact.
- **J-11** (toast overlap). Normal toast behaviour; it pauses on hover and focus.
- **FORMS-\*** (Forms banner, broken Overview forms card, editor save, axe). These came from the Mac run's stale local database, or were positive evidence. With a healthy schema, Forms works and has 0 axe violations.
- **The Mac run's 14 failing e2e tests per project.** All environmental (a missing migration). The cloud run with every migration applied passed 134/134 on desktop.

---

## 4. Rendering, data and performance

### 4.1 Web routes

**Conditions:** M1 Pro, Next 16.2.7 production build, local API, Chromium 141 headless, 3 samples per route, cold context. Forms rows are from the cloud run (4-CPU Linux container), because Forms was broken on the Mac.

| Route | Path to usable content | Blocking reads | Measured (cold) | Recommended bounded change |
|---|---|---|---|---|
| `/sign-in` and other auth pages | proxy → page | none | TTFB 12 ms, LCP 52 ms, 286 KB | C07 hydration gate |
| `/o` | proxy → identity → 307 to the remembered or only project | 1 | 307 at 40-58 ms | none |
| Overview | identity → ∥[project, sites, sites → N × `listPackages`, forms, newest 500] → ∥[today, 7 days] → Suspense coverage | 4-5 waves | 10 sites: usable 310 ms, 19 API calls. 28 sites / 520 obs: usable 541 ms, 37 calls | C17; C34 (N+1) after hosted measurement |
| Data | identity → ∥[project, sites] → ∥[newest 500, summaries] → form versions → archive | 5 | 8 rows: usable 202 ms. 500 rows: usable 806 ms, 15,213 DOM nodes, 2.2 MB HTML, one 114 ms long task | C18; C12; C17 |
| Observation detail | identity → observation → ∥[project, archive, sites] | 3 | usable 165 ms; soft navigation 83-105 ms | none |
| Forms, versions | identity → ∥[forms, sites, project] | 2 | cloud: usable 288 / 328 ms | C17; C11 |
| Form editor and publish | identity → version → ∥[forms, sites] → base version → archive | 4-5 | cloud: editor usable 393 ms | C03; C16 (publish); C07 |
| Sites, site | identity → ∥[sites, project] → archives (≤6) or ∥[archive, summary] | 3 | usable 170 / 171 ms | C17 |
| Zones, zone draft editor | identity → ∥[sites, project, workspace] → drafts/packages → ∥[archive, zones] | 4 | usable 326 / 365 ms; the throttled draft editor reached 3.6 s | none; the dependencies are real |
| Packages | identity → ∥[sites, project] → `listPackages` | 3 | usable 318 ms, 2,113 DOM nodes | C04; delete the redundant refresh |
| Team, settings, QGIS, reports | 2-4 waves | — | usable 149-175 ms; Reports at 520 obs 542 ms (the API list alone takes 396 ms) | none |
| Account | proxy → `requireUser` + me | 1 | usable 72 ms | C06 |

**Across all routes:**
- CLS was 0 on all 30 routes.
- Back and forward are served from the router cache in 12-20 ms with no requests.
- Prefetch is off: 0 prefetch requests across 31 links. That is deliberate and right.
- Every page starts with a serial `get_identity` call (9-30 ms). It is justified, because slug-to-id resolution and roles depend on it.

**Throttled profile** (150 ms latency, 1.6 Mbps, 4x CPU; 2 samples):
- FCP is 700-820 ms on every route, because server rendering keeps it independent of the 366-480 KB of first-load JavaScript (gzip).
- JavaScript finishes at 2.7-3.6 s, and usable time follows hydration.
- Data at 500 rows is usable at 1.7 s, with 944 ms of long tasks.

### 4.2 Data ownership and caching (web)

**Nothing authenticated is cached across requests, and that is correct for per-user research data.**
- API fetches use `no-store`.
- React `cache()` only de-duplicates within one request.
- There is no optimistic UI, so a refresh can never bring old data back.
- `revalidatePath` after mutations re-renders the current page and evicts the client router's back/forward cache.

**What the browser keeps:**
- The service worker caches only public files (`/`, `/_next/static/*`, icons). It skips RSC and authorized requests.
- A `packagePlans` LRU cache of 8 entries, keyed by user, project and package. It is never stale, because packages are immutable.
- `fm.palette.recent` in localStorage. It is not keyed by account (C30).
- The `fm-place` cookie, holding a path only.

**Identity checks run in the browser** (Mac journeys, step 4):
- After sign-out and sign-in as another account, Back x5 showed no manager content.
- Direct URLs re-check access.
- An outsider gets a 404.

**Do not add caching.** If package-plan cost ever matters, the only safe memo key is the immutable package id, used after the user's own authorized read. Measure real package sizes first.

### 4.3 The loading-boundary experiment (WEB-R2 / C17)

**Setup:** cloud container, production builds of byte-identical source except for each variant's change, interleaved order, 5 samples per cell. Build D, an unmodified copy, matched A.

**Which React runs.** Next 16.2.7's App Router executes its own compiled React `19.3.0-canary-3f0b9e61-20260317`, not the `react 19.2.4` that `package.json` pins.

**Mechanism.**
- In the client, a retry-lane reveal is held until the last fallback time plus 300 ms (`FALLBACK_THROTTLE_MS`).
- In `layout-router.js`, the parent segment's loading module wraps each **child** segment in a Suspense boundary keyed by that child. Each project tab is a child segment, so every tab switch mounts a new boundary, commits its fallback, and then waits the 300 ms.

| Warm click → usable (median, range) | A: repo | B: no loading files | E: throttle patched to 0 | C: tabs route group | F: loading moved to `p/` | G: Suspense in project layout |
|---|---|---|---|---|---|---|
| overview → data | 354-360 | 209-221 | 216 | 359 | 205 | 201 |
| data → sites | 342 | 92-105 | 94 | 338 | 99 | 94 |
| site → forms | 338-341 | 82-90 | 79 | 339 | 85 | 81 |
| zones → forms / forms → sites | 329-338 | 77-91 | 79-80 | 329-330 | 85-87 | 76 |
| fallback shown | 5/5 | 0/5 | 5/5 | 5/5 | 0/5 | 0/5 |

**Results:**
- **Cold loads:** builds F and G match A; the hard-load skeleton is kept. B paints later (no early shell flush) but reaches LCP about 100-180 ms sooner. That is a trade-off, not a defect.
- **Verdict:** the hypothesis is confirmed. The smallest change is F, moving one file. The route-group variant (C) is refuted.
- **Caveat:** at hosted latency, where the RSC response usually exceeds 300 ms, the measured delay shrinks to just a skeleton flash. That is why C17 stays low.

### 4.4 Collector data flows

| Record class | Storage | Survives a kill | Survives sign-out | Visible to another account | Wording on screen |
|---|---|---|---|---|---|
| Active draft | SQLite `observation_drafts`, one per account, written on every placement and keystroke | yes (except the last ms) | yes | no | "Draft kept on this device" is hard-coded even when the write fails (C08) |
| Saved, local-only (practice) | `observations`, `local-only` | yes (one transaction) | yes | no | Account says "Held"; Saved says "form not published" (both wrong, C02) |
| Pending | `observations`, frozen `uploadBody` | yes; a lost response is re-sent with the same id | yes; uploads pause | no | Account says "On device"; the Observations tab says "Held"; Sign out says "does not upload" (C02) |
| Needs attention | `observations` plus a structured `sync_error` | yes | yes | no | Safe, code-specific copy; retry only on the Observations tab |
| Uploaded | the row plus `server_receipt` | yes | yes | no | "Uploaded" only after `receiptMatches` (honest) |
| Packages | `Documents/hosted/verified/…` plus per-account grants | yes | yes | not listed without a grant | "Ready offline" means a re-hashed, verified install; it flashes "Not downloaded" on a token refresh (C10) |

**Shell shown versus ready to collect.**
- **Shell:** the app shell appears once fonts load, SQLite initializes and the cached account restores. No live session is needed: collection works offline with a cached account.
- **Ready to collect:** that needs the package to be verified in `installed`. Each `INITIAL_SESSION` and `TOKEN_REFRESHED` event throws that away and re-verifies (C10).

**Re-render chains:**
- **5 s tick:** every focused `useObservations` re-reads the whole table, the FieldSession context changes, the site screens re-query, and the map rebuilds (C15).
- **Token refresh:** `MeProvider` re-fetches, the package machinery is disposed and the catalog re-verified (C10).
- **Location:** about 1 Hz re-renders, limited to the map, by design.

### 4.5 Next.js capabilities

**Would solve a demonstrated problem:**
- **Loading-boundary placement (C17).** Move it, then add `useLinkStatus` (present in 16.2.7) on the tabs so a slow hosted response still shows a pending state.
- **`unstable_isUnrecognizedActionError` inside the action-failure handler (C03).** It lets the editor answer deploy skew with honest copy instead of crashing into the error boundary. Vercel Skew Protection is the hosting-side complement, if the plan supports it.
- **Optional:** pass the sign-in Server Action to `<form action>`, so a press before hydration posts to the action instead of doing a native GET. This does not replace the hydration gate (C07).

**No justified benefit:**
- Cache Components, PPR, `"use cache"` and `staleTimes`. Every route is per user, TTFB is 12-57 ms, and the cost is API fan-out, not rendering.
- Turning prefetch back on.
- `next/image`. There are no raster images.
- Edge runtime or ISR.
- React Compiler or memoization sweeps.
- A client query cache.
- Virtualization at the 500-row cap.

**Already right:**
- Dynamic per-user rendering with request-scoped `cache()`.
- `settle()` with `LoadFailure`.
- Browser-direct uploads past the 2 MB Server Action limit.
- The proxy verifies ES256 tokens locally with `getClaims()`, so there is no auth round trip per request.
- Overview's Suspense around coverage.
- `revalidatePath` after mutations.

### 4.6 Measurements still needed

Each of these is a hypothesis until it is measured.

| Question | Experiment |
|---|---|
| Collector JS-thread cost of the 5 s re-reads, catalog re-verification and full-table lists | Release build on the pilot Android tablet and an iPhone. Hermes sampling profiler plus `performance.now()` around `listObservations` and `catalog()`, with 50 / 500 / 2,000 records and 1 / 5 / 20 retained package versions. |
| Hosted latency versus the C17 floor and the C34 N+1 | Lighthouse-style runs against the hosted preview: tab switches and Overview at 10 and 30 sites, before and after the fixes. |
| Real package sizes versus the per-render unzip | Upload the real Ithaca and Fall Creek packages; time the Data, Sites and Zones renders. |
| Double-tap rate on gloved or outdoor hardware | Log the time between a tile press and the next press on the pilot tablet during Training. |

---

## 5. Journeys

| # | Journey | Completes? | Where it breaks | Evidence |
|---|---|---|---|---|
| 1 | **Manager prepares a study:** org/project, sites, form draft and publish, map upload, zones, invitations | **Yes, with one likely dead end.** Sign-in, sites, forms (create, edit, save, reload, publish), zone drafting and publishing all worked on the cloud stack. | **Map upload of a real QGIS project with a basemap fails with a false ring error (C04).** After publishing a form: the Forms list and Overview hide which version observers get, and the upload defaults to the older one (C11). A failed save loses form edits (C03). The invite code is lost on Esc (C27). An empty project's Overview points at an empty Data page (C41). | Browser (cloud Forms run; skeptic reproduction of C04); Mac journeys |
| 2 | **Observer joins, downloads and becomes ready offline** | **Yes.** Sign-up, code, profile, join or Training, project, site, Download (the server size is checked against the bytes received), "Ready offline" = verified install. | A token refresh silently cancels a running download and flashes "Not downloaded" (C10). An error after the archive arrives blames the map (C25). About 5 taps from Projects on every app start; round and zone are not remembered after an OS kill. | Simulator (sign-in, projects, site, Training brief); code |
| 3 | **Observer collects offline, corrects, saves, recovers** | **Partly.** Placement is excellent: fixed cross, tap-to-aim, 0.5 m nudges, live in-zone readout. Recovery reopens the exact map and zone. | **On phones the answer field and Continue are under the keyboard (C01). A double tap writes an unread answer (C05).** Saved's forward action is below the fold on phones. Draft write failures are hidden, and an unreadable draft blocks collection (C08). Rotation resets the camera (C21). | Simulator (Training, iPhone 17 Pro); real-module reproductions |
| 4 | **Connectivity and authentication change:** upload, rejection, account switching | **Yes for integrity, no for clarity.** Exactly-once upload, receipt matching, rejected records kept with safe copy, account isolation and late-work fences all hold. | Retry delays ignore reconnect for up to 5 min (C09). Sign out and Delete account state falsehoods; the Observations tab leaves the app shell with other words (C02). Web sign-out ends the phone's session (C06). Membership removal is handled correctly. | Real-module reproductions; code; no device upload run in this audit |
| 5 | **Manager finds returned observations:** maps, tables, filters, summaries, exports | **Yes on desktop.** Filters live in the URL and survive Back, reload and copied links. Counts say "Showing 1–500 of 520 · counted at …". The export repeats its scope, says the search is not applied, and refuses more than 10,000 records. | On iPad the plan sits after up to 500 rows (C12). The observer filter is case-sensitive (C28). The breadcrumb drops filters (C29). "Show the next 500" fails silently (C03). 500 rows cost 2.2 MB of HTML (C18). | Browser (Mac journeys 5-7; cloud e2e) |

**Failure and recovery states:**
- **API down:** a fresh load shows a LoadFailure (never an empty list); client navigation shows the error boundary (C16). "Try again" recovers once the API is back.
- **Session expiry:** clicking a link redirects to `/sign-in?next=…` and returns the person to the page afterwards. A save loses the form (C03).
- **No access:** role checks run before reads. Observers see the collect screen; an outsider gets a 404.
- **Interrupted work:** the zone editor guards unsaved edits, survives sign-out in another tab and fences an account swap (e2e). The form editor and settings do not survive a failed action (C03).
- **Double submit:** sends one request.

**Novice versus experienced, heuristic only.** This is not user research.
- **Novice managers** are hurt most by C04 and by the package → form → package setup loop.
- **Experienced managers** pay for UXW-4: a full QGIS re-upload with zone-by-zone confirmation on every form revision.
- **Novice observers** are hurt most by C01 and C05.
- **Experienced observers** pay the extra tap on Saved and the setup taps on every start.

---

## 6. Simplification

**Delete or consolidate** (with what remains responsible for the behaviour afterwards):

| Item | Location | Result | Guarantee to keep |
|---|---|---|---|
| Old-route redirects, plus `removed-routes.spec` | `web/next.config.ts:19-42`, `web/e2e/removed-routes.spec.ts` | The app's designed 404 handles old addresses | none |
| Legacy service-worker cache names and the offline start-URL fallback | `web/src/lib/pwa/service-worker.js:3-4,65` | One current cache | `safeResponse` and the RSC/Authorization bypass |
| `migrateLegacySession`, `legacyStorageKey`, the extra URI schemes (`DECAMark`, `fieldmaps`) | `mobile/src/platform/auth-storage.ts:9,81-95`, `app.config.ts:18` | One session key and one scheme, `decamark` (expo-linking already warns that it ignores two) | encrypted session at rest |
| The frozen `legacyScope` (a constant API URL, issuer and project), plus write-only tables (`session-store`, `active_sessions`, `package_selections`, `activateHeldObservations`), all in **one** `SCHEMA_VERSION` bump | `mobile/src/data/legacy/scope.ts`, `storage/session-store.ts`, `sync/provider.tsx:100` | An honest owner scope built from the connection and the user id; removal is guarded by authorizations, the lease and the reference counts | account-isolation tests pass with the new scope |
| The web fields-only form path (`LegacyVersionScreen`, the `isCanonical` branches, `answers.ts` legacy reader) | `web/src/features/forms/LegacyVersionScreen.tsx`, `forms/versions/[version]/page.tsx` | One form model on the web | **Needs your decision:** commit `b93a2b2` restored this "for retained records" |
| The legacy Observations screen, with one status map | `app/records.tsx`, `observations/index.tsx`, `features/preview/queue.ts` | One vocabulary on every screen | remap `local-only` away from "held" first |
| Two `useKeyboardVisible` copies | `features/auth/use-keyboard.ts`, `features/onboarding/use-keyboard-visible.ts` | One hook in `src/ui` | none |
| Per-tab loading boundaries | `p/[project]/loading.tsx`, `(org)/loading.tsx` | One persistent boundary | cold-load skeleton |
| Redundant `router.refresh()` after actions that already revalidate | `RetireDialog.tsx:42`, `DiscardDialog.tsx:47`, `UploadStep.tsx:456` (success path only) | Revalidation in the action owns the refresh | keep the refresh after an uncertain upload outcome and `saveDraftAction`'s revalidate |
| zod reaching every page through `LoadFailure` | `web/src/lib/workspace/result.ts`, `LoadFailure.tsx:9` | zod stays on the server | none |
| Duplicated Data card list | `web/src/features/data/DataTable.tsx:55-131` | One rendering | the real link, roving tab stop, `data-record-id` |
| Single-key shortcut layer and dead shortcut rows | `features/shell/useShortcuts.ts`, `lib/shortcuts.ts` | Ctrl/Cmd+K owns keyboard navigation | update the zone editor guard |
| Five `LAYER_NAMES` declarations; Reports' second parser | `lib/packages.ts`, `lib/sites/archive.ts`, `upload-preview.ts` | One export tied to `contracts/openapi.json` | none |
| Unreachable "blocked package" display paths | `overview/model.ts:103-115`, `packages/page.tsx:99-107` | The C04 message explains refusals | run a SQL count on hosted data first |
| Fixed 5 s sync interval | `sync/provider.tsx:127-129` | A timeout to the earliest `next_attempt_at` | retries still fire without user action |

**Keep, despite looking complex:**
- **Zone-draft save queue** (If-Match, one PUT in flight, account fence). No stale tab or other account overwrites a newer draft.
- **`UploadStep`'s byte-identical resend** with a request id and the expected current package. A lost response never creates a second version.
- **Draft-editor ETags and conflict copy.**
- **The `useLeaveGuard` history-copy guard.**
- **Server Action filter and access re-checks.** Actions are public endpoints.
- **Per-request `cache()`.**
- **The service worker's private-response bypass.**
- **The mobile SQLite FIFO write queue.**
- **The single-transaction commit, frozen body and receipt matching.**
- **Generation and `current()` fences.** C10 is about memo keys, not the fences.
- **Verified package installs and re-verification at start.** Stop it on token refresh, not at start.
- **The package lease and the refusal to remove referenced packages.**
- **Recovery that never substitutes another map, zone or form.**
- **The exact BigInt-backed zone-edge predicate.** The device and the server agree on edge points.
- **Per-keystroke draft writes.**
- **iOS announce effects next to Android live regions.**
- **The AES-GCM session file with its key in SecureStore.**
- **The `package_files_need_reset` crash-safe marker.**

**Choices that are justified as they are:**
- `prefetch={false}`.
- No server data cache.
- `settle()` / `LoadFailure`.
- Fixed `en-US` locale and project-time-zone formatting (no hydration mismatches, CLS 0).
- Browser-direct uploads and exports.
- Hand-written SVG site plans instead of a map library on the web.
- MapLibre kept mounted with an imperative camera and GPU circle layers.
- A byte-copied form engine checked by a parity script. It must run in CI.
- Per-platform Contour primitives over one token contract.
- Radix for dialogs, menus, popovers and toasts.
- `ky` with generated types on mobile.
- Crosshair placement with validation at Review.
- Honest 500-row paging instead of virtualization.

---

## 7. Tests

| Verdict | Group | Protected risk | Cost | Action |
|---|---|---|---|---|
| KEEP | CI-gated web node tests (api-errors, auth, account; 84) | `safeNext`, identity schema, the service worker's private-URL exclusion, error copy | ~2 s | drop the two `fieldmaps-` cache names with C19 |
| KEEP (+CI) | Web unit suite: zone editor, access, forms concurrency, packages, archives (393 tests) | lost or duplicated zone saves; 401/403/409/412/428/429/offline states; role gating; ETag conflicts | 4.55 s | **add `pnpm --dir web test:unit` to CI** |
| REWRITE | Web unit: data truth (data-view, summary, reports, labels) | counts against the cap, DST, answers labelled by version | <1 s | delete the three `round_type: null` cases; drop the regex over mobile source |
| REWRITE | `auth-local.test.mjs` (hand-run, needs a dev server on :3002) | recovery-cookie mismatch refusals | manual | port 3 cookie-tamper cases to `auth-flows.spec.ts`, then delete |
| KEEP | E2E single-actor journeys (sign-in, org, team, sites, packages, data, overview-sql, forms, join, invite, deletion, auth) | manager and observer journeys checked against SQL and the API | minutes; needs the stack | nightly or by hand, not per PR |
| REWRITE | `e2e/settings.spec.ts` | a settings save persists | — | wait for the saved toast before polling and reloading; the C07 gate fixes the fill (variant passed 80/80) |
| MERGE | `overview.spec.ts` coverage test | Overview counts | seconds | merge into `overview-sql.spec.ts:41` |
| KEEP | Zone multi-actor and interrupted-work specs | two managers, sign-out in another tab, account swap, offline save, every conflict choice | nightly | the only end-to-end coverage of interrupted work |
| KEEP (rename) | `honesty` and `zones-honesty` scans | banned words, one primary action, overflow, axe | ~2 min per project | rename to what it is (a copy and layout lint); it does not test failure states |
| REWRITE | `screenshots.spec` in the default run | design assets only | 5 projects per run | tag `@screenshots` and exclude it by default |
| DELETE | `removed-routes.spec` | old addresses | seconds | the policy rules it out; the scan covers the designed 404 |
| KEEP | Specimen suite (zone editor, drawing, gallery) | lossless geometry edits, keyboard/mouse/touch, axe while drawing | no stack needed | — |
| KEEP | Mobile stores, outbox, session, packages, maps (real node:sqlite; 836 tests) | exactly-once upload, restart, account fence, verified install | 14.6 s | shrink the `database-migrations` version loop; asserting the wipe is policy |
| KEEP | Backend-driven outbox tests (fields-only, published-form) | real TS transport against the real API, lost-response replay | in the backend job | the only CI join between client and API |
| REWRITE | Mobile auth, onboarding and platform tests | sign-up, reset, invitations, encrypted session | seconds | delete the 4 `migrateLegacySession` tests with C19 |
| REWRITE | Mobile acceptance files (5, skipped silently) plus the orphaned Python driver | install, offline save, restart, v2 publication, drain, export 403 | +minutes | move `database/tests/test_mobile_{bound_upload,package}_api.py` under `backend/tests` |
| KEEP | Mobile screen tests on a fake react-native | state-to-control mapping | seconds | cannot see layout; C14 complements them; update `account-screens.test.tsx:144` with C02 |
| DELETE | `brand-artwork.test.ts` | logo colour equality | 10 tests | protects nothing a researcher does |
| **ADD** | Server Action failure journeys (Playwright) | C03 | ~1 min nightly | the editor, settings and `loadMore` at 1440 and 390, including the reply-lost case |
| **ADD** | `web/tests/unit/page-failures.test.mjs` | a failed read never renders as an empty list (C16) | <1 s | a 503 stub across the main pages; it fails today on the publish page |
| **ADD** | Pre-hydration typing (Playwright) | C07 | seconds | hold `/_next/static`, type, release, assert |
| **ADD** | Mobile logic regressions | C05 (fake timers), C09 (wake after 7 failures), C10 (session object replaced mid-download), C08 (ghost draft) | <1 s | each was already reproduced with the real modules |
| **ADD** | Native device flows (Maestro) plus one AT checklist run | C01 layout with the keyboard up; draft survives a kill; A→B account isolation; VoiceOver and TalkBack basics | 1-2 d setup | two flows, run by hand before each pilot build |

**CI change.** Add three run lines to the web job: `pnpm --dir web test:unit`, `pnpm forms:parity` and `node scripts/contour-tokens.mjs --check`. Together they take about 6 s. Also move the two orphaned Python acceptance files under `backend/tests`. Do not add Playwright to PR CI. Fix `docs/Workspace.md:67`, which claims parity with the local checks.

---

## 8. First five actions

Ordered by product impact and maintenance benefit.

| # | Action | Clusters | Kind | Effort | Acceptance check |
|---|---|---|---|---|---|
| 1 | **Collector correctness batch:** true sign-out and delete copy, with "Upload N first" calling `sync.retry()`; practice = unbound rows; the double-tap guard in `dispatchStep`; reset `next_attempt_at` on reconnect and foreground; key the package and Me providers on `session !== null` | C02, C05, C09, C10 | correctness | 1-1.5 d with unit tests | A grep finds neither false string. With a bound row in backoff, "Upload 1 first" uploads at once. Fake-timer tests at 120 and 250 ms change nothing beyond the first answer. A session object replaced mid-download leaves it running. |
| 2 | **Collect layout on phones and tablets:** `keyboardVerticalOffset` plus padding on both platforms; map slot to 0 on phones while typing; drag to dismiss; Saved action pinned; one layout tree so rotation keeps the map | C01, C21 | correctness | 1-1.5 d; needs the iOS simulator plus the pilot Android tablet | Frame check `Continue.maxY ≤ keyboard.minY` on the play-event summary for iPhone SE and 17 Pro (portrait), iPhone landscape, iPad landscape and Android landscape. Saved's action visible without scrolling. Rotation keeps the camera. |
| 3 | **Web Server Action failures and local sign-out:** catch at every call site with three-way copy; `unstable_isUnrecognizedActionError`; `signOut({ scope: "local" })` | C03, C06 | correctness | 0.5-1 d plus one spec | The new spec passes at 1440 and 390 (abort, cleared cookies, offline, bogus id, reply lost): edits kept, no ErrorView, honest copy. After a web sign-out, the simulator collector keeps uploading past a token refresh. |
| 4 | **Carry the blocked reason to the upload screen:** backend detail passthrough, corrected remedy text, Read-project warning | C04 | correctness | 2-4 h backend plus about 1 h warning | Uploading a `.qgz` with an XYZ layer names the layer and the remedy. GeoJSON-only upload succeeds. An unclosed ring keeps the ring copy. The backend test asserts the code and message. |
| 5 | **Wire the guards and stop the flake:** three CI lines; move the orphaned Python acceptance drivers; `useHydrated` gate in four Contour text primitives and the submit buttons; `settings.spec` waits for the toast | C13, C07 | maintenance | 0.5 d | Flipping one unit assertion fails CI. `settings.spec` passes 40/40 per project. With chunks held, typing before hydration is refused and a fill after release saves the new text. |

**Next, in order:**
1. **C17**, the 30-minute loading move, with `useLinkStatus` feedback on the tabs.
2. **C11**, the version shown in the Forms row, the Overview waiting item and the newest-version default (0.5 d).
3. **C08**, the honest draft status and the Discard card.
4. **C12**, the Data plan first on iPad.
5. **C14**, the Maestro flows and one assistive-technology run, before the pilot.

**Measurement tasks** are listed in §4.6. **Polish** is everything in §3 not named here.

---

## 9. Questions for you

1. **Schema reset.** When does "every device is a development device" end? Before an observer collects real study data, will you freeze `SCHEMA_VERSION` for the pilot, or add a refuse-if-unsent guard? (C20)
2. **Fields-only forms.** Commit `b93a2b2` restored the fields-only form reader "for retained records". Under your policy, may hosted fields-only form versions and their observations be reset, so that the web, mobile and backend readers can all be deleted? (C19)
3. **Pilot devices.** Phones, or tablets only, and which Android tablet? This sets the priority between the phone-keyboard and landscape-tablet halves of C01, and which device the AT run uses.
4. **Skew protection.** Is Vercel Skew Protection on (Settings → Advanced)? If not, should the web deployment get a stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`? Either is a hosted change that needs your approval. (C03)
5. **Online basemaps.** Should an online basemap in an uploaded QGIS project block the package at all? The archive never contains tiles. (C04)
6. **"Sign out everywhere".** Should web Sign out ever end the phone session, or is local-only sign-out the intended behaviour everywhere? (C06)
7. **Preferences.** Ship the collector preferences (Dusk, larger text, hand, haptics, palette) in the pilot build, or remove the promises from PRODUCT.md and DESIGN.md? (C24)
8. **Form-version delivery.** Is a full QGIS re-upload per form revision acceptable for the pilot, or do you want a server "rebind" action first? (C11)

---

## 10. Coverage and limits

**Inspected.** All of `web/` and `mobile/`, including:
- Server Components, Server Actions, `proxy.ts`, the service worker and the native storage, sync, package and session layers;
- `contracts/` (`contour.json`, `map-palettes.json`, forms, the OpenAPI types), `scripts/`, CI, the plan and product docs;
- backend and database code only where a frontend contract or failure depended on it: package preparation, form-version authorization, the `site_packages` insert and the auth-js defaults.

**Journeys exercised:**
- **Web, in the browser, production builds:**
  - orientation, at 1440/1024/390 and in Day/Dusk;
  - overflow at 390 and 320 px (88 measurements);
  - API down, session expiry and no-access by role;
  - identity and back/forward cache across sign-out and a different account;
  - navigation and deep links, mutation propagation and double submit;
  - keyboard and dialogs, axe (60 runs, plus 10 on Forms), reflow and text spacing, map keyboard, and reduced motion;
  - Forms create, edit, publish and failure paths;
  - the imagery-blocked upload;
  - pre-hydration typing.
- **Full e2e at `0279fd3`:**
  - desktop-1440: 134/134 passed;
  - phone-390: 133/134; the only failure was `settings.spec`, explained by C07.
- **Native, iOS simulator only** (iPhone 17 Pro, iOS 26.5, a dev build dated 2026-10-10 running newer JS from Metro): first launch, sign-in, projects, sites, a failed hosted download (stale local schema), Training brief, Place, and Answer with the keyboard.

**Commands run (summary):**
- `pnpm --dir web check`
- `pnpm --dir web test:unit` (393/393)
- `test:api-errors`, `test:auth`, `test:account` (84)
- `pnpm forms:parity`
- `pnpm tokens:check`
- `pnpm plan:check`
- `pnpm mobile:check` and `pnpm mobile:test` (836 passed, 5 skipped)
- Expo iOS export (Hermes bundle 6.7 MiB)
- `pnpm db:start` in the cloud, with images pulled from `ghcr.io` because Docker Hub and ECR rate-limited (same images, documented command)
- `scripts/e2e-local.sh --prod --zones` for desktop-1440 and phone-390, plus repeated `settings.spec` runs
- Custom Playwright measurement and journey scripts kept in the scratch directories

**Conditions:**
- **Mac lab:** M1 Pro, Chromium 141 headless, local loopback stack, production Next build.
- **Cloud:** 4-CPU Linux container, same browser.
- **Throttled profile:** DevTools-style emulation (150 ms latency, 1.6/0.75 Mbps, 4x CPU), not Lighthouse simulation.
- **Samples:** 2-5 per cell. Ranges are small samples, not distributions.

**Not available, so not claimed:**
- No physical device.
- No Android runtime at all; every Android claim is code-derived.
- No release or profile native build; the only native run was a dev build on a simulator.
- No real network or hosted-latency measurement, and no field Core Web Vitals.
- No screen-reader (VoiceOver or TalkBack) pass.
- No native performance measurement (startup, memory, JS-thread cost).
- No device upload round trip: the collector's upload integrity rests on real-module tests and the backend-driven outbox tests.
- No Firefox or Safari.
- No real QGIS package of production size; the seeded archives were 1.6-2.5 KB.

**Partly covered:**
- **Journey 2** (download on a device): the hosted download failed on the Mac because of the stale schema.
- **Journey 3** after the first answers: the simulator run never reached Review or Saved.
- **Journey 4** (connectivity and account switching on a device): covered by unit and e2e tests only.

**Process limits:**
- The two skeptics for C19 and C20, and the final completeness critic, hit a usage limit. C24 and C39 were capped out of the skeptic pass. For all four, the orchestrator spot-checked the key claims in code (they hold as stated) and did the completeness review itself.
- The Mac run's journeys and performance were measured on code identical to `0279fd3` on the web side. The API process differed slightly.

**State left behind:**
- **Synthetic local data was changed** in the containers' disposable Supabase:
  - an extra project `uxw2-clean`;
  - `workspace-check-v5` published;
  - settings descriptions;
  - a site renamed and restored.
- **No hosted service was touched.**
- **An empty `/PROGRESS.md`** was left at the root of the cloud container by a verifier, outside the repository. A safety check blocked deleting it.
- **The GitHub branch `frontend-audit-evidence`** (pushed by you) holds the Mac evidence.
- **The cloud evidence lives only in this session's scratch directory** and disappears when the container is reclaimed. It includes the cluster file, skeptic notes, the hydration and boundary experiments, and the Forms run.
