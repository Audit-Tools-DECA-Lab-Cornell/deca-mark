# Forms journeys and Server Action failure handling (healthy schema)

Revision 0279fd3. Production build on :3000, API on :8001, local Supabase. The Playwright suites had finished before I started (DONE file present, no `playwright test` process).

Evidence directory: /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/. It holds PROGRESS.md, scripts/, data/ (JSON and page-text dumps) and shots/ (screenshots).

## Environment notes
- The e2e suite had already left the web-acceptance project dirty. Form `workspace-check` had v1 published (bound by Fall Creek's package v13), v2 a draft, v3 and v4 published, and 2 extra sites with no package. This made the UXW-2 Forms-list condition exist before I touched anything.
- The saved storage states in web/e2e/.auth expire at 16:05 UTC. I signed in again through the real sign-in form, using the public seed password constant read from web/e2e/support/auth.ts and never printed. I used my own storage state files in the evidence directory: wa-manager and zr-manager (zone-manager@fieldmaps.test).
- For the Overview 'Nothing needs attention' case I created one extra synthetic project, `uxw2-clean`, in the seeded org (/o/web-acceptance/p/uxw2-clean). I used the API with in-memory sessions of the seeded owner and manager. It has form uxw2-form v1 published, Site A with a ready package bound to v1, then v2 published. This is a write to the synthetic org only (script scripts/setup-uxw2.mjs). Nothing tracked or untracked in the repo changed (git status clean).
- I published once in the web-acceptance project: workspace-check-v5. That project's state is now v1, v3, v4 and v5 published, with v2 still a draft.
- The prior measure.cjs was not in the evidence copy. I re-implemented the method from SUMMARY.md: fresh context per sample, empty cache, PerformanceObservers, CDP encoded bytes, usable as the first rAF where the route predicate holds. Numbers are a 4-CPU cloud container, not field data, and not comparable 1:1 with the M1 Pro numbers.
- Accident: an unset-variable typo created an empty file at /PROGRESS.md at the filesystem root. The safety check refused my rm. It is empty and outside the repo; the owner can delete it.

## (1) Forms list, versions, detail, editor
Reproduced:
- Create draft: Versions, then Start new draft, opened workspace-check-v5 (a copy of v4).
- Change a question label, Save draft: the toast 'Draft saved' appeared. After a reload the edit was kept.
- Publish: the Publish page shows the change review ('1 question changed'). It also says 'Using another version of this form now: Fall Creek test site.' and 'Go to Sites to prepare a map package'. After the checkbox and Publish, v5 was published.

What the pages say about versions and sites:
- The draft editor says only 'Nothing reaches observers until you publish it'. It says nothing about which version observers collect with or which sites use which version.
- Its collector preview header reads 'Fall Creek test site ... MAP v13 workspace-check-v5 draft', although Fall Creek's current package binds v1.
- The Forms list gives no per-site version.
- The Versions list is correct per version: v5, v4 and v3 'No site', v1 'Fall Creek test site'.
- The Site page is correct: 'Form version workspace-check-v1'.

### UXW-2: confirmed, severity medium kept
Run in the clean project, uxw2-clean:
- Forms row: 'PUBLISHED uxw2-form-v2 ... USED BY Site A' (no version).
- Versions: v2 'No site', v1 'Site A'.
- Site page: 'Form version uxw2-form-v1'.
- Overview: 'Needs attention: Nothing needs attention. Every site has a ready map package, a form is published and no draft is waiting.' (shots/uxw2-overview-desk.png).
- The upload step defaults Form version to uxw2-form-v1, the older version. v2 is listed first but not selected, and there is no 'newer version exists' cue. This confirms the prior check's point (d).

In the web-acceptance project the Overview lists 4 other items, so it does not say 'Nothing needs attention' there. It also has no item for v5 against Fall Creek's v1.

The prior corrections stand: the Publish page and the Site and Versions pages do tell the truth, and the gap is the Forms row and the Overview.

## (2) WDI-1 / J-1: reproduced at 1440, with unsaved label edit then Save draft
- **cookie-clear** (`ctx.clearCookies()`):
  - The action POST gets a 307, then POST /sign-in returns 200, then the console shows 'An unexpected response was received from the server.'
  - The project error boundary renders: 'REQUEST INTERRUPTED / Something went wrong. Your records remain available.'
  - The editor is unmounted and the edit is gone. 'Try again' leads to the sign-in redirect.
  - This is the session-ended chain that was only code-traced before. It is now run.
- **aborted action POST** (`route.abort`): 'TypeError: Failed to fetch', then the same error boundary. The editor unmounts. Try again remounts the editor with the previously saved wording; the edit is lost. No beforeunload dialog appears.
- **offline** (`setOffline`, the finding's own scenario): same boundary. Try again cannot recover.
- 390 spot-check of the aborted POST: identical.

The boundary page says 'What failed: The page could not load its records'. That is false here: the page had loaded and the save failed. There is no 'Nothing was saved' copy and no hint that the edits were lost.

Other Forms actions, aborted POST (j3): Start new draft, Publish, Retire, Discard and 'Start a new draft from this version' all reach the same boundary. The dialog is gone and there is no inline 'Nothing was X.' note. Only the editor loses unsaved data, but all five give a wrong message and an unclear outcome.

Verdict: the finding holds for the three cases I ran. The prior check's severity of medium is reasonable. Its correction on the fix copy stands, since a bare proxy tweak would produce the generic UNCONFIRMED copy rather than a sign-in message.

Smaller new note (low, DESIGN PREFERENCE): ErrorView's 'Reference REQ-939D-68' was identical across runs and viewports. ErrorView.tsx:17-28 says a client error has no digest, so a hash of its message stands in. It cannot be matched to a server log, although the card says 'send the reference to your organization owner'.

## (3) Data and Overview with healthy forms
- 'Some questions could not be loaded.' is absent on /data in both projects (web-acceptance 8 rows, zone-review 520 rows). The string exists only at DataScreen.tsx:369.
- Overview has no forms card in HEAD. Forms feed only the Attention list ('No form is published' and draft items). The draft item renders: 'Workspace check has an unpublished draft, v2.'

## (4) Cold timings
Setup: web-acceptance project, 1440x900, production build, 4 CPUs, stack idle. One discarded warm-up per route, then 3 samples each in a fresh context with an empty cache. Values are median (min-max) in ms; CLS was 0 on every sample and there were no external hosts and no browser-to-API calls.

| Route | TTFB | FCP | LCP | usable | load | long tasks (n / ms) | requests / KB | doc KB wire / decoded | DOM nodes |
|---|---|---|---|---|---|---|---|---|---|
| /forms | 34 (34-37) | 128 (116-168) | 304 (284-328) | 288 (265-309) | 207 (187-214) | 0-1 / 0-69 | 29 / 444 | 15.1 / 57.5 | 210 |
| /forms/versions | 39 (37-40) | 148 (128-168) | 352 (336-364) | 328 (319-343) | 221 (207-231) | 1-2 / 52-113 | 29 / 442 | 15.6 / 81.1 | 353 |
| /forms/versions/workspace-check-v1 (published, read-only) | 38 (35-41) | 168 (148-180) | 432 (404-436) | 403 (372-412) | 223 (215-232) | 1-2 / 100-167 | 31 / 469 | 18.7 / 77.9 | 332 |
| editor, draft v2 | 36 (32-40) | 132 (124-184) | 420 (408-500) | 393 (375-460) | 214 (210-273) | 2 / 163-169 | 31 / 469 | 18.9 / 79.6 | 337 |

Usable predicates:
- /forms: main h1 visible, the Workspace check link present and 'Forms in this project' text.
- /forms/versions: main h1 and the first table row visible.
- Detail and editor: main h1, an input visible, and the collector view taller than 200 px.

Compared with the earlier stale-schema error-screen numbers, these now measure real pages. The editor and detail pages ship about 2 more scripts and about 27 KB more than the list pages. The 50-170 ms long tasks are absent in the earlier M1 data (0 long tasks on 29 of 30 routes); that is plausibly the slower CPU here. It is not diagnosed.

## (5) axe
axe-core via @axe-core/playwright 4.13.0, tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa. Day theme: `data-theme=day`, colorScheme light.

Routes tested: /forms, /forms/versions, version detail (published v1), editor (draft v2, also with an unsaved edit), plus the publish page as an extra.

Result: 0 violations at 1440 and 390 on all of them, with no horizontal overflow (scrollWidth equals the viewport width).

The only 'incomplete' items are color-contrast on detail and editor, in the collector preview, where the background cannot be determined because of overlap with the map. Those need manual review; they are not violations.

## Not reproduced or not done
See not_done.

{
 "not_done": [
  "Did not run the task's separate 'stop the API' scenario, per its own instruction to use only the cookie-clear and aborted-POST cases (I added offline as the finding's own scenario).",
  "Did not test a response-lost-after-commit case (a save that landed but whose reply was dropped), so 'may have saved' honesty is not exercised.",
  "Did not test the New form dialog action with an aborted POST (code-derived only); the other 5 Forms action sites were run.",
  "Cold timings were taken at 1440x900 only, not 390, and the detail and editor routes were measured on a published v1 and a draft v2. The two-route split is mine.",
  "axe ran in Day only; Dusk was not requested or run. The 'incomplete' color-contrast items in the collector preview were not reviewed manually.",
  "The Overview 'Nothing needs attention' case needed an extra synthetic project (uxw2-clean) created via the API in the seeded org; this is a write beyond the single publish in the web-acceptance project. The web-acceptance project now also has v5 published.",
  "The accidental empty file /PROGRESS.md at the filesystem root could not be removed (safety check refused rm); the owner may delete it.",
  "Zone-review project: only read-only page loads (Forms, Versions, Overview, Data) were done there; no edits or publish.",
  "No library source re-verification beyond the observed runtime behaviour; the React and Next internals cited by the prior WDI-1 check were not re-read."
 ],
 "evidence_files": [
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/PROGRESS.md",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/data/j2-desk.json",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/data/j2-phone.json",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/data/j3.txt",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/data/j4.txt",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/data/j5.txt",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/data/perf-desk.json",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/data/axe.json",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/shots/explore-wa-forms.png",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/shots/explore-wa-versions.png",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/shots/j1-04-editor-saved.png",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/shots/j2-cookie-clear-desk.png",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/shots/j2-abort-post-desk.png",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/shots/j2-offline-desk.png",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/shots/j4-04-forms-list-after-publish.png",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/shots/uxw2-forms-desk.png",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/shots/uxw2-overview-desk.png",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/shots/axe-forms-versions-phone.png",
  "/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/scripts/lib.cjs"
 ]
}