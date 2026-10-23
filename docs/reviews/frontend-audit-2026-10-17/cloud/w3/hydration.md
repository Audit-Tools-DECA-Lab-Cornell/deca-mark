# runtime:hydration — project-settings input merge (repo 0279fd3, production build on :3000, React 19.3.0-canary-3f0b9e61-20260317)

Scripts, raw JSON and logs: `/tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w3/runtime-hydration/` (`out/` holds the results). Nothing under /home/user/deca-mark was edited (git status clean). Synthetic data I changed, all restored: project description, and the manager's display name (saved once by accident via the account form, then reset to "Local manager").

## 1. Reproduction

Chunks under `/_next/static/**` were held with `page.route` until released. The server HTML was visible but not hydrated. 5 runs per mode (`prehydrate.cjs`).

| Mode | Field after hydration | What Save sent / API stored |
|---|---|---|
| Playwright `fill`, hydration after (5/5) | OLD (NEW visible before hydration, then silently reverted) | no request; badge absent; Save answers "Nothing has changed since the last save." |
| select-all + keyboard.type at 80 ms/char (5/5) | OLD | nothing |
| click, End, type "+xyz" (5/5) | OLD | nothing |
| `pressSequentially` (5/5) | OLD | nothing |
| `fill` with chunks delayed a random 1-3 s (5/5) | OLD | nothing |
| fill's two steps split: `select()`, hydration, `insertText` (5/5) | NEWOLD | saved as NEWOLD |
| typing at human speed while hydration lands mid-string (5/5) | OLD plus the tail of what was typed (e.g. `OLD-typethrough-0ypethrough-0`) | saved garbled |

**Base failure rate, unmodified test, no delay.** Run via `scripts/e2e-local.sh`, 10 repeats per project, 5 of 20 failed:
- Desktop-1440: 3 of 10 failed. Two were NEW+OLD, one was a 45.9 s `page.reload` timeout.
- Phone-390: 2 of 10 failed, both 45 s reload timeouts.

**Standalone replica with the same poll cadence** (`replay-test.cjs`):
- Desktop: 4 of 24 merged, 1 reload aborted.
- Phone: 10 of 40 merged, 2 reloads aborted.

Instrumented natural runs (`trace-race.cjs`) merged 5 of 20.

With Playwright tracing on, the real spec failed only 1 of 70 runs here (30/30 on phone, then 1 failure in 40 on desktop), and that failure was the reload abort. Tracing shifts the timing.

## 2. Mechanism

Code: `web/node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js`.

**Textarea.** `initTextarea` (line 1339), called at hydration (line 2961), does this unconditionally:
- `element.defaultValue = V`;
- if `textContent === V`, `element.value = textContent`;
- `track(element)`.

The server value is therefore written over whatever the user typed. No `onChange` fires. React's replay of the queued `input` event sees the tracker equal to the DOM value and drops it, so the revert is silent.

**Why NEW+OLD, traced on the real page.** A DOM trace shows a select-all at t=218 ms. At t=250, React's `defaultValue=` write finds the selection `[0,13]`, and the next write sees `[0,0]`. Playwright's `insertText` then lands at index 0 and produces NEWOLD.

**Minimal proof, real react-dom, no SettingsScreen.** `mini/run.cjs` and `mini/run2.cjs`:
- Typed text before hydration reverts to OLD, with 0 `onChange` calls.
- select-all, hydrate, then `insertText` gave NEWOLD 5 of 5. The control (hydrate first) gave NEW.
- Making the `defaultValue` setter a no-op gave NEW 4 of 4.
- Making the `value` setter a no-op still gave NEWOLD 4 of 4.

So the `defaultValue=` write is what collapses the selection. The pure-DOM scripts (`minimal-dom*.cjs`) were inconsistent; only `minimal-dom3.cjs` reproduced, and only when selection was read between steps. Treat the real-React experiments as the proof, not those.

**SettingsScreen is not involved.** The `seen` resync, `useLeaveGuard` and the refocus effect are not involved: the minimal app has none of them and reproduces the same result.

**Input.** `initInput(..., isHydrating = true)` (line 1254, hydrating branch around line 1281) does not write `value`. The typed text stays on screen while React state still holds the old value, and no `onChange` fires. The next commit that changes that input's props (for example any state change in the parent, since `onChange` is a new closure each render) runs `updateInput` and silently overwrites the DOM with state. Verified on the project-name input (3/3): after hydration it shows "Typed before hydration", there is no unsaved badge, and Save says "Nothing has changed since the last save". Typing one character in the description then reverts the name.

## 3. Reload timeout

**It is not the leave guard.** `useLeaveGuard` registers `beforeunload` while the form is dirty, and dirty stays true until the save transition ends. A CDP probe showed the dialog does open when reload hits a pending save. With a dialog listener that dismisses it, the reload hangs. Without a listener, Playwright accepts it (`playwright-core/lib/server/dialog.js:close()` calls `accept`), and the spec has no listener.

**What actually happens (`reload-collision.cjs`, `reload-phase.cjs`).**
- The reload starts and the `beforeunload` dialog is accepted.
- The reload's document GET goes out while the Server Action POST is still in flight.
- When the action response lands, the Next router calls `history.replaceState`. This was logged 1 to 3 ms before `requestfailed`.
- The reload navigation is aborted: `page.reload: net::ERR_ABORTED`.

Results:
- Collision experiment: 4 of 4 aborted.
- Sweep of release offsets from -20 to +15 ms around the dialog: 17 of 27 aborted; 30 ms or later all reloaded.
- The real spec with trace on failed with `page.reload: net::ERR_ABORTED` at 1.2 s. Its trace shows the action POST from 55.902 to 56.066 and the reload GET starting at 56.005 and aborted.
- Replica runs: 3 of 64 aborted.

**Why the test hits it.** Natural timing (10 samples): the API shows the value 98-155 ms after the click, the action response headers arrive at 85-144 ms, and the toast at 135-213 ms. The window between "API stored" and "toast" is 25-65 ms. `expect.poll`'s second poll at +100 ms lands in that window.

**Untraced 45 s variant.** The untraced 45 s timeouts were not isolated. At 45 s the page was the old document, not dirty, with Save focused, consistent with an aborted reload. Whether the abort throws or hangs depends on timing, and tracing changes it.

**Can a person get stuck?** No stuck-dirty state is reachable. After the transition completes, the unsaved badge clears. A person pressing F5 inside the 25-65 ms window gets the browser's own "Leave site?" prompt. Clicking an internal link while a save is pending gets the app's own leave dialog, which is correct. The reachable hazard is different: HYD-5, a failed or hung Server Action.

## 4. Exposure (CDP: 150 ms latency, 1.6 Mbps down, 750 Kbps up, 4x CPU; 3 samples each; `exposure.cjs`)

"Painted" is two rAFs after the element appears. "Hydrated" is the element getting its React props. "Handler responds" is a probe clicking an inert dialog trigger every 10 ms until a dialog opens. The probe adds some load under 4x CPU.

| Page | Cold: painted → hydrated / handler | Warm | Unthrottled lab |
|---|---|---|---|
| Project settings (description) | 0.76-0.78 s → 2.89-3.01 s: window 2.11-2.23 s; handler 2.19-2.23 s | 0.43-0.85 s window; handler 0.53-0.96 s | 0.1-0.21 s (5 samples) |
| Site "Edit details" | button painted 0.79-0.88 s; handler 3.61-3.75 s; dead for 2.78-2.95 s | in DOM at 0.67-0.80 s; handler 1.6-1.75 s | n/m |
| Sign-in | 1.28-1.34 s | n/m | n/m |
| Form editor (question label) | 2.47-2.53 s | n/m | n/m |

Warm rAF timestamps are noisy, so I report DOM-in to handler for the Edit details row.

**Edit details dialog.** It has no editable field before hydration, because the dialog content mounts only on open. The trigger is inert until hydration, so a click is lost. That is low severity and not a data-loss issue.

**Pre-hydration reachability.** Controlled text inputs present in the server HTML (`inspect-inputs.cjs`):
- sign-in (email, password), sign-up (email, password, confirm), forgot-password, join (code);
- account (full name, initials, locale), project settings (name, description), form draft editor (question label, guidance), data filter (observer, search, dates).

Not rendered for the manager account, and not tested: org settings (owner only) and the zone editor's name and code.

Not reachable before hydration, because they mount on click: the Create site, Create project, Invite, New form, Add question and Edit site dialogs.

Behaviour of what I tested:
- **Textarea (project description):** reverted or merged, as above.
- **Settings name input:** text stays visible, then is wiped by the next re-render. No unsaved indicator, and Save says there is nothing to save.
- **Sign-in (3/3 runs):**
  - Typed email and password both stay visible, but clicking Sign in shows "Enter the email address you signed up with." and "Enter your password." with both fields filled, and sends no request.
  - A later keystroke in another field wiped the email.
  - Pressing Enter before hydration sent nothing.
- **Form editor:** the typed question label stays visible, but "Save draft" is disabled because the editor does not know the field changed.
- **Account:** Save worked and persisted the typed name. It posts the form data from the DOM, so it is fine by luck.
- **Data filter, forgot-password, join:** the text stays visible; I did not test what happens next.
- **Pre-hydration Save click:** performs a native GET form submit to `…/settings?`, a full reload that discards the typed text.

## 5. Classification and smallest fix

**HYD-1 is a CONFIRMED DEFECT a person can hit.** It also causes the test flake.

**Recommended product fix.** Add a hydration gate in the shared primitives (`web/src/components/contour/TextInput.tsx`, `Textarea.tsx`, `PasswordInput.tsx`, `CodeInput.tsx`):
- Hook: `const useHydrated = () => useSyncExternalStore(() => () => {}, () => true, () => false)`.
- Use it as `readOnly={readOnly || !hydrated}` or `disabled`. Keep the visual `readOnly` style tied to the caller's prop so there is no gray flash.
- Gate the form submit buttons the same way.

Tested in the minimal app, which approximates a primitive but does not prove it inside the real app (`mini/run3.cjs`, `mini/run4.cjs`):
- `disabled` until hydrated: pre-hydration typing is impossible; fill waits and yields NEW. The downside is that `autoFocus` does not focus.
- `readOnly` until hydrated: typing is ignored, fill waits (not editable), `autoFocus` still works, and there is no visual change. One residual case remains. A person who deliberately select-alls before hydration and types just after still gets NEWOLD, because readOnly allows selection.

Cost: dead fields for about 0.1-0.2 s at lab speed and about 1.3-2.2 s cold on the throttled profile. That is honest rather than silently lossy.

**Weighed and rejected: uncontrolled inputs with `defaultValue`.** The minimal app shows the textarea is still reverted (OLD) and merged (NEWOLD) because `initTextarea` clobbers regardless. Inputs would keep their text, but at the cost of reading FormData everywhere.

**Test-only change, validated 80/80 (`fixed-test.cjs`).**
1. After goto, loop up to 8 times: `fill(description)`, wait for the "Unsaved changes" badge (700 ms), and check `toHaveValue(description)`.
2. Click Save.
3. `await expect(page.getByText("Project settings saved.", {exact: true})).toBeVisible()` before polling the API and reloading.

Desktop and phone were 40/40 each, versus about 25% failure unmodified. 18 of the 80 runs needed a fill retry. With the product gate in place, step 1 collapses to a plain `fill` (Playwright waits for editable), but step 3 is still required for HYD-2.

## 6. Other

HYD-5, the failed Server Action on project settings, was reproduced here (`save-failure.cjs`). It is the same pattern as the Forms finding in runtime-forms.md.

ITEMS
- HYD-1 confirmed medium CONFIRMED DEFECT: Text typed before hydration is silently reverted or merged: controlled textarea is overwritten at hydration; fill racing hydration produces NEW+OLD | Product: a useHydrated() gate (useSyncExternalStore(noop, () => true, () => false)) applied once in the shared text primitives, TextInput, Textarea, PasswordInput and CodeInput, as readOnly={readOnly || !hydrated} (focus and autoFocus still work, no visual change) or disabled (blocks selection too, but breaks autoFocus), and the same gate on submit buttons. Do not use uncontrolled defaultValue: the minimal app shows the textarea is still reverted and merged. Test: in settings.spec.ts retry the fill until the 'Unsaved changes' badge shows and toHaveValue(description) holds, then wait for the 'Project settings saved.' toast before the API poll and reload. Validated 80/80 (40 desktop, 40 phone).
- HYD-2 confirmed low CONFIRMED DEFECT: page.reload() after Save is aborted by the still-pending Server Action (test race, not a stuck dirty state) | Test only: after clicking Save, await expect(page.getByText('Project settings saved.', {exact:true})).toBeVisible() (the transition and leave guard are done) before expect.poll and page.reload(). No product change.
- HYD-3 new medium CONFIRMED DEFECT: Controlled <input>s typed before hydration keep their text on screen but React state is empty: sign-in rejects filled fields, the editor cannot save, later re-renders wipe the text | Same hydration gate as HYD-1 in the shared primitives (readOnly until hydrated, plus useEffect focus if disabled is chosen for autoFocus fields). A per-form alternative, reading the DOM value in a mount effect, is not recommended: it cannot recover the textarea. Add a Playwright case: type before hydration on sign-in, then assert it either rejects typing or submits what is shown.
- HYD-4 new low CONFIRMED DEFECT: Clicking Save (or Enter) before hydration performs a native GET form submit that reloads the page and discards the typed text | Gate submit buttons with the same useHydrated flag (disabled={!hydrated}) in the shared Button usage for forms.
- HYD-5 new medium CONFIRMED DEFECT: A failed or hung Server Action on project settings unmounts the editor and loses the typed text | Wrap the await saveSettings(...) in the transition in try/catch and treat a throw as result {status:'failed', message:'Nothing was saved. …'} so the editor stays mounted with its draft; Settings already has the failure Note. Unconfirmed-change copy as in EditSiteDialog.
- HYD-6 new low DESIGN PREFERENCE: Site 'Edit details' and other dialog triggers are inert until hydration (no editable field exists before it) | None needed beyond a hydration gate on the button if wanted; leave as is.