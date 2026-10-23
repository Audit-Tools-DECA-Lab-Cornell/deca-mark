

## C01 high/high CONFIRMED DEFECT — Collect on phones: the fixed 46% map slot plus the keyboard leave no room for the answer input or Continue; Android has no keyboard avoidance; Saved's forward button sits below the fold
members: UXC-01, N-1, N-2, MFD-1, UXC-07 | platform: mobile (iOS phones runtime-shown; Android edge-to-edge code-derived; tablets mostly fit) | journeys: C3 Answer; C3 Saved loop
evidence: Runtime-reproduced on the iOS simulator (iPhone 17 Pro, iOS 26.5, dev build; screenshots 14, 15, 16d and 19 plus a11y-tree frames). The Android half is code-derived: KAV behavior is undefined and the build is edge-to-edge. The phone Saved/controls half comes from layout arithmetic.
refs: /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/evidence/docs/reviews/frontend-audit-2026-10-17/runtime/native/PROGRESS.md; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/evidence/docs/reviews/frontend-audit-2026-10-17/runtime/native/14-answer-q1.png; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/evidence/docs/reviews/frontend-audit-2026-10-17/runtime/native/16d-keyboard-covers-answer-field.png; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/evidence/docs/reviews/frontend-audit-2026-10-17/runtime/native/19-q2-keyboard-numeric.png; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w2/results.json (verify:mobile N-1, N-2)
locations: mobile/src/features/collect/CollectScreen.tsx:476-483 panelBlock KeyboardAvoidingView, behavior={Platform.OS === 'ios' ? 'padding' : undefined} at :479; mobile/src/features/collect/CollectScreen.tsx:499 mapSlot height expanded ? '100%' : '46%'; mobile/src/features/collect/QuestionStep.tsx:141-145 ScrollView without keyboardDismissMode; :241-259 fixed Back/Continue and links rows; mobile/src/ui/Screen.tsx:100-105 (edge-to-edge: window does not resize; padding on both platforms); mobile/src/features/collect/SavedStep.tsx:85-162 ScrollView with 'Place the next observation' inside it at :146; mobile/src/features/collect/CollectMap.tsx:247-253 single absolute control column; :763-809 six IconButtons (~334 pt); mobile/src/features/auth/use-keyboard.ts:8 and mobile/src/features/onboarding/use-keyboard-visible.ts:8 useKeyboardVisible (two copies)
trigger: An observer on an iPhone in portrait reaches a text or number question ('Who is observing?', the required play-event summary, the inventory text questions) and taps the field. On an Android edge-to-edge phone or tablet the trigger is any text question. On any phone, the trigger is every Saved step.
behavior: Without the keyboard, the input is clipped to a sliver by a ScrollView viewport of about 150 pt. With the keyboard up (top at 539 pt), the field (y 529-579) and Back/Continue (y 592-648) are both behind it, and the typed text is invisible. Tapping elsewhere does not dismiss the keyboard; only the 'next' return key escapes. The number pad covers its field the same way. On Android, KAV does nothing and the window does not resize. On Saved, the card is about 400-450 pt against a panel of about 293-317 pt, so the loop's only forward button needs a scroll. 'Make the map larger', layers and location are clipped on phone map frames.
consequence: Observers type answers blind on phones (observer code, the required summary, Janet's 8 inventory text questions), so typos enter research data or the observer stalls. On Android tablets the field can be fully covered. Every observation costs an extra scroll and tap on phones.
fix: Move one useKeyboardVisible into src/ui, delete the other, and read it in CollectScreen. While the keyboard is up, set the map slot height to 0 and hide the status row through style only, so the map stays mounted and the size change is instant. On Answer/Review in portrait, use about 30% instead of 46%. Use behavior='padding' on both platforms (delete the Platform branch). Add keyboardDismissMode='on-drag' and keyboardShouldPersistTaps='handled' to the QuestionStep ScrollView. Pin 'Place the next observation' outside the SavedStep ScrollView, as Place, Question and Review already pin theirs. Use two control columns when the frame is under about 340 pt. No new library.
deletable: The Platform branch in the panel KAV and one of the two useKeyboardVisible copies
keep: MapLibre stays mounted across Place, Answer, Review and Saved (no remount, no camera reset). The slot size changes instantly, never by animation. Per-keystroke draft writes are unchanged.
verify: On the iOS simulator (iPhone SE 3rd gen and iPhone 17 Pro, portrait and landscape), the pilot Android tablet and an Android edge-to-edge emulator: Training > Practice garden > Start > Place point > 'Who is observing?'. Focus the field and assert with Accessibility Inspector or Maestro assertVisible that the field and Continue sit above the keyboard and the typed text is visible. A drag dismisses the keyboard, and the camera is unchanged afterwards. On Saved, 'Place the next observation' is visible without scrolling on iPhone 14 portrait, and all six map controls are hittable on a 284 pt frame.
effort: 0.5-1.5 days including device checks
rank: Ranked first because it blocks the core data-entry step on phones and is runtime-shown on the iOS simulator. Prior verdicts: UXC-01 high (Mac kept high but corrected the KAV arithmetic), N-2 high, N-1 medium, MFD-1 cut to medium because the pilot is a tablet, and UXC-07 medium and tablet-safe. I keep the cluster high: the iPhone half is observed, the README targets phone layouts (844x390), and the Android half sits on the same KAV line with a one-word fix. Confidence is high for iOS portrait and medium for Android, which had no device run.
skeptic_focus: Attack three points. Will pilot observers actually use phones, or only tablets where the field may fit? Did the simulator's keyboard-appears-only-after-typing quirk distort the 16d frame? Does behavior='padding' really lift the panel on an Android edge-to-edge build (never run on a device)?

## C02 high/high CONFIRMED DEFECT — The collector misstates upload state: Account and Sign out say it 'does not upload yet', Delete account says it 'cannot upload them first', practice records are 'held' for a project, and the Observations tab is the legacy screen with its own words
members: MOB-REC-02, UXC-02, N-6, S2, UXC-04, A11Y-01 | platform: mobile (iOS and Android, all sizes) | journeys: C4 sign-out; C4 delete account; C3 Saved; C4 Observations
evidence: Code-derived: the strings and the live uploader were verified at HEAD, and the practice-record path was traced through observation-store and registry. The legacy Observations tab was seen in an operator-verified tablet screenshot (2026-10-11).
refs: /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/evidence/docs/reviews/frontend-audit-2026-10-17/results/verify-mobile-records-notes.md; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/evidence/docs/reviews/frontend-audit-2026-10-17/results/verify-ux-mobile-collector-notes.md; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w2/results.json (verify:mobile N-6)
locations: mobile/app/(app)/(tabs)/account/index.tsx:35-40 doc comment; :135-138 Note 'This version does not upload yet.' (testID account-no-upload); mobile/app/(app)/(tabs)/account/sign-out.tsx:125-131 ('This version does not upload yet, so they wait here either way'); mobile/app/(app)/(tabs)/account/delete-account.tsx:186-191 Alert 'This version cannot upload them first. They stay on this device and can never upload.'; mobile/src/features/account/leaving.ts:83 uploadFirstLabel (exported, unused); mobile/src/features/collect/SavedStep.tsx:115-120 heldOnly 'form … is not published to the server yet'; mobile/src/features/guide/content.ts:~83-84 'Held: the project has not published this form version yet'; mobile/app/(app)/(tabs)/observations/index.tsx:3-6 ObservationsTab <Redirect href='/records'>; mobile/app/records.tsx:31-36 STATES (pending 'Held', synced 'Synced'); :57, :62, :88-131; mobile/src/features/preview/queue.ts:9-14 STATUS_TO_STATE (the product vocabulary); mobile/src/storage/observation-store.ts:27-31 initialSyncState; mobile/src/forms/registry.ts:30-32 isUploadableRecord (practice records never upload)
trigger: A signed-in observer opens Account, Sign out or Delete account, saves a Training practice record, or taps the Observations tab.
behavior: The uploader is live (SyncProvider is mounted and uploads while signed in), yet Account and Sign out say it does not upload. Delete account says uploading first is impossible. Practice records (shell-v1, local-only) are shown as 'Held … not published yet' and counted as 'not uploaded'. The Observations tab REPLACEs the whole (app) stack with the dark Nocturne screen. That screen has no dock, shows 'Held' for pending and 'Synced' for uploaded, uses an 11.5 pt text-only chip and no header role, and its Retry re-sends the same frozen body.
consequence: At the decisions that can strand data, the app says the opposite of the truth. An observer deleting an account with unsent records is told that uploading first is impossible, confirms, and those records can never upload. At sign-out they are told nothing would upload anyway. Account and Observations use different words for the same state, so 'is my work safe?' gets two answers. Practice records look as if they are waiting on a manager.
fix: (1) Delete both 'does not upload yet' notes and the stale doc comment. On Sign out say: 'Signing out pauses their upload until {email} signs in again on this device.' (2) On Delete account with unsent > 0, call sync.wake() and offer the already-written uploadFirstLabel ('Upload N first'), or say 'Stay online with the app open until they show Uploaded'. (3) For practice records, say 'Practice record: stays on this device and is never uploaded' in SavedStep, the guide and leaving.ts, and exclude them from the 'not uploaded' count. (4) Use one exported status map (queue.ts STATUS_TO_STATE) for Account and Observations. (5) Replace the Redirect with a Contour list (ListRow plus StateBadge) inside the tab stack, then delete records.tsx, components/screen.tsx PageScreen and their Nocturne palette and fonts.
deletable: Both 'does not upload yet' notes and the doc comment; the records.tsx STATES table; the legacy records screen, components/screen.tsx PageScreen and the Nocturne palette and fonts; the Observations Redirect
keep: 'Uploaded' only from a validated receipt. A signed-out account's records stay under its own scope, and no other account uploads them. Rejected records keep their safe message.
verify: With one pending and one practice record: Account shows 'On device 1' and no 'does not upload' text. Sign out names the pause. Delete account offers 'Upload 1 first' and then shows Uploaded. Saved after a practice record says it is never uploaded. The Observations tab keeps the dock and uses On device, Uploaded and Needs attention. A grep for 'does not upload yet' and 'cannot upload them first' returns nothing, and account-screens.test.tsx:144 and :264 are updated.
effort: Copy and count fixes 2-3 h; one status map 1-2 h; Contour Observations list 1-2 days
rank: Ranked second because the app makes false statements at the moment an observer decides about unsent records, and the delete-account statement can make the loss irreversible. Prior verdicts disagreed. UXC-02 and N-6 said high. MOB-REC-02 and S2 said medium, because delete needs a network and the live uploader usually drains first. UXC-04 said medium and A11Y-01 low. I keep high for two reasons. Practice and needs-attention rows always remain at that prompt, and with C09's backoff, pending rows can sit for minutes while the phone is online. The copy is also false however often it is hit. The legacy tab is merged here because its fix (one status map, one list) is shared; on its own it would be medium.
skeptic_focus: Can a non-practice unsent record realistically remain at the delete-account confirm, given that the delete call needs a network and the uploader wakes on connectivity? Is the legacy records screen still reached at HEAD exactly as the 2026-10-11 screenshot shows?

## C03 high/high CONFIRMED DEFECT — Any rejected Server Action (offline, session ended, deploy skew) unmounts the screen into 'Something went wrong' and discards unsaved form-editor and settings edits
members: WDI-1, J-1, HYD-5, NEW-LOADMORE | platform: web | journeys: Manager edits a form draft; Project settings; Data: Show the next 500
evidence: Runtime-reproduced in the browser: cookie clear, an aborted action POST and offline each reached the boundary on the draft editor, at 1440 and 390. All six Forms action sites reached the same boundary. Project settings with an aborted, 500 or hung action also reached it (save-failure.cjs). The deploy-skew trigger is code-derived from the installed Next 16.2.7 (UnrecognizedActionError). loadMore is code-derived.
refs: /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w2/runtime-forms.md; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/data/j2-desk.json; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/data/j3.txt; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w3/runtime-hydration/out/save-failure.json; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/evidence/docs/reviews/frontend-audit-2026-10-17/results/runtime-journeys.md
locations: web/src/features/forms/DraftEditorScreen.tsx:149-183 start(async () => { await saveDraftAction(...) }) with no catch; :198-208 startFromThis; web/src/features/forms/PublishScreen.tsx:79, RetireDialog.tsx:37, DiscardDialog.tsx:41, NewFormDialog.tsx:79, FormVersionsScreen.tsx:100; web/src/features/project-settings/SettingsScreen.tsx:120-133 startSave(async () => await saveSettings(...)); web/src/features/data/DataScreen.tsx:186-205 loadMore try/finally without catch; web/src/proxy.ts:17,33-43 (307 redirect of the action POST to /sign-in); web/node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js:69-80 (UnrecognizedActionError on an unknown action id), :111-121; Other transition sites with no catch: features/org/settings/SettingsScreen.tsx, org/settings/TransferOwnership.tsx, org/projects/CreateProjectDialog.tsx, project-settings/ArchiveIsland.tsx, people/InviteDialog.tsx, people/MembersTable.tsx, people/InvitationsTable.tsx; web/src/components/shell/ErrorView.tsx ('What failed: The page could not load its records')
trigger: A manager clicks Save draft, Save changes, Publish, Retire, Discard or 'Show the next 500' while offline, after the session has ended (for example signed out on another device; see C06), or in a tab that was opened before a deploy.
behavior: Cookie clear: the action POST gets a 307, POST /sign-in returns 200, the console shows 'An unexpected response was received from the server', and the project boundary renders 'REQUEST INTERRUPTED / Something went wrong. Your records remain available … What failed: The page could not load its records'. The editor unmounts and the unsaved label edit is gone; Try again remounts the last saved wording. An aborted POST and offline behave the same way. On Settings, a reset or 500 action replaced the page within 2.5 s, and a hung action disabled the fields until the fetch died at 8 s. loadMore swallows the rejection and re-enables its button with no message. Deploy skew throws UnrecognizedActionError into the same path.
consequence: A manager loses every edit made since the last successful save of a form draft (possibly a whole question set) or of the settings form, and is told the page failed to load rather than that nothing was saved. A solo developer who deploys during the pilot will trigger this for any manager who has an editor open, unless skew protection is on.
fix: Add one settleAction(promise) helper that turns a rejection into the existing typed {status:'failed', message}. Use it at every transition call site: the editor save first, then Settings, the Forms dialogs, loadMore and the people/org dialogs. Copy for a transport failure: 'Nothing was saved. Check the connection and save again. What you typed is still here.' When unstable_isUnrecognizedActionError(error) is true: 'DECA Mark was updated. Copy your changes, reload, then save.' In proxy.ts, answer next-action POSTs with 401 instead of a 307 and say 'You were signed out. Sign in again in another tab, then save.' Never advise a reload while edits are unsaved. Keep the leave guard.
deletable: Nothing; the change replaces the generic boundary on these paths
keep: ETag/If-Match compare-and-set on drafts with its 409/412/428 conflict copy; no optimistic UI; the leave guard's Back and link interception; an unknown outcome is never reported as saved.
verify: Playwright on desktop and phone: open the draft editor with an unsaved label change. Run each failure in turn: route.abort on the action POST, context.clearCookies(), context.setOffline(true), and a request with a bogus Next-Action header. After clicking Save draft, the editor stays mounted, the edit is still in the field, an inline 'Nothing was saved' note shows, there is no ErrorView, and no row changed. After restoring the connection, one Save succeeds. Repeat for the project Settings description and for 'Show the next 500'.
effort: 0.5-1 day (helper about 20 lines, ~17 call sites, proxy tweak, one Playwright spec)
rank: Both prior verdicts said medium: the loss is limited to edits since the last Save and the triggers are transient. I raise it to high for three reasons. The runtime pass reproduced it with three independent triggers, including plain offline, on Settings as well as Forms and at both widths. The installed Next.js adds a routine fourth trigger, deploy skew, for a developer who ships during the pilot. And the explanation on screen is false. It ranks below C01 and C02 because it loses preparation work, not research records. NEW-LOADMORE shares the root cause and the fix; J-1 and HYD-5 are runtime confirmations.
skeptic_focus: Is 'high' earned? How often will a real manager have unsaved editor work at the moment of a transport failure? Is Vercel Skew Protection already enabled on the web project, which would remove the deploy-skew trigger? Would a 401 for next-action POSTs disturb the zone editor's existing 401 pause and resume?

## C04 high/high CONFIRMED DEFECT — A map upload blocked by the server's imagery check (any QGIS project with an online basemap) is reported as a malformed zone ring
members: UXW-1 | platform: web + API (package preparation) | journeys: M1 upload a map package
evidence: Script-reproduced with the real issueText, plus a code trace of the backend worker's exit(2), which drops the blocked detail. The README states that the lab's Ithaca project has XYZ layers.
refs: /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/evidence/docs/reviews/frontend-audit-2026-10-17/results/verify-ux-web-manager-notes.md; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/evidence/docs/reviews/frontend-audit-2026-10-17/results/surviving-compact.json
locations: backend/src/fieldmaps_api/domain/packages.py:237-296 _check_imagery_licence (precise blocked detail); backend/src/fieldmaps_api/domain/zone_archive_worker.py:48-49 except (PackageError, ValidationError): sys.exit(2); backend/src/fieldmaps_api/services/zone_archives.py:24 INVALID_SOURCE, :48-50 generic PackageError; web/src/features/packages/UploadStep.tsx:147-181 uploadProblem -> issueText(issue.code) zone-ring copy; web/src/features/packages/ProjectImport.tsx (Read project lists the basemap as 'not converted … remain in QGIS'); web/src/features/packages/UploadStep.tsx:~627 slot hint, ~645-654 Remove on the project slot (unsignposted workaround)
trigger: A manager uploads a map package with the QGIS project in the project slot when that project contains an XYZ or WMS layer. qgis/README.md:53 says the lab's Ithaca project has such layers.
behavior: The server computes a blocked imagery-licence check with an exact explanation. The worker then exits with code 2, and the API returns invalid_structure with no zones. The web shows 'Not uploaded. A zone's shape could not be read. Check that each of its rings is closed and has at least three different points.'
consequence: The first real map upload of the lab's own project fails and sends the manager to repair zone rings that are valid. Nothing points back to the basemap, or to the one-click workaround of removing the project file. Every collection depends on this upload.
fix: In the worker, write the first blocked PreparationCheck (step plus detail) to error.json before exit(2). Return it in the 422 as issue code package_check_blocked with its message. In uploadProblem, show failure.detail for any non-zone issue code instead of issueText. Cheapest interim fix: Read project flags network raster layers as 'This basemap will block the upload: remove it in QGIS, or remove the project file and upload GeoJSON only.' Optionally delete the unreachable 'blocked package' history, attention and getPackage fan-out code after a SQL count, since only 'ready' rows are ever inserted.
deletable: The unreachable 'blocked package' display paths (overview/model.ts:103-115, the Overview getPackage loop, packages/page.tsx:99-107), once a SQL count confirms there are no blocked rows
keep: Packages with unlicensed network imagery are still refused. Real zone-ring errors keep their specific copy.
verify: Upload the Fall Creek fixture with a .qgz that has an XYZ layer: the message names the layer and the remedy. Upload the same zones as GeoJSON only: it succeeds. Upload a fixture with an unclosed ring: the ring message is unchanged. A backend test asserts that the 422 carries package_check_blocked.
effort: 0.5-1 day (worker, service, web mapping and tests); the interim Read-project warning takes 2-3 h
rank: Kept high, as the Mac pass kept it: an ordinary task is blocked with a misleading reason on the manager's first real upload of the lab's own project. The Mac corrections are applied: Read project does name the layer, the 8 MB case is blocked on the client, and a workaround exists. It is not data loss, which puts it below C03. It ranks above C05 because it is near-certain at first use.
skeptic_focus: Check the real Ithaca .qgz, not the README: will the pilot QGIS projects still contain XYZ or WMS layers at upload time? Does the Read project note already lead managers to remove them before they press Upload?

## C05 medium/medium CONFIRMED DEFECT — A double tap on an auto-advancing single-choice answer clears it or silently answers the next question
members: UXC-03 | platform: mobile | journeys: C3 Answer
evidence: Script-reproduced with the real session reducer and the janet-test-v1 form. The UI geometry (AnswerGrid sits outside the keyed FadeIn, and Q2's grid is about 46 pt higher) is code-derived. Real tap timing was not measured.
refs: /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/evidence/docs/reviews/frontend-audit-2026-10-17/results/verify-ux-mobile-collector-notes.md
locations: mobile/src/features/collect/CollectScreen.tsx:42 AUTO_ADVANCE_MS = 160; :205-218 dispatchStep advance timeout; mobile/src/forms/session.ts:83-89 'choose' on the already chosen option un-chooses it; mobile/src/features/collect/QuestionStep.tsx:~181 answer tile onPress (no mount-time guard); mobile/src/ui/AnswerTile.tsx
trigger: An observer double-taps an answer tile (gloves, habit, laggy touch) on the age, play-type or subtype questions, which are all single-choice with auto-advance.
behavior: A second tap 120 ms later leaves answers {}, so the answer is cleared. A second tap 250 ms later gives {age_range: age_3_5, play_type_1: exploratory}: the next question is answered without being read, and the screen jumps two questions ahead.
consequence: Play-type codes that nobody chose enter the research data, unless the observer reads every Review row while watching children.
fix: In QuestionStep, record when each question mounts and ignore tile presses for about 400 ms after that. Inside the same window, a re-tap of the selected option is a no-op. Keep the 160 ms auto-advance.
deletable: 
keep: Auto-advance stays, validation happens only at Review, and every Review row still jumps back to its question.
verify: Unit test: choose at t, then choose again at t+120 ms and at t+250 ms. The answers stay as after the first tap, and the screen is on Q2 with Q2 unanswered. On the pilot tablet and an iPhone, rapid double taps on Q1 tiles change nothing beyond the first answer.
effort: 1-3 h plus a test
rank: Both passes said medium and I agree, accepting the Mac correction that the jump is visible. It ranks fifth because it is the only finding that silently writes wrong research answers, which matters more than the remaining medium items (pauses, delays, flicker).
skeptic_focus: In the rendered UI, does the second tap really land on a live Q2 tile? How often do double taps under 300 ms occur on the pilot hardware? Does Review catch the error in practice?

## C06 medium/high CONFIRMED DEFECT — Web Sign out and 'Not you?' revoke every session for the account, including the phone collector, while the Account page promises the opposite
members: WEB-R1, WDI-2 | platform: web (affects the mobile collector and other web sessions) | journeys: Account sign out; Invite/Join 'Not you?'
evidence: Code-derived from the installed auth-js: signOut defaults to scope 'global' at GoTrueClient.js:3417, and the web calls it with no options. Not run end-to-end with a phone.
refs: 
locations: web/src/lib/auth/actions.ts:136-146 signOut (supabase.auth.signOut() with no scope at :138); web/src/features/auth/actions.ts:124-133 switchAccount ('Not you?' on /invite and /join, :127); web/src/features/account/SecurityIsland.tsx:23 footnote 'Signing out here does not affect the app…'; web/node_modules/.pnpm/@supabase+auth-js@2.117.2/node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:3417 signOut(options = { scope: 'global' }); mobile/src/auth/provider.tsx:89 (the collector correctly uses scope 'local')
trigger: A person signed in to the collector with the same account signs out on the web, through the account menu or 'Not you?' on an invite or join page.
behavior: Every refresh token for the user is revoked. The phone keeps collecting from its cached account, but its next refresh (within about 1 h) fails, uploads stop, and it shows 'Sign in to resume uploads'. Other web sessions also end, and their next Server Action hits C03.
consequence: The on-screen promise is false. A manager who also collects stops uploading until they sign in again on the phone. Records are not lost.
fix: Pass { scope: 'local' } at lib/auth/actions.ts:138 and at features/auth/actions.ts:127. Optionally delete the fm-place cookie at the same point. If 'sign out everywhere' is ever wanted, make it a separate, explicitly worded control.
deletable: 
keep: Sign-out still clears this browser's auth and flow cookies, invalidates the router cache and bfcache (a cookie write inside an action) and redirects to /sign-in.
verify: Sign in with the same account on the web and the iOS simulator. Sign out on the web, then force a token refresh on the phone (short local JWT expiry, then background and foreground): uploads continue. Repeat with 'Not you?' on /join. A second browser stays signed in.
effort: 15-30 min plus a manual check
rank: The Mac pass cut both findings from high to medium (no record loss, needs the same account on both devices, recovery is one sign-in), and I agree. It sits just outside the top five because its impact is an upload pause, not loss or wrong data. It is still the cheapest correction in the audit, and it also removes one way into C03.
skeptic_focus: 

## C07 medium/high CONFIRMED DEFECT — Text typed before hydration is reverted, merged or ignored by the shared controlled inputs; a Save before hydration does a native GET
members: HYD-1, HYD-2, HYD-3, HYD-4, HYD-6 | platform: web | journeys: Sign in; Project settings; Form editor; e2e settings.spec
evidence: Runtime-reproduced in the browser with chunk delivery gated (5/5 per mode), and proven in a minimal app using the real react-dom canary (initTextarea's defaultValue write collapses a select-all). The e2e base rate is 5/20 failures, and a fixed variant passed 80/80. Exposure was measured on a throttled profile.
refs: /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w3/runtime-hydration/prehydrate.cjs; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w3/runtime-hydration/out/minimal-react.json; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w3/runtime-hydration/fixed-test.cjs; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/e2e/
locations: web/node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js:1339-1356 initTextarea (called at :2961); :1254-1296 initInput (the hydrating branch skips the value write); web/src/components/contour/Textarea.tsx:25-80, TextInput.tsx, PasswordInput.tsx, CodeInput.tsx (controlled, no hydration gate); web/src/features/project-settings/SettingsScreen.tsx:144-146, :169-178, :206; web/src/features/auth/SignInForm.tsx:55-108 (autoFocus email); web/src/features/forms/QuestionSettings.tsx:121-145; web/e2e/settings.spec.ts:13-19; web/src/features/sites/EditSiteDialog.tsx:84-100 (trigger inert before hydration)
trigger: A hard load (reload, bookmark, link or sign-in redirect) on a slow link or device, followed by typing or password-manager autofill before hydration. The window is 0.1-0.2 s in the unthrottled lab, and cold on the throttled profile it is 1.3 s on sign-in, 2.1-2.2 s on settings and 2.5 s in the form editor.
behavior: A textarea reverts to the server value at hydration with no onChange. A select-all that races hydration yields NEW+OLD, and that garbled value saves. Inputs keep the text on screen, but React state does not have it. Sign-in then shows 'Enter the email address you signed up with.' and 'Enter your password.' with both fields filled, and sends nothing. The settings name shows no unsaved badge and is wiped by the next re-render. The form editor's Save draft stays disabled. Save or Enter before hydration issues a native GET to …/settings?, which discards the text. settings.spec fails 5 times in 20.
consequence: Manager text is silently reverted or saved garbled, first sign-in fails confusingly on a slow link, and the only flaky e2e test hides real regressions.
fix: Add one useHydrated() hook (useSyncExternalStore(noop, () => true, () => false)) in components/contour. Apply it once in TextInput, Textarea, PasswordInput and CodeInput as readOnly={readOnly || !hydrated}, keeping the read-only style tied to the caller's prop, and put disabled={!hydrated} on form submit Buttons. In settings.spec.ts, wait for the 'Project settings saved.' toast before the API poll and the reload. Do not switch to uncontrolled defaultValue: the textarea is still overwritten.
deletable: 
keep: autoFocus still works (readOnly keeps focus), CLS stays 0, and inputs stay server-rendered.
verify: In Playwright, hold /_next/static with page.route. Typing before release is refused (readonly), and fill after release gives NEW, with no NEWOLD in 20 runs. Sign-in submits what is shown. settings.spec passes 40/40 on desktop-1440 and on phone-390.
effort: 2-4 h including the spec change
rank: I take the prior step's medium for HYD-1 and HYD-3, its test-only reading of HYD-2, low for HYD-4 and design preference for HYD-6. They are folded together because one gate fixes all of them. Not in the top five: it needs a hard load, involves no observation data, and the window is short at normal speeds. It is still worth doing early, because it causes the suite's only flaky test and the fix touches four shared files.
skeptic_focus: 

## C08 medium/medium CONFIRMED DEFECT — Draft write failures are invisible on Collect ('Draft kept on this device' is hard-coded); a Review-tap race leaves a ghost draft that makes the next observation's draft writes fail; an unreadable draft blocks collection with no discard card
members: MOB-REC-03, UXC-05 | platform: mobile | journeys: C3 interruption and recovery
evidence: Script-reproduced with the real draft-store and observation-store (ghost-draft.mts: 1 observation plus 1 ghost draft; next saveDraft throws DraftConflictError; saving the ghost fails with UNIQUE). The UI gaps are code-derived.
refs: 
locations: mobile/src/features/collect/CollectScreen.tsx:423-437 hard-coded 'Draft kept on this device as you answer'; mobile/src/session/draft-persistence.ts:29-38 (unreadable -> setStatus only), :88-95 (saveDraft failure -> failed()); mobile/src/session/provider.tsx:125-128; mobile/src/features/collect/ReviewStep.tsx:171-177, :229-232 (rows and links pressable while saving); mobile/src/session/observation-actions.ts:82-85, :128-138, :191, :221; mobile/src/storage/draft-store.ts:107-129 readDraft; mobile/src/session/recovered-drafts.ts:63 unreadable (no consumer); mobile/src/features/projects/UnfinishedCard.tsx:63-101
trigger: (a) The observer taps a Review row or 'Keep answering' while 'Saving on this device…' is shown, a window of tens of ms. (b) Any saveDraft failure: disk full, authorization removed, or a DraftConflictError left by a ghost draft. (c) A draft the current schema cannot parse, which happens only after a schema tightening without a SCHEMA_VERSION bump.
behavior: (a) The queued saveDraft re-inserts a draft carrying the committed id. The next observation's saveDraft then throws DraftConflictError. On restart the ghost is offered, and saving it fails with 'UNIQUE constraint failed'. (b) A failure only sets session.status, which no Collect screen renders, while the status line keeps claiming the draft is kept. (c) Projects shows no card, and every 'Set up this session' answers 'Resume or discard the unfinished observation first' with no Resume or Discard on any screen.
consequence: After the race, the next observation lives only in memory while the screen says it is kept, so a force quit or crash loses it. Case (c) dead-ends collection and invites a reinstall, which wipes every unsent record.
fix: Drive the Collect status line from the last draft write result, showing 'Not kept: this observation is only in memory. Save it now.' on failure. Disable Review rows and the 'Keep answering' and 'Discard observation' links while saving. Add an UnfinishedCard variant for an unreadable draft with a confirmed Discard that calls the existing discardRecovered. Skip per-row safeParse hardening of every table, since the bump-and-reset policy already covers schema drift.
deletable: 
keep: Per-keystroke draft writes through the serialized queue; record insert and draft delete in one transaction; recovery that never substitutes another map, zone or form.
verify: Unit test: queue a commit and then a saveDraft for the same id with rows disabled, and no ghost row results. Force a saveDraft failure and the 'Not kept' line renders. Screen test: an unreadable draft shows a card with Discard, after which 'Set up this session' works.
effort: 0.5-1 day
rank: The Mac passes put MOB-REC-03 at low and UXC-05 at medium. I set the cluster at medium. The race is real and reproduced with the real stores, and the hard-coded durability line is a misleading success on the collector's central promise. Trigger (c) is limited by policy, because a schema change is supposed to come with a bump and a reset.
skeptic_focus: 

## C09 medium/high CONFIRMED DEFECT — Upload retry delays (up to 5 min) survive reconnect and foregrounding: an observer back on Wi-Fi sees nothing upload
members: MOB-REC-04 | platform: mobile | journeys: C4 returning from the field
evidence: Script-reproduced with the real coordinator, sync-store and foreground drain (backoff.mts).
refs: 
locations: mobile/src/sync/coordinator.ts:65-82 (now + max(retryAfter, min(300000, 5000*2^min(attempts,6)))); mobile/src/sync/bound-upload.ts:45-56 (timeouts and network errors -> retry); mobile/src/storage/sync-store.ts:31-40 pendingObservations next_attempt_at <= ?; :108-130 deferObservation; mobile/src/sync/provider.tsx:117-129 (wake on connectivity and foreground; 5 s timer); mobile/src/features/preview/queue.ts:76 uploadNow = wake (no UI caller)
trigger: Uploads fail repeatedly while NetInfo reports online (weak field signal, timeouts); 7 failures reach the 300 s cap. The observer then opens the app on good Wi-Fi.
behavior: Delays run 5, 10, 20, 40, 80, 160 and 300 s, and attempts never reset. Ten seconds after the 7th failure, a foreground plus connectivity wake made 0 upload calls; one upload went out after about 305 s. Only retryAttention resets next_attempt_at, and its button exists only for needs-attention rows.
consequence: Records stay 'On device' for up to 5 minutes of open app after the observer is back online. Because uploads run only in the foreground, an observer who closes the app sooner leaves them on the device until next time. The records are delayed, not lost.
fix: When connectivity returns and when the app comes to the foreground, run one UPDATE that sets next_attempt_at = 0 for pending rows (not needs-attention), then wake. The alternative is to cap retry-class delays at about 30 s.
deletable: 
keep: Aborts caused by backgrounding or going offline are not counted as attempts. Needs-attention rows stay terminal until an explicit retry. The frozen body and receipt matching are untouched.
verify: Coordinator test: after 7 failures, a connectivity wake triggers one upload call at once. On a device, toggle airplane mode with a failing API, then restore it: the upload happens within seconds.
effort: 1-2 h with a test
rank: The original finding and the Mac pass both said medium and reproduced it, and I agree. It also feeds C02, because rows remain unsent when the observer decides about sign-out or deletion.
skeptic_focus: 

## C10 medium/high CONFIRMED DEFECT — Every token refresh rebuilds the package machinery: a running site download is cancelled silently, installed sites flash 'Not downloaded', every package is re-verified, and /v1/me and /sites are re-fetched
members: MOB-REC-05, MFD-2, UXC-06 | platform: mobile | journeys: C2 download and Ready offline
evidence: Code-derived. The dependency chain was verified, along with auth-js's refresh-inside-getSession path and the suppressed catch. Not run on a device; the existing provider test uses a stable session object.
refs: 
locations: mobile/src/auth/provider.tsx:160-196 onAuthStateChange sets a new session object (TOKEN_REFRESHED included); :197-201 startAutoRefresh; mobile/src/packages/hosted/provider.tsx:50-58 api useMemo deps [client, session, userId]; :61-77 operations; :95-104 effect setDownloads({}), setInstalled([]), cleanup operations.dispose(); :129/:134 silent return when !runtime.current(); mobile/src/packages/hosted/operations.ts:51-55 dispose aborts running downloads; mobile/src/auth/me-provider.tsx:174 effect deps include session; mobile/node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:2540-2547 (getSession refreshes within 90 s of expiry), :4287 TOKEN_REFRESHED; mobile/src/packages/hosted/HostedPackageIsland.tsx:70-86
trigger: An observer downloads a site, or has a site screen open, while signed in and online when the access token refreshes. That happens about hourly, and on resume when getSession refreshes a token near expiry.
behavior: The new session object produces a new api and a new PackageOperations. The effect clears downloads and installed, and its cleanup aborts the running download. The catch is suppressed, so the progress vanishes with no failure state. The island shows 'Not downloaded · {size} · needs a connection' until catalog() has re-hashed and re-validated every retained version, and MeProvider re-fetches /v1/me and the sites.
consequence: While preparing for fieldwork, an observer can believe a download is running after it was cancelled, and briefly sees a ready site as not downloaded. Full re-verification on every refresh costs CPU and battery as versions accumulate.
fix: Key api, operations and the MeProvider effect on client, userId and session !== null instead of the session object; the token getter already calls getSession() for each request. Hold markAccountDeleted in a ref.
deletable: 
keep: Generation and current() fences that discard late work after an account change; verified install and catalog re-verification at app start; sign-out still disposes operations.
verify: Provider test: replace the session object mid-download with the same user. The download completes, installed is unchanged and catalog is not re-run. On a device, start a large download and force a refresh with a short local JWT expiry: progress continues.
effort: 1-2 h plus a test
rank: The Mac pass rated MOB-REC-05 and MFD-2 medium and UXC-06 low. I keep the cluster medium: the mechanism is confirmed with a one-line cause, and it hits a task observers do before fieldwork. The chance per download is modest (about 8% for a 5-minute download).
skeptic_focus: 

## C11 medium/high CONFIRMED DEFECT — Managers cannot see which form version observers actually collect with: the Forms row pairs the newest version with sites on an older one, Overview says 'Nothing needs attention', the upload defaults to the older version, and delivering a new version needs a full QGIS re-upload
members: UXW-2, UXW-4 | platform: web + API | journeys: M1 publish a form version so collectors get it
evidence: Runtime-reproduced in the browser in a clean synthetic project (uxw2-clean): the Forms row, the Overview text and the upload default were all observed. The UXW-4 cost is code-derived; the server computes the per-zone change and discards it.
refs: /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w2/runtime-forms.md; /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/run/forms/shots/uxw2-overview-desk.png
locations: web/src/features/forms/model.ts:49, :78-85 formRows (sites unioned over all versions), :91 published = newest; web/src/features/forms/ProjectFormsScreen.tsx (Used by column); web/src/features/overview/model.ts:86-147 attentionItems; web/src/features/packages/forms.ts:49-60 (upload Select defaults to the current package's version); web/src/features/forms/PublishScreen.tsx:175-194 'Go to Sites to prepare a map package'; model.ts:285-296 deliveryOf; backend zone_publication.py ~194-206 import_package discards validation.zones[].change
trigger: A manager publishes form v2 while sites' current packages bind v1, which is the normal sequence after any form correction.
behavior: The Forms row reads 'PUBLISHED uxw2-form-v2 … USED BY Site A' with no version. Versions shows v2 'No site' and v1 'Site A', and the Site page shows v1. Overview says 'Nothing needs attention. Every site has a ready map package, a form is published and no draft is waiting.' The upload step defaults to v1 and lists v2 first but unselected. Delivering v2 means re-uploading the whole QGIS export and confirming zones one at a time, and an older QGIS zones layer replaces boundaries edited on the web without any note.
consequence: Observers keep collecting on the old protocol while the manager believes the correction is live.
fix: Show site plus version in the Forms row's 'Used by' (from versions[].sites). Add an Overview waiting item: '<form> vN is published; no site's map names it, so observers still get vM'. Default the upload Select to the newest published version, or flag that a newer one exists. Surface validation.zones[].change from the import as 'Boundary changed since vN: …'. A server 'rebind' action that publishes vN+1 from the retained archive is the real fix for UXW-4, but it is feature work.
deletable: 
keep: Packages name their form versions exactly, and records stay bound to the version they were collected with. The Publish page keeps its delivery copy and checkbox.
verify: With v1 bound and v2 published: the Forms row reads 'Site A · v1', Overview lists the waiting item, and the upload step preselects v2. Re-uploading an older zones layer shows the boundary-changed note.
effort: Forms row, Overview item and default 0.5 day; boundary note 0.5 day (backend and web); rebind action 2-4 days
rank: Both passes confirmed UXW-2 at medium, and the browser reproduced it. UXW-4 was reframed as DEMONSTRATED COMPLEXITY because the re-upload is the designed contract. They are merged because both stem from form binding existing only through packages. Medium and outside the top five: the Site, Versions and Publish pages do tell the truth.
skeptic_focus: 

## C12 medium/medium CONFIRMED DEFECT — On iPad and laptops under 1280 px, the Data site plan renders after the whole loaded table (up to 500 rows)
members: UXW-3 | platform: web (iPad, narrow or zoomed laptops) | journeys: M5 find returned observations on the map
evidence: Code-derived from the DOM order and the xl breakpoint, plus the phone-390 screenshot of the stacked order. No tablet render was made.
refs: 
locations: web/src/features/data/DataScreen.tsx:375-401 grid only at xl ('grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]'); the Observations island precedes DataMap; web/src/features/data/DataScreen.tsx:210-214 selectMarker scrollIntoView moves to the row
trigger: A manager opens Data on an iPad (1024 or 768 px wide) or in a narrow laptop window.
behavior: Below xl, the plan is stacked under up to 500 rows. Selecting a marker scrolls to its row, away from the map.
consequence: The map-and-table review loop needs long scrolling on the iPad, which is a stated manager device.
fix: Below xl, render DataMap before the Observations island (order-first) at a compact height. At xl, make it sticky top-4.
deletable: 
keep: One map version with other-version points dimmed; the table remains the non-map equivalent; roving rows.
verify: Playwright at 1024x768 and 768x1024: the top of DataMap is above the first table row. At 1440 the layout is unchanged.
effort: 1-2 h
rank: The Mac pass kept it at medium with medium confidence because no tablet render exists, and I agree. It is cheap to fix.
skeptic_focus: 

## C13 medium/high CONFIRMED DEFECT — Guards that exist but never run automatically: 393 web unit tests, forms:parity and the token check are not in CI; the collector-to-API acceptance driver and the recovery-cookie checks have no runner
members: TEST-01, S3, TEST-02, NEW-TEST02-CI, NEW-AUTH-RECOVERY-UNRUN | platform: web + mobile + CI | journeys: 
evidence: Measured re-run of the suites at 0279fd3: test:unit 393/393 in 4.55 s, forms:parity 0.44 s, tokens:check 1.0 s, mobile 836 plus 5 skipped. ci.yml and the root scripts were inspected.
refs: /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w2/verify-tests.md
locations: .github/workflows/ci.yml:26-43 web job (web:check, test:api-errors, test:auth, test:account, build); package.json:40-46 (root test = mobile + backend + db; forms:parity :44; tokens:check :46); web/package.json:31 test:unit; web/AGENTS.md:7; docs/Workspace.md:67; database/tests/test_mobile_bound_upload_api.py:31, :95-110 and test_mobile_package_api.py (outside backend testpaths); mobile/src/sync/bound-upload-api.acceptance.test.ts:22-23 it.skipIf(!MOB29_BOUND_API_FIXTURE); web/tests/auth-local.test.mjs:90-125 (opt-in only); web/src/lib/auth/actions.ts:54-68 recoveryVerified
trigger: Any change to web modules, to the byte-copied form engine, to the tokens, or to the recovery-cookie comparison.
behavior: CI runs 84 web tests. The suites above pass locally and are never run in CI. Backend CI already drives the real TS transport against the real API for two outbox scenarios. The install, offline, restart, v2, drain and export-403 acceptance driver is referenced by nothing. The fm-recovery mismatch refusals are asserted only by a hand-run script.
consequence: A regression in zone-save states, form conflict handling, the web copy of the form engine, contrast pairs or the password-reset shortcut passes CI, while the docs say CI covers it.
fix: Add three lines to the CI web job: 'pnpm --dir web test:unit', 'pnpm forms:parity' and 'node scripts/contour-tokens.mjs --check' (about 6 s). Move test_mobile_bound_upload_api.py and test_mobile_package_api.py under backend/tests, a pattern CI already runs. Port auth-local's three cookie-tamper cases to auth-flows.spec.ts with context.addCookies, then delete auth-local.test.mjs and test:auth:local. Add test:unit to the root test, or correct Workspace.md:67.
deletable: 
keep: The contracts diff job and the seed and plan guards stay. Playwright stays out of PR CI (run it nightly or by hand).
verify: A branch that flips one unit assertion fails the web job. Editing the web engine copy without the mobile source fails parity. The backend job lists test_mobile_bound_upload_api.
effort: 1 h for the CI lines; 1-2 h to move the Python tests (pre-pull the Docker image); 2-3 h to port the tamper cases
rank: TEST-01 came in high and the cloud cut it to medium; S3 was medium. TEST-02 was cut to low by NEW-TEST02-CI, which showed that the TS transport does meet the API in CI. NEW-AUTH-RECOVERY-UNRUN is low. The cluster is medium: nothing fails today, but this is the cheapest high-leverage step for a solo developer about to change many of these modules.
skeptic_focus: 

## C14 medium/medium MEASUREMENT NEEDED — No device-level verification: no native runner, the collect screens are never rendered on a real React Native runtime, and the promised assistive-technology matrix has never run
members: TEST-03, A11Y-09, A11Y-08, N-4 | platform: mobile (and web for the AT matrix) | journeys: 
evidence: Code-derived: a fake react-native fixture, MOB-18 and MOB-21 still todo. The simulator run showed the gap concretely, because the high-severity collector defects were invisible to the suite. N-4 (tab bar missing from the XCUITest tree) is a simulator observation that has not been explained.
refs: 
locations: mobile/src/ui/native.fixture.tsx:1-207 (stubbed hosts; 'layout is checked on the simulator'); mobile/src/ui/screen.fixture.tsx:52-102; mobile/PLAN.md:406-419 (MOB-18 todo), :575-580; MOB-21 native runner todo; web/PLAN.md:512 manual matrix pending; mobile/src/ui/Button.tsx:183-186, :205-233 (disabled reason only as accessibilityHint, which becomes Android tooltipText); mobile/src/ui/TabDock.tsx:78-181 (custom tab bar)
trigger: Any layout, keyboard, kill-and-relaunch or screen-reader behaviour of the collector.
behavior: Component tests render a hand-written fake react-native, and CollectScreen, CollectMap and QuestionStep are never rendered. The keyboard defect (C01), the double tap (C05) and the tab swap (C02) were found by hand or on the simulator. TalkBack reading of disabled reasons and VoiceOver reaching the tab dock are unverified.
consequence: Regressions in exactly the screens observers touch can ship unnoticed, and every native accessibility claim is code-derived.
fix: Create mobile/maestro/ with two flows against the bundled Training site on the iOS simulator and an Android emulator. Flow 1: start, place, answer two questions with the keyboard up (assert the field and Continue are visible), kill, relaunch, check the Unfinished card, Resume and see the answers restored. Flow 2: account A saves offline and signs out; B signs in and sees nothing; A signs back in and the record uploads once. Run both by hand before each pilot build. Run the 9-scenario AT checklist once on the pilot iPad and Android tablet, and record it in MOB-18.
deletable: 
keep: Keep the node:sqlite store tests and the fake-RN screen tests; they cover logic cheaply.
verify: Both flows pass on both simulators and fail when the C01 fix is reverted. The AT checklist is recorded with device, OS and result per scenario.
effort: 1-2 days for Maestro setup and two flows; 0.5-1 day per device for the AT run
rank: TEST-03 came in high; the Mac pass made it medium and MEASUREMENT NEEDED, and I keep that. The gap is demonstrated by what the simulator found, but the remaining risk of each unrun check is unmeasured. A11Y-09, A11Y-08 and N-4 (all low) are merged because a device run settles all of them.
skeptic_focus: 

## C15 low/high CONFIRMED DEFECT — The 5-second sync tick bumps the revision when nothing changed: Account and Sign out flash 'Reading records…', Sign out briefly ignores taps, every focused screen re-reads all records and the collect map rebuilds its sources
members: MOB-REC-06, MFD-3, UXC-08 | platform: mobile (signed in, online, foreground) | journeys: 
evidence: Script-reproduced with the real foreground.ts (13 drains, 13 changed() calls). The listObservations lower bound was measured on node:sqlite (2.1 ms at 50 rows, 13.7 ms at 500). The UI effects are code-derived, and Hermes cost is unmeasured.
refs: 
locations: mobile/src/sync/provider.tsx:50 changed = setRevision; :100 activateHeldObservations on every drain; :127-129 setInterval 5000; mobile/src/sync/foreground.ts:18-21 changed() after every drain; mobile/src/storage/use-observations.ts:18-47 setLoading(true) on every revision; mobile/app/(app)/(tabs)/account/index.tsx:89-90; mobile/app/(app)/(tabs)/account/sign-out.tsx:47, :50, :80, :97-98; mobile/src/features/collect/CollectScreen.tsx:121-124 mapRecords memo; mobile/src/features/projects/site-versions.ts:32-80
trigger: Any signed-in observer with the app open and online.
behavior: Every 5 s, each focused consumer sets loading and re-reads and zod-parses every row. Account swaps its counts for 'Reading records from this device…', Sign out swaps its warning and ignores taps while loading, and the map receives new FeatureCollections.
consequence: Flicker on the screens where observers check whether their work is safe, an occasional ignored Sign out tap, and continuous work that grows with the record count.
fix: Have the coordinator and activateHeldObservations report whether they changed a row, and call changed() only when they did. In useObservations, set loading only on the first read for a key and keep the previous rows during re-reads. Replace the fixed interval with one timeout to the earliest next_attempt_at, or delete activateHeldObservations with C19.
deletable: 
keep: Real changes (wake, retryNow, acknowledge, defer) still refresh every consumer, and uploads still resume without user action.
verify: A drain test asserts no changed() on an empty drain. A screen test shows Account without the loading text on a bump with unchanged rows. On a device, Account stays steady for 30 s while online.
effort: 0.5 day
rank: The verdicts split: MFD-3 medium CONFIRMED DEFECT, MOB-REC-06 low DEMONSTRATED COMPLEXITY, UXC-08 low CONFIRMED DEFECT. I make it a low CONFIRMED DEFECT. The flicker and the ignored tap are shown; the CPU cost is small at pilot record counts and unmeasured on Hermes.
skeptic_focus: 

## C16 low/high CONFIRMED DEFECT — Page-level read failures are handled inconsistently: the publish review turns failed reads into 'No other version of this form is published', one outage shows two different screens, org failure pages lack an h1, and the error card's 'Reference' is a hash of a client message
members: TEST-05, J-2, J-5, J-9, FORMS-REQREF | platform: web | journeys: 
evidence: J-2 was runtime-observed in the browser during an API outage. FORMS-REQREF was runtime-observed (the same REQ-939D-68 appeared across runs). TEST-05's publish-page collapse was re-checked in code at HEAD. J-5 and J-9 are code-derived.
refs: 
locations: web/src/app/(app)/o/[org]/p/[project]/forms/versions/[version]/publish/page.tsx:143-155 (failed formList and siteList collapse to empty); web/src/app/(app)/o/[org]/layout.tsx:21-39 (fresh load: shell-less LoadFailure 'this organization', HTTP 200); web/src/app/(app)/o/[org]/p/[project]/layout.tsx:22-26 (returns null; collectOnly redirect at :26); web/src/lib/api/workspace.ts:99-115 resolveOrg/resolveProject throw (17 unguarded call sites); web/src/app/(app)/o/[org]/p/[project]/forms/page.tsx:22-31 (observer reads before the redirect); web/src/features/org/NoAccess.tsx:7-19; web/src/components/contour/ScreenState.tsx:88 (h3 only); web/src/proxy.ts:33-38, :52-58 (no signed-out reason; signed-in users can open /sign-in); web/src/components/shell/ErrorView.tsx:17-28 (reference derived from the message when there is no digest)
trigger: An API read fails on the publish review page or during client navigation, an observer opens a manager URL, a member opens org settings, or any client error reaches ErrorView.
behavior: The publish review states 'No other version of this form is published.' and drops the 'Changes since' diff. In an outage, a fresh load shows 'Couldn't load this organization' without the shell, while client navigation shows 'Something went wrong'. An observer's /forms visit runs getProject, listSites and listForms before redirecting. Org failure pages have no h1. ErrorView shows the same reference for every 'Failed to fetch'.
consequence: A manager can publish believing no other version is in use. Failure screens depend on how the page was reached, and a reference the card says to send to the owner cannot be matched to any server log.
fix: On the publish page, settle formList and siteList and show a note ('Couldn't check other versions; try again before publishing'), as the draft editor's baseProblem already does. Add one requireProject() page helper that settles the workspace, applies the collectOnly redirect and returns a LoadFailure element, and use it at the 17 call sites. Render PageHeader on org no-access and failure states. Have ErrorView omit the reference when there is no digest. Optionally lead the sign-in page with 'Sign in to continue.' when ?next= is present. Add web/tests/unit/page-failures.test.mjs with a 503 stub.
deletable: 
keep: The honesty rule: a failed read never renders as an empty list. Manager-only pages still check the role before reading.
verify: page-failures.test.mjs fails at HEAD on the publish page and passes after the fix. With the API stopped, a fresh load and a client navigation show the same LoadFailure with the tabs kept.
effort: 0.5-1 day
rank: The Mac pass upgraded TEST-05 to a medium CONFIRMED DEFECT (a live violation). The cloud cut J-2 from the runtime's 'Medium' to low, and J-5 and FORMS-REQREF are design preferences. I set the cluster low: each member needs a transient failure or an unusual route, and publishing is still gated by a checkbox. They are merged because one helper and one page-failure test cover all of them.
skeptic_focus: 

## C17 low/high CONFIRMED DEFECT — Project and org loading.tsx are remounted on every tab switch, so React 19.3's 300 ms reveal throttle holds ready pages behind an empty card (about 250 ms warm floor)
members: WEB-R2 | platform: web | journeys: 
evidence: Measured in a controlled experiment: seven production builds, 5 samples per cell, warm and cold. Moving the project loading.tsx up one level (F), or an explicit Suspense in the layout (G), removed the floor.
refs: /tmp/claude-0/-home-user/9dff5b0d-8911-5ffb-ab1c-009ec22eb4bb/scratchpad/w2/boundary-summary.md
locations: web/src/app/(app)/o/[org]/p/[project]/loading.tsx:5-11 ProjectLoading; web/src/app/(app)/o/[org]/(org)/loading.tsx:5-11 OrgLoading; web/node_modules/next/dist/client/components/layout-router.js (the parent's loading wraps each child segment in a Suspense keyed by that child); react-dom-client.production.js (Next compiled React 19.3 canary) FALLBACK_THROTTLE_MS = 300; web/src/components/contour/ScreenState.tsx:92-96
trigger: A manager switches project tabs (overview, data, sites, forms) or org tabs.
behavior: Warm click-to-usable on tab switches was 327-360 ms, against 79-205 ms with the boundary moved up. Content became usable 215-275 ms after its RSC response ended. Moves within one tab took 100-190 ms in every build. The empty card shows on every tab switch.
consequence: At lab latency, every tab switch in the review loop waits about 250 ms longer than the server needs and flashes a skeleton. When the hosted round trip is slower than about 300 ms, the delay shrinks to just the flash.
fix: Move p/[project]/loading.tsx up to p/loading.tsx, or wrap {children} in one Suspense with the same skeleton in p/[project]/layout.tsx. Treat (org)/loading.tsx the same way. Optionally show a pending state on InkTabs with next/link useLinkStatus, so a slow hosted response still gives feedback.
deletable: 
keep: Cold loads still stream the skeleton. Prefetch stays off.
verify: Re-run the boundary harness (run/boundary/run.cjs) for build A against F on overview to data, data to sites, and site to forms. Warm usable should drop from about 330 ms to about 220 ms or less, cold should be unchanged, and the skeleton should still show on a hard load.
effort: 30 min - 2 h
rank: The Mac pass said medium, and the experiment confirms the mechanism and the fix. I set it low because the cost was measured at loopback latency, and the throttle only adds time when the RSC response beats about 300 ms, which hosted round trips (Vercel to the Render API to Supabase) often will not. It is cheap enough to do anyway.
skeptic_focus: 

## C18 low/high DEMONSTRATED COMPLEXITY — The Data page renders every loaded record twice (desktop table plus a CSS-hidden card list): 15.2k DOM nodes and 2.2 MB of HTML at 500 rows
members: MFD-5, WEB-R4, PERF-4 | platform: web | journeys: 
evidence: Measured: SSR node attribution (12.5k of 15.2k nodes are table plus cards, 4.5k of them cards) and cold and throttled perf JSON (one 114-121 ms long task unthrottled; 944 ms of long tasks at 4x CPU over n=2).
refs: 
locations: web/src/features/data/DataTable.tsx:55-100 (table in 'hidden md:block'); web/src/features/data/DataTable.tsx:103-131 (card list 'md:hidden'), both always mounted; web/src/components/contour/Table.tsx:82-83 (each Tr is a client component calling useRouter); web/src/components/map/SitePlan.tsx:691-731 (about 2.5k marker elements); web/src/app/(app)/o/[org]/p/[project]/data/page.tsx:181-206 (about 420 KB of RSC props)
trigger: A manager opens Data for a project with about 500 returned observations.
behavior: Both renderings are mounted. Removing the card list takes the page to about 10.7k nodes and about 1.85 MB; the rest is the table, the markers and the props.
consequence: Slower hydration on slow devices and a heavier document. No user-visible defect on a manager's laptop.
fix: Render one structure: either a table whose rows restyle as cards below md with CSS (keeping the OBS link, roving tab stop and data-record-id), or mount the card list only below md. No virtualization.
deletable: 
keep: A real link per record, one tab stop with roving rows, and counts honest about the 500 cap.
verify: SSR node count at 500 rows drops by about 4.5k. At 4x CPU (n>=5), long-task total drops by about a third. Phone-390 still shows cards.
effort: 2-4 h
rank: Both cloud verdicts are low DEMONSTRATED COMPLEXITY, and so is mine. The 944 ms figure is n=2 at a phone-class CPU emulation, while managers use laptops.
skeptic_focus: 

## C19 low/high DEMONSTRATED COMPLEXITY — Compatibility and dead code that the no-legacy policy makes deletable: old-route redirects, legacy SW cache names, migrateLegacySession and extra URL schemes, the frozen 'legacy' owner scope, write-only mobile tables, the web fields-only form path, and the tests that pin them
members: WEB-R8, S4, S5, S6, MOB-REC-07, MOB-REC-09, MFD-9, N-5, NEW-LEGACY-REDIRECTS, TEST-07 | platform: web + mobile | journeys: 
evidence: Code-derived, by grep and inspection. The expo-linking warning was seen in the Metro log of the simulator run.
refs: 
locations: web/next.config.ts:14-31 OLD_ROUTES, :39-42 redirects(); web/e2e/removed-routes.spec.ts; web/e2e/support/routes.ts:85-100 REMOVED_ROUTES; web/src/lib/pwa/service-worker.js:2-4 LEGACY_CACHE/LEGACY_PREFIX, :65; web/tests/auth.test.mjs:58,69; web/src/features/forms/LegacyVersionScreen.tsx; web/src/app/(app)/o/[org]/p/[project]/forms/versions/[version]/page.tsx:25-29, :85-93; .../publish/page.tsx:36; web/src/lib/labels.ts:29-40 roundOf/roundLabel/roundName accepting null; mobile/app.config.ts:17-18 scheme ['DECAMark','decamark','fieldmaps']; mobile/src/platform/auth-storage.ts:81-95 migrateLegacySession; mobile/src/auth/client.ts:12; mobile/src/data/legacy/scope.ts:2-11; mobile/src/auth/session-retention.ts:27-31; mobile/config/{development,staging,production}.json:6 bundleIdSuffix '.dev'; mobile/src/storage/session-store.ts; database-migrations.ts:48-50 active_sessions; package-references.ts:20-24; package-catalog-read.ts:70 readSelected; packages/hosted/operations.ts:216 selected(); sync-store activateHeldObservations (called at sync/provider.tsx:100); backend legacy_forms.py, definition_format 'legacy' and LegacyDefinition (outside this frontend audit)
trigger: Maintenance: every change near these paths.
behavior: There are 11 redirects for Nocturne and sample routes, pinned by a spec that passes either way. The service worker keeps legacy cache names. migrateLegacySession reads the keychain on every staging and production start. Three URI schemes are declared, and expo-linking ignores two. owner_scope is built from three constants that 'must stay byte-for-byte stable'. Tables and modules have no production reader (active_sessions is counted and is always 0). The fields-only reader, restored in b93a2b2, sits behind isCanonical branches. Tests pin null rounds and migrateLegacySession.
consequence: No user-visible defect. The cost is extra code and tests to read and keep green, and the scope constants block an honest account key.
fix: Web PR: delete OLD_ROUTES and redirects(), removed-routes.spec and REMOVED_ROUTES, the legacy cache names and their two test names, the null-round branches and their three tests. After resetting hosted fields-only form_versions, also delete LegacyVersionScreen, both isCanonical branches, VersionRow.legacy and its strings, and the fields reader and fixtures. Mobile PR, with one SCHEMA_VERSION bump: keep only the scheme 'decamark'; delete migrateLegacySession and legacyStorageKey with their 4 tests; build owner_scope from the configured connection and userId and delete data/legacy/scope.ts; delete session-store, the dead tables and their readers, selected/readSelected and activateHeldObservations; set the development bundleIdSuffix to '.local'.
deletable: Everything listed in smallest_fix
keep: Keep package_authorizations, the in-memory lease and the draft and record reference counts that refuse package removal. Keep SW safeResponse and the RSC/Authorization bypass. Keep account isolation by owner_scope (now from real values) and the userId check before any token use. Old addresses fall to the designed 404.
verify: Web: old addresses return the designed 404, and tsc, lint, test:unit and e2e pass. Mobile: biome, tsc and mobile:test pass. A dev device opens to an empty collector after the bump, which is sanctioned. The A to B to A isolation tests pass with the new scope, and expo-linking prints no scheme warning.
effort: Web 2-4 h; fields-only removal 2-4 h on the web (backend separately); mobile 0.5-1 day
rank: Every member was verified as DEMONSTRATED COMPLEXITY, low. The owner decisions turn S1's 'cannot be removed safely' into 'remove with a schema bump', and override MFD-9's 'do not bump'. The Mac pass refuted S4 because the owner had retained the fields-only reader (b93a2b2). The binding decision for this audit (old formats are deletion material; server data may be reset) reverses that, and the conflict is flagged.
skeptic_focus: Do hosted form_versions or observations still use the fields-only definition? Does 'resetting server data is fine' cover them, given that b93a2b2 says a 'preservation and transition decision' is still required? Does any producer of fieldmaps:// links remain (pending-invitation.ts:67 consumes them)?

## C20 low/high DESIGN PREFERENCE — A SCHEMA_VERSION change drops every collector table, unsent observations and drafts included, with no count or warning (owner-sanctioned pre-launch reset)
members: MOB-REC-01, S1, TEST-04 | platform: mobile | journeys: 
evidence: Script-reproduced with the real initializeDatabase (2 unsent rows, then 0 observations and 0 drafts, marker set).
refs: 
locations: mobile/src/storage/database-migrations.ts:5 SCHEMA_VERSION = 6; :55-89 initializeDatabase (equality check :61, drop loop :69-79, :80 resetSchema and user_version); mobile/src/storage/initialize-collector.ts:9-18; mobile/app/_layout.tsx:105-107 SQLiteProvider onInit; mobile/src/storage/database-migrations.test.ts:16-60 (asserts the tables are empty after a reset for versions [1,2,3,4,99])
trigger: A build with a different SCHEMA_VERSION is installed over a device that holds unsent records or drafts.
behavior: Every table is dropped and recreated before any screen appears, package files are cleared through the package_files_need_reset marker, and nothing is counted or announced.
consequence: Under the owner's decision this is a sanctioned reset of development data, not record loss. It becomes record loss the first time a bump reaches a device that holds real research records.
fix: No code change now. Keep the test and shrink its loop to [SCHEMA_VERSION - 1, 99]. Before the first real collection, the owner either freezes SCHEMA_VERSION for the pilot or adds the refusal guard (count sync_state <> 'synced' plus drafts inside the transaction, then throw a typed error that the root boundary renders). That choice is an open question, not a defect.
deletable: 
keep: The reset stays atomic, and the package_files_need_reset marker keeps file cleanup crash-safe.
verify: Nothing now. If a guard is chosen: a populated test database with 1 pending row and a version mismatch refuses the reset and keeps the row.
effort: 0 now; the guard takes 0.5 day if wanted
rank: Originally a critical CONFIRMED DEFECT (MOB-REC-01, S1), with TEST-04 at medium. The Mac pass made them medium DESIGN PREFERENCE. The binding owner decision says the wipe is sanctioned and is not record loss, so I take it to low. It remains a launch gate (see policy_notes).
skeptic_focus: Will 'every device is a dev device' still be true at first real use? Could any device that collects real study data receive a SCHEMA_VERSION bump with unsent rows? Is the downgrade case (an older build over a newer database) equally sanctioned?

## C21 low/high CONFIRMED DEFECT — Rotating the device remounts the collect map and step panel (camera and aim reset), contradicting the screen's own 'map stays mounted' rule
members: MOB-REC-08, UXC-09 | platform: mobile | journeys: 
evidence: Code-derived: the tree shape differs by orientation. Both passes confirmed it.
refs: 
locations: mobile/src/features/collect/CollectScreen.tsx:474-503 (side ? row tree : stacked tree; map at body>View>View vs body>View; panelBlock at child index 1 vs 2); mobile/src/features/collect/CollectScreen.tsx:64-70 doc 'MapLibre stays mounted from the first point to the hundredth'; mobile/src/layout/use-layout.ts:25-34 wide = !portrait
trigger: With 'Follow the device' orientation (the default), the observer rotates during Place, Answer or Review.
behavior: React sees a different parent tree, so it unmounts and remounts MapLibre and the panel. The camera returns to the zone centre, and the panel's local state resets.
consequence: Aim and zoom are lost mid-placement, which means extra work. Drafts persist, so no record is lost.
fix: Render one tree with identical wrapper Views, and switch flexDirection and sizes through style only. Use fixed child slots, so a null status still takes a slot.
deletable: 
keep: Instant slot size changes and the existing 46% and side-panel layouts.
verify: Rotate during Place with the map zoomed: the camera is unchanged, and a mount counter in CollectMap stays at 1.
effort: 2-4 h; do it together with C01, which restyles the same tree
rank: Both passes said low, and the cloud verifier dismissed the double-save consequence. The real cost is the camera loss.
skeptic_focus: 

## C22 low/high CONFIRMED DEFECT — Collect map accessibility gaps: VoiceOver hears nothing when the cross leaves its zone (live regions are Android-only), two messages are announced twice, the camera ignores Reduce Motion, and the cluster marker is a 36 pt target
members: A11Y-03, A11Y-04, A11Y-07 | platform: mobile | journeys: 
evidence: Code-derived from the RN 0.86.3 sources (accessibilityLiveRegion is Android-only) and the camera call sites. Not run with VoiceOver.
refs: 
locations: mobile/src/features/collect/PlaceStep.tsx:124-136 placement readout (live region only); mobile/src/features/collect/CollectMap.tsx:878 selected-record callout; mobile/src/ui/OnlineIndicator.tsx:63-70; mobile/src/features/collect/CollectMap.tsx:378, :408, :417, :769, :778 (camera duration: motion.camera); mobile/src/features/collect/CollectMap.tsx:295-303, :671-691 (cluster Pressable 36 pt, no hitSlop)
trigger: A VoiceOver user nudges the cross; a user with Reduce Motion on zooms or frames; a gloved user taps a cluster.
behavior: The zone readout changes silently on iOS, and save confirmations are queued twice. The camera eases instead of jumping. The cluster target is 36 pt.
consequence: Promised accessibility behaviour is missing for a few users. Pilot observers are unlikely to rely on VoiceOver.
fix: Reuse StatusLine's iOS announce() effect for the readout and the callout. Drop the duplicate save announce in CollectScreen and guard Field's announce to iOS. Call useReducedMotion() once and set duration 0 at the six call sites. Make the cluster Pressable at least 44 pt, with the 36 pt pill drawn inside it.
deletable: 
keep: The iOS-only announce effects beside accessibilityLiveRegion (Note, StatusLine) stay.
verify: VoiceOver on the pilot iPad: moving out of the zone is spoken once. With Reduce Motion on, zoom jumps. Accessibility Inspector shows a target of at least 44 pt on clusters.
effort: 2-3 h
rank: The Mac pass rated A11Y-03 medium; I lower it to low because pilot observers are unlikely VoiceOver users and the save itself is announced. A11Y-04 and A11Y-07 were low in both passes.
skeptic_focus: 

## C23 low/high CONFIRMED DEFECT — Shared primitive defects: 13 of 22 dialogs never return focus to what opened them, and password Show/Hide fails label-in-name on web and native
members: J-4, A11Y-06 | platform: web + mobile | journeys: 
evidence: J-4 was runtime-reproduced in the browser (Invite lost focus in 6 of 6 trials) and derived from the Radix 1.1.23 source. A11Y-06 is code-derived.
refs: 
locations: web/src/components/contour/Dialog.tsx:19-21, :64-67 (Trigger rendered only when the trigger prop is given); web/node_modules/.pnpm/@radix-ui+react-dialog@1.1.23_*/node_modules/@radix-ui/react-dialog/dist/index.mjs:154-157 (onCloseAutoFocus focuses triggerRef); web/src/features/team/TeamScreen.tsx:80-88; web/src/features/org/members/MembersScreen.tsx:97-105; web/src/components/contour/PasswordInput.tsx:57-72 (constant aria-label 'Show password' while the visible text flips); mobile/src/ui/PasswordInput.tsx:28-41 (role switch with a constant label)
trigger: A keyboard or screen-reader user closes Invite or another programmatically opened dialog; a voice-control user says 'click Hide'.
behavior: Focus lands on <body>. The voice command does not match the label.
consequence: Keyboard users lose their place; voice control fails on a sign-in control.
fix: In Dialog, remember document.activeElement on open. In onCloseAutoFocus, call preventDefault and refocus that element if it is still connected (about 8 lines, fixing all 13 dialogs). Make the label track the visible Show or Hide text.
deletable: 
keep: The Radix focus trap and Escape handling, and ShellProvider's onCloseAutoFocus overrides for menus.
verify: Playwright: open Invite from the keyboard, press Esc, and focus is on the Invite button. Check the accessible name equals the visible text after toggling.
effort: 1-2 h
rank: The runtime called J-4 'Medium'; the verifier made it low (no data loss, and failing WCAG 2.4.3 is arguable), and I agree. A11Y-06 is low.
skeptic_focus: 

## C24 low/high CONFIRMED DEFECT — Collector preferences promised in PRODUCT and DESIGN (Dusk, larger question text, preferred hand, haptics, map palette) can only be set in dev builds
members: A11Y-02, UXC-10 | platform: mobile (release builds) | journeys: 
evidence: Code-derived: a grep finds the only preferences.set callers in the (dev) routes.
refs: 
locations: mobile/src/ui/preferences.tsx:26-34, :73-98; mobile/app/(dev)/gallery.tsx:257, :855, :861, :881; mobile/app/(dev)/states.tsx:232 (the only setters); mobile/app/(app)/(tabs)/account/index.tsx:140-160 (only orientation is settable); PRODUCT.md:166; DESIGN.md:232; mobile/PLAN.md:535 (MOB-27 item 4)
trigger: A left-handed, low-vision or glare-affected observer on a release build.
behavior: No release screen can change these preferences. OS Dynamic Type still works up to 2x.
consequence: Promised accessibility settings are unavailable in the field.
fix: The owner picks one. Either add a 40-line Account island using the existing Segmented and Switch primitives, each calling usePreferences().set, or delete hand, largerText, haptics, dusk and mapPalette, their dev setters, and the promises in the docs.
deletable: 
keep: OS text scaling caps (maxFontSizeMultiplier) and minHeight-based controls stay.
verify: In a release build, each kept preference changes from Account and persists across a restart; or a grep finds no remaining promise in PRODUCT.md and DESIGN.md.
effort: 2-4 h either way
rank: The verdicts conflict: the Mac pass made A11Y-02 a medium CONFIRMED DEFECT, while the cloud made UXC-10 a low DESIGN PREFERENCE. I keep it a CONFIRMED DEFECT (a documented accessibility promise is unmet in release builds) but rate it low, because it is planned work the owner may simply drop.
skeptic_focus: Is this a defect, or unfinished planned work (MOB-27, status 'doing') that should be classed as a product decision? Does any pilot observer need these settings?

## C25 low/high CONFIRMED DEFECT — A site download that fails after the archive arrives (for example getFormVersion 500) says 'Map vN did not finish downloading' with no cause; only package and verify errors are classified
members: N-3 | platform: mobile | journeys: 
evidence: An iOS simulator screenshot (10-site-after-download.png, taken in the stale-schema environment where the archive returned 200 and getFormVersion 500), plus code.
refs: 
locations: mobile/src/packages/hosted/download-failure.ts:6-24 (only BoundPackageError, InstallationError and PrepareError are classified); mobile/src/features/projects/versions.ts:100-107, :142-148; mobile/src/packages/hosted/prepare.ts:36-59 (archive first, form version afterwards); mobile/app/(app)/(tabs)/(projects)/[project]/[site].tsx:332-336
trigger: A server or network error after the map archive has downloaded.
behavior: The site shows the generic 'did not finish downloading. Nothing was kept; you can try again.'
consequence: The observer keeps retrying a server-side failure and cannot tell 'no connection' from 'the server could not send the form'.
fix: Add a short cause line driven by the error class ('No connection.' or 'The server could not send the form. Tell your coordinator.'). Keep the 'Map package vN' wording, because the unit is correct.
deletable: 
keep: Installs stay atomic ('Nothing was kept' remains true).
verify: Stub getFormVersion with a 500: the site shows the server cause. Go offline: the site shows 'No connection'.
effort: 1 h
rank: The cloud rated it low and partially confirmed it, and corrected the wording: the copy is accurate and only the cause is missing.
skeptic_focus: 

## C26 low/high CONFIRMED DEFECT — The zone editor shows 'Checking whether your last change was saved…' indefinitely during an outage, and a fast-failing PUT is resent without backoff
members: J-6 | platform: web | journeys: 
evidence: Script-reproduced at reducer level with the real save-queue.ts, plus runtime: 'Checking…' persisted 40 s with the PUT aborted and 6 s in a real outage.
refs: 
locations: web/src/features/zones/editor/save-queue.ts:236-262, :296-306 (get-failed leaves pause 'unconfirmed' and returns no command), :386-387 status text; web/src/features/zones/editor/useDraftSaving.ts:134-141, :208-240 (the only re-flush triggers); web/src/lib/api/browser.ts:23 (15 s timeout)
trigger: The API is unreachable, or a PUT fails quickly while GET works, after a zone edit.
behavior: Nothing checks or retries until the next edit, blur, visibility change or online event, yet the status says the app is checking.
consequence: A manager is told a check is under way when none is. Edits stay in the tab behind the leave guard, so nothing is lost unless the manager reloads.
fix: When pause is 'unconfirmed' and reading is null, show 'Not saved yet · DECA Mark could not be reached. Your changes are kept in this tab.' Add one backoff timer (5, 10, 20, 30 s) in useDraftSaving that re-flushes while the pause still needs a read.
deletable: 
keep: If-Match, one PUT in flight, the account fence, and the verify-before-resend rule.
verify: Reducer test: get-failed produces the new text and schedules a command. Playwright: block the API for 40 s; the status is honest and a save follows recovery without any user action.
effort: 2-3 h
rank: Low in both passes; the real hazard is honesty of the status line, not loss.
skeptic_focus: 

## C27 low/high CONFIRMED DEFECT — A new invitation's one-time code and link are discarded by Esc or a tap outside the dialog, and the email delivery outcome is never shown
members: UXW-5 | platform: web | journeys: 
evidence: Code-derived from the Radix dialog behaviour and the reset on close.
refs: 
locations: web/src/features/people/InviteDialog.tsx:74-78 changeOpen(false) -> reset() clears created; web/src/components/contour/Dialog.tsx:34-35 (Esc and scrim close); web/src/features/people/InvitationCreated.tsx:60-90; web/src/features/people/InvitationsTable.tsx:54
trigger: A manager presses Esc or taps outside the dialog before copying the code.
behavior: The code can no longer be shown, and the outbox status (sent or failed) is not exposed.
consequence: The manager has to revoke and recreate the invitation, and may not know the email failed.
fix: Once an invitation is created, block Esc and outside taps (preventDefault in onEscapeKeyDown and onInteractOutside), or ask 'Close without copying?'. Show sent or failed outbox status on the listing.
deletable: 
keep: Secrets are shown once and never listed.
verify: Create an invitation and press Esc: the dialog stays open. A failed email shows 'Not delivered' on the listing.
effort: 1-3 h (plus API work for the outbox status)
rank: The Mac pass cut it from medium to low, because the UI already says the code is shown only once.
skeptic_focus: 

## C28 low/high CONFIRMED DEFECT — The observer filter is exact and case-sensitive, so lowercase initials show 'No observations match this view'
members: UXW-6 | platform: web + API | journeys: 
evidence: Code-derived from the SQL predicate and the trim-only client.
refs: 
locations: backend/src/fieldmaps_api/queries/observation_analysis.py:13 o.observer_code = :observer; web/src/features/data/FilterBar.tsx:50-61 commitObserver trims only
trigger: A manager types 'ab' for observer AB.
behavior: Zero matches.
consequence: A false empty result, and the export follows the same filter.
fix: Compare upper(o.observer_code) = upper(:observer) on the server; optionally also uppercase the typed text.
deletable: 
keep: The list, summary and export share one filter mapping.
verify: Filter 'ab' returns AB's records in the list, the counts and the export.
effort: 30 min
rank: Low in both passes.
skeptic_focus: 

## C29 low/high CONFIRMED DEFECT — Data -> observation -> 'Data' breadcrumb returns to an unfiltered page
members: UXW-7 | platform: web | journeys: 
evidence: Code-derived.
refs: 
locations: web/src/features/data/DataScreen.tsx:124-125 hrefOf = `${base}/${record.id}` (no query); web/src/features/observation/ObservationDetail.tsx:82, :99 breadcrumb href without filters; web/src/app/(app)/o/[org]/p/[project]/data/[observation]/page.tsx
trigger: A manager reviews a filtered set one record at a time and uses the breadcrumb rather than Back.
behavior: The filters are lost (Back keeps them).
consequence: The manager has to re-filter.
fix: Append viewQuery(current) to hrefOf. In the detail page, run parseView then viewQuery on searchParams and use the result in the breadcrumb href. Loaded-more pages are not recovered.
deletable: 
keep: The URL view codec.
verify: Filter, open a record, click the breadcrumb: the same filters are shown.
effort: 1 h
rank: Low; the cloud confirmed it and noted that the fix does not restore loaded-more pages.
skeptic_focus: 

## C30 low/high CONFIRMED DEFECT — Account binding exists only in the zone editor: browser-direct package uploads and QGIS import use whoever is signed in now, and palette recents keep another account's labels
members: WDI-5 | platform: web | journeys: 
evidence: Code-derived.
refs: 
locations: web/src/lib/api/browser.ts:105-119 preparePackage, :121-136 importQgisProject (no expectUser); :149-214 downloads; web/src/lib/api/zones-browser.ts (expectUser fence, the pattern to copy); palette recents localStorage key (not user-scoped)
trigger: On a shared lab laptop, a tab sits on Upload for account A while account B signs in elsewhere in the same browser.
behavior: The upload is attributed to B.
consequence: Wrong attribution of a map version. The downloads read data B may read anyway.
fix: Pass { timeoutMs, expectUser: useWorkspace().account.userId } for preparePackage and importQgisProject, and map AccountChangedError to 'You are signed in as someone else. Nothing was sent.' Key the palette recents by userId.
deletable: 
keep: The zone editor's account fence.
verify: Two contexts sharing cookies: switch the account in one, then upload in the other; it is refused with nothing sent.
effort: 1-2 h
rank: Low, as the cloud confirmed. Most manager writes are Server Actions, which have the same exposure by design.
skeptic_focus: 

## C31 low/high CONFIRMED DEFECT — The installed web app opened offline shows the public landing page ('Sign in') instead of saying it needs a connection
members: WDI-4 | platform: web (installed PWA, https only) | journeys: 
evidence: Code-derived. The behaviour is pinned by tests in web/tests/auth.test.mjs.
refs: 
locations: web/src/lib/pwa/service-worker.js:20-24 installStartUrl, :84-85, :96-99 (an offline /o navigation falls back to cache.match('/')); web/src/app/manifest.ts:9 start_url '/o'; web/src/app/(marketing)/page.tsx:33-57
trigger: A manager opens the installed app without a connection.
behavior: The marketing page appears with 'Sign in' and 'Create account'.
consequence: Suggests the manager was signed out, when they are only offline.
fix: Delete installStartUrl, LANDING_URL and the start-URL branch, so an offline navigation gets the browser's own offline error. Delete the two start-URL tests. The legacy cache names go with C19.
deletable: 
keep: The service worker caches only public assets: safeResponse and the RSC/Authorization bypass stay.
verify: The auth.test.mjs vm harness: an offline /o navigation is not answered with '/'.
effort: 30-60 min
rank: Low in the cloud verdict, and I agree.
skeptic_focus: 

## C32 low/high CONFIRMED DEFECT — The web shortcut layer fails WCAG 2.1.4 (single-key g chords, '?' and '/'), and the shortcut dialog documents Approve, Exclude and Esc keys that do nothing
members: A11Y-05 | platform: web | journeys: 
evidence: Code-derived.
refs: 
locations: web/src/features/shell/useShortcuts.ts:53-84 (window keydown: g chord, ?, /); web/src/lib/shortcuts.ts:56-70 chord state, :90-102 DATA_SHORTCUTS a and x; web/src/components/shell/ShortcutsDialog.tsx:41
trigger: A speech-input user or a stray keystroke outside a field.
behavior: Navigation fires on single keys, and the dialog lists keys with no handler.
consequence: Unintended navigation for speech users, and a dialog that misleads.
fix: Delete the g, ? and / branches, the chord machinery, the PROJECT/ORG groups, the dead a, x and Esc rows and the palette hint chips, then update the unit test, the e2e step and the ZoneEditor chordPending guard. Keep Ctrl/Cmd+K and the roving table keys.
deletable: 
keep: The command palette and the keyboard-complete zone editor.
verify: Pressing 'g' then 's' outside a field does nothing, and the dialog lists only working keys.
effort: 1-2 h
rank: Low; the cloud confirmed three dead rows, not two.
skeptic_focus: 

## C33 low/high DEMONSTRATED COMPLEXITY — Web client bundle: zod (89 KB gzip) ships on every /o route only because LoadFailure imports a helper, and supabase-js is bundled three times
members: WEB-R7, PERF-3, PERF-2 | platform: web (client bundle) | journeys: 
evidence: Measured from the build output and two scratch rebuilds. The zod-free fix was build-verified.
refs: 
locations: web/src/components/shell/LoadFailure.tsx:9 -> web/src/lib/workspace/result.ts:1 -> web/src/lib/api/errors.ts:1 (zod); web/.next/static/chunks/0wstr41mffx5k.js (382 KB raw / 89 KB gzip, zod only); web/src/lib/api/browser.ts:3, :7; chunks 159n5qswl4qfq, 2d013804da0kj and 3-dr7pv7v6of6 (265 KB raw / about 70 KB gzip each)
trigger: A first load of any project or org page, or of each of the three page families.
behavior: zod is loaded everywhere except sign-in and /account, and one supabase-js copy is downloaded per page family.
consequence: About 211 KB gzip of duplicate supabase code per session, plus zod on every page. Milliseconds on loopback; noticeable on a slow link.
fix: Move isNoAccess and isNotFound into a zod-free module that LoadFailure imports (about 10 lines). Optionally, move AccountChangedError into its own module and reach browser.ts through dynamic import() in the five handlers, zones-browser and useDraftSaving.
deletable: 
keep: The browser-direct upload, export and download paths and their account fence.
verify: next build: no /o route loads chunk 0wstr41mffx5k, and the three supabase chunks become one shared chunk.
effort: 1 h for zod; 2-3 h for supabase
rank: Low DEMONSTRATED COMPLEXITY in both cloud verdicts.
skeptic_focus: 

## C34 low/medium MEASUREMENT NEEDED — Server render cost: serial awaits on several pages, Overview's per-site listPackages N+1, a full archive download, unzip and projection on every map render, and double renders after some mutations
members: WEB-R3, MFD-8, WEB-R5, WEB-R6, PERF-1 | platform: web (server) | journeys: 
evidence: Measured on loopback (api-fanout.json: on 10 sites the N+1 stage is 216-253 ms; on 28 sites it sums to 4.2-4.5 s of API time inside a 478-507 ms document). The archive reproducer on the real functions shows a linear cost (14 MiB zip in about 1.9 s), negligible at pilot size (61 KB). Hosted timing is unmeasured.
refs: 
locations: web/src/lib/api/workspace.ts:204-211 listProjectPackages (await listSites, then listPackages per site); web/src/app/(app)/o/[org]/p/[project]/page.tsx:64, :77-85, :97-103; web/src/lib/api/workspace.ts:227-255 getPackageArchive, getSitePlan, getEditorBase (per-request cache only); web/src/lib/sites/archive.ts:91-111 readPackageArchive; web/src/features/forms/actions.ts:27-44 revalidatePath(..., 'layout'); RetireDialog.tsx:42, DiscardDialog.tsx:47, UploadStep.tsx:456 router.refresh(); web/src/app/(app)/o/[org]/p/[project]/forms/versions/[version]/page.tsx:43, :95, :104, :121; .../publish/page.tsx:63, :143, :146
trigger: Overview on projects with many sites, map pages with real package sizes, and Forms mutations.
behavior: Summaries wait for N listPackages calls. The form editor reads version, forms and sites one after another. Every plan view refetches and unzips the archive. Retire, Discard and upload success render twice.
consequence: Hundreds of ms per page at 30-50 sites. Nothing user-visible at pilot data sizes.
fix: No API change needed: start the two summaries right after getProject and start the coverage reads in the page, which removes the 216-253 ms stage. Use Promise.all for the independent editor and publish reads. Delete router.refresh() where the action already revalidated, but keep it after an uncertain upload. Leave the archive cache, and leave saveDraftAction's revalidate, which also evicts the bfcache for the versions list, until hosted p95 shows a need.
deletable: 
keep: Authorized reads on every request (no cross-request cache before the request's own access check), and revalidation after mutations.
verify: Hosted p95 document time for Overview and Data before and after. On loopback, Overview at 10 sites drops by about 200 ms.
effort: Hoists 1-2 h; anything more only after measurement
rank: WEB-R3 was cut to low MEASUREMENT NEEDED; MFD-8 low MEASUREMENT NEEDED; WEB-R5 low MEASUREMENT NEEDED (with its fix corrected); WEB-R6 and PERF-1 low. I merged them because the decision is the same: measure on hosted, then hoist.
skeptic_focus: 

## C35 low/medium MEASUREMENT NEEDED — Mobile cost grows with data and is unmeasured: the Observations list and collect map load every record ever kept, the map re-stringifies its style on every render, and installs keep several whole-package copies and re-verify every version
members: MFD-4, MFD-6, MFD-7 | platform: mobile | journeys: 
evidence: Code-derived. The 'about six copies' figure is an estimate, and nothing was timed on Hermes.
refs: 
locations: mobile/app/records.tsx:83-131 (records.map inside a ScrollView); mobile/src/storage/observation-store.ts:79-101 (no LIMIT); mobile/src/features/collect/records.ts:20-37; mobile/src/features/collect/CollectMap.tsx:324-341 (style stringified without memoization); mobile/src/packages/hosted/device.ts:112-127; mobile/src/packages/hosted/archive.ts:24-47; mobile/src/packages/hosted/installation.ts:71-104, :116-158
trigger: Hundreds of records on one device, or a package near the 16 MiB cap.
behavior: Full reads and parses, every row mounted, and repeated whole-package work.
consequence: Possible jank and battery use later. Not shown at pilot sizes.
fix: First time it on the pilot device with about 500 records and the largest real package. Only then: query just what each screen shows (FlatList for history), memoize the style string per package, and compare the written file's sha instead of reading it back.
deletable: 
keep: Verified install, records frozen with their binding, and the C10 fix so verification does not repeat on every refresh.
verify: A Hermes profile of the Observations tab and of Collect with 500 records; install time for the largest package.
effort: 0.5 day to measure
rank: MEASUREMENT NEEDED and low in every pass.
skeptic_focus: 

## C36 low/high DEMONSTRATED COMPLEXITY — Duplicated rules that can drift: the Data filter schema is not typed against ObservationFilters, Reports carries a second date parser, and map layer names are declared five times
members: S7, S8 | platform: web + mobile + shared | journeys: 
evidence: Code-derived, plus a tsc check (the Record<keyof ObservationFilters, ZodType> guard reports TS1360 when a field is missing).
refs: 
locations: web/src/features/data/actions.ts:26-36 filtersSchema z.object(...).strict(); web/src/lib/api/observations.ts:82-101 ObservationFilters and filterQuery; Reports page parseDayKey and dayRangeIsBackwards; web/src/lib/packages.ts:14-47 LAYER_NAMES; web/src/lib/sites/archive.ts:69-78 private LAYER_NAMES; web/src/features/packages/upload-preview.ts:14 inline list
trigger: Adding a Data filter or a package layer.
behavior: Adding a filter fails only at runtime, and a new layer name must be edited in five places.
consequence: Drift and runtime-only failures.
fix: Declare the filter shape 'satisfies Record<keyof ObservationFilters, z.ZodType>' and build z.object(shape).strict(). Export LAYER_NAMES once in web, and add one unit test per app that compares it with contracts/openapi.json. Have Reports reuse parseView.
deletable: 
keep: Server Actions keep re-validating their filters.
verify: Adding a field to ObservationFilters without the schema fails tsc. Changing the OpenAPI layer enum fails both apps' tests.
effort: 2-3 h
rank: Low DEMONSTRATED COMPLEXITY in the cloud verdicts, with both proposed fixes corrected.
skeptic_focus: 

## C37 low/high DEMONSTRATED COMPLEXITY — The collector's icon barrel is a quarter of the iOS JS bundle, and expo-font is used but not declared
members: S9 | platform: mobile | journeys: 
evidence: Measured bundle attribution: lucide-react-native is 1,543.9 KB, 25.2% of 6.26 MB of iOS JS.
refs: 
locations: mobile/src/ui/Icon.tsx:1-86 (barrel import of 83 icons); mobile/package.json (expo-font undeclared; expo-updates pending the OTA decision)
trigger: Every app start parses the bundle.
behavior: About 1.5 MB of icon modules for 83 icons.
consequence: Larger bundle and slower startup (unmeasured on device).
fix: Import each icon from lucide-react-native/icons/<file> and pin the exact version. Add expo-font with expo install. Leave expo-updates until the OTA decision.
deletable: 
keep: The same 83 icons and names.
verify: Bundle attribution after the change shows lucide well below 100 KB.
effort: 1-2 h
rank: Low; the lucide part is the only one with a demonstrated cost.
skeptic_focus: 

## C38 low/high DESIGN PREFERENCE — Test suite cost and naming: the 'honesty' scan is a copy and layout lint on seeded states, screenshots run in five projects by default, and some tests mirror other tests
members: TEST-06, TEST-08 | platform: web + mobile tests | journeys: 
evidence: Code-derived. Timings come from the earlier run's artifacts.
refs: 
locations: web/e2e/support/scan.ts:19-66, :171-196, :204-205, :248-302; web/e2e/honesty.spec.ts:21-33; web/e2e/screenshots.spec.ts; web/playwright.config.ts projects; mobile/src/ui/brand-artwork.test.ts:1-153; web/tests/unit/labels.test.mjs:9-19; web/e2e/overview.spec.ts
trigger: Every e2e run and every maintenance pass.
behavior: The scan does not detect failed, stale, offline or no-access states. Screenshot generation runs by default. brand-artwork compares numbers parsed out of SVGs.
consequence: Extra run time and a misleading test name.
fix: Rename the scan to 'copy and layout scan'. Add --grep-invert @screenshots to the default test:e2e, and have screenshots-web.sh pass --grep @screenshots. Delete brand-artwork.test.ts or keep its 2 colour tests. Fold overview.spec's coverage test into overview-sql. Keep the conflict steps.
deletable: 
keep: axe in Day and Dusk, and the designed 404 and empty-state checks.
verify: The default e2e run lists no screenshot tests, and the suite time drops.
effort: 1-2 h
rank: The cloud rated both low DESIGN PREFERENCE and refuted parts of TEST-08 (the conflict steps cover distinct branches).
skeptic_focus: 

## C39 low/high DESIGN PREFERENCE — Security hardening with no reachable defect: safeNext is not idempotent on its own, no CSP or frame-ancestors header is set, and fm-place survives sign-out
members: WDI-3, NEW-headers, J-7 | platform: web | journeys: 
evidence: Code-derived. The stated open-redirect exploit was refuted, because every server redirect sink re-applies safeNext. I re-checked lib/auth/actions.ts:41 before the redirects at :93 and :133, and features/auth/actions.ts:125.
refs: 
locations: web/src/lib/auth/navigation.ts:4-17 safeNext (checks '//' before normalising; returns url.pathname + url.search); web/src/lib/auth/actions.ts:41, :93, :133; web/src/features/auth/actions.ts:125; web/next.config.ts:43-53 headers() only for /sw.js; web/src/proxy.ts:47-48; web/src/features/shell/RememberPlace.tsx:26-33 fm-place (1 year); web/src/lib/workspace/home.ts:19-45 (re-validated against the next account)
trigger: A crafted ?next= with dot segments; an XSS bug, if one ever appears; a shared browser.
behavior: A single safeNext pass can yield '//evil.com', but the action's second pass returns '/o'. No security headers are set. fm-place stays after sign-out but is ignored for an account without access.
consequence: No reachable harm today. These are layers of defence missing.
fix: In safeNext, return HOME unless url.origin equals the base origin and the path does not start with '//', and add four test cases. Add headers() for /:path* with nosniff and frame-ancestors 'none', with a nonce or hash CSP later (the theme script needs one). Optionally delete fm-place in signOut.
deletable: 
keep: safeNext stays applied on both the page and the action.
verify: The auth.test.mjs cases: safeNext(safeNext(x)) === safeNext(x) for the dot-segment inputs. Response headers are present on /o.
effort: 1-2 h (a CSP nonce takes longer)
rank: WDI-3 came in as a high CONFIRMED DEFECT and was refuted as an exploit by the Mac pass; I verified the sinks. NEW-headers and J-7 were rated low DESIGN PREFERENCE by the cloud.
skeptic_focus: Look for any redirect sink that applies safeNext only once: client router.push or href uses of the 'next' prop in the verify, reset-password or sign-up forms, or a Location header built elsewhere.

## C40 low/low MEASUREMENT NEEDED — Upload success confirmation may render off-screen at 1280 px and above while the visible form resets to empty
members: UXW-9 | platform: web desktop | journeys: 
evidence: Code-derived; the actual scroll position was never rendered.
refs: 
locations: web/src/features/packages/UploadStep.tsx:450 setSlots(EMPTY_SLOTS); :473 xl grid; :759 ServerResult in the right column; :822 'Uploaded to DECA Mark'
trigger: A successful upload on a wide screen.
behavior: The slots clear while the result island may be below the fold (it is also aria-live).
consequence: The manager may wonder whether the upload happened. Files must be chosen again, which limits duplicate uploads.
fix: Only if a 1440x900 run confirms it: render ServerResult under the Upload button, or focus and scroll to it after success.
deletable: 
keep: The idempotent resend after an uncertain outcome.
verify: A Playwright run at 1440x900 confirms the result is in the viewport after upload.
effort: 30 min to measure; 1 h to fix
rank: Low MEASUREMENT NEEDED in the cloud verdict.
skeptic_focus: 

## C41 low/high DESIGN PREFERENCE — The empty-project Overview points its primary action at an empty Data page, and orders 'upload a map' before 'publish a form'
members: UXW-8 | platform: web | journeys: 
evidence: Code-derived.
refs: 
locations: web/src/app/(app)/o/[org]/p/[project]/page.tsx:139-146 (the primary is always 'Open observations'); web/src/features/overview/model.ts:86-136 (attention order: no site, no package, no form); web/src/app/(app)/o/[org]/p/[project]/sites/[site]/packages/page.tsx:248-265
trigger: First-run setup.
behavior: The upload is suggested before a form exists, and the upload step then says to publish a form first.
consequence: One detour for a novice manager.
fix: Emit 'no-form' before the per-site loop and update its two tests. Render 'Open observations' as an outline button when there are 0 observations.
deletable: 
keep: AttentionIsland never claims 'nothing needs attention' when a check failed.
verify: An empty project lists 'Publish a form' first.
effort: 1 h
rank: Low DESIGN PREFERENCE, per the cloud.
skeptic_focus: 

## C42 low/high DESIGN PREFERENCE — Role and org are not visible in the header below 1024 and 768 px, and an observer's header says 'MEMBER'
members: J-8 | platform: web | journeys: 
evidence: Runtime-observed in the browser (header text at 1440, 1024 and 390), plus code.
refs: 
locations: web/src/components/shell/AppHeader.tsx:58-96 (RoleLabel 'hidden lg:inline'); web/src/components/shell/Switchers.tsx:228-253
trigger: Narrow windows; an observer on /o/[org]/collect.
behavior: The role sits one tap away in the account menu. The observer header shows the org role.
consequence: Minor orientation cost.
fix: Optional: show the role only when a project is on screen, and label the collect page 'Observer'.
deletable: 
keep: The merged switcher at phone width.
verify: An observer on the collect page sees 'Observer'.
effort: 30 min
rank: The cloud corrected the cut-off to 768 px for the org and made it a design preference.
skeptic_focus: 

## C43 low/high DESIGN PREFERENCE — Web type tokens are px, so a larger browser default font size does not grow text, and 320 px at 200% root overflows
members: J-3 | platform: web | journeys: 
evidence: Runtime-emulated in the browser (html font-size 200% at 320 px: overview 352 px wide, site detail 356 px).
refs: 
locations: web/src/styles/contour.css:157-280 (px type tokens generated by scripts/contour-tokens.mjs from contracts/contour.json); web/src/app/globals.css:95 body 16px/24px
trigger: A user raises the browser's default font size.
behavior: Text stays the same size while rem-based boxes grow.
consequence: No WCAG 1.4.4 or 1.4.10 failure, because page zoom works; a font-size preference is ignored.
fix: If wanted, have the generator emit rem for web type and line-height, then re-measure 320 px at 200%.
deletable: 
keep: One token contract for web and mobile.
verify: The 320 px at 200% root measurement shows no document overflow.
effort: 2-4 h
rank: The runtime said 'Medium'; the verifier made it a design preference against WCAG, and I agree.
skeptic_focus: 