# Device and manual checks, October 2026

Every check here is **pending (user)**: it needs a simulator, a real phone or iPad, Safari, or a person's eyes, and no agent has run it. Do them in order within a section. For each one, record what you ran, the device or simulator model and OS version, the build or commit, and the result (with screenshots where asked), on the task's line in its owning `PLAN.md`. A check that fails stays failed: write what happened and open a task; never mark it passed.

Written 2026-10-15 from branch `claude/frontend-pending`. Section numbers are referred to from the plan.

## 0. Before you start

### 0.1 The local stack, for the iOS simulator

The simulator reaches this computer's `127.0.0.1`. A physical phone cannot use the local stack: the app allows plain HTTP only for localhost, so phones and tablets use a staging build (0.3).

1. Start Docker Desktop, then from the repository root run `pnpm db:start`. It ends with "Local Supabase ready".
2. Seed the web workspace and start the web app on the local stack: `sh scripts/e2e-local.sh --prod --project=desktop-1440 e2e/sign-in.spec.ts`. It leaves the web app on `http://127.0.0.1:3000` and an API on `:8001`, with email delivery off.
3. Start an API for the app on port 8000 (the development build's `apiUrl`), accepting local sign-ins: from `backend/`, run `env -u BREVO_API_KEY -u BREVO_SENDER_EMAIL EMAIL_ENABLED=false DECAMARK_CONFIG=config.auth-local.json uv run --frozen uvicorn fieldmaps_api.main:create_app_from_config --factory --app-dir src --host 127.0.0.1 --port 8000`.
4. **Blocker until fixed:** `mobile/config/development.json` points `supabaseUrl` at `http://127.0.0.1:54323`, which is Supabase Studio; local Auth is `http://127.0.0.1:54321` (`/auth/v1/health` answers 404 on 54323, 200 on 54321). Until the data agent changes it (requested in [the 2026-10-15 requests](../handoff/frontend-requests-2026-10-15.md)), sign-in, sign-up and recovery cannot work in the development build. Note the date you found it fixed.
5. Open the simulator's development build (`com.fieldmaps.collector.local`), then from the repository root run `pnpm mobile:simulator` and let the app connect to Metro.
6. Codes from emails are in Mailpit, `http://127.0.0.1:54324`.
7. Accounts made by the seed: `{owner,admin,manager,observer,viewer,outsider,joiner,other-owner}@fieldmaps.test`, password `FieldMaps-local-only-42!` (local only).

### 0.2 iPad Safari against the local web app

1. On a computer on the same Wi-Fi as the iPad, from the repository root: `pnpm --dir web install`, then `NEXT_PUBLIC_PREVIEW_TOOLS=1 pnpm --dir web build`, then `NEXT_PUBLIC_PREVIEW_TOOLS=1 pnpm --dir web start --hostname 0.0.0.0`. (`next dev` on a network address never becomes interactive in Next.js 16.)
2. Find the computer's address (macOS: `ipconfig getifaddr en0`) and open `http://<address>:3000` on the iPad.
3. Only the local stack; never hosted data.

### 0.3 A phone and a tablet with a staging build

1. Install the `preview` build (staging) on an iPhone and an iPad, and on an Android phone or tablet if you have one.
2. Sign in with a test account on staging, not a personal one.

## 1. Mobile identity: gates, sign-up, codes, recovery (MOB-03, MOB-05)

On an iPhone simulator (0.1).

1. Delete the app from the simulator, install the development build again and open it. **Expect** the welcome screen ("Fieldwork starts here."). [MOB-03]
2. Choose Create account. Enter a new address (for example `you+mob05@fieldmaps.test`), a password of 8 or more characters twice, tick the privacy box, and choose Send verification code. **Expect** "Check your email" with your address, and "Resend in 1:00" counting down.
3. In Mailpit, open "Your DECA Mark verification code". Type `000000` first. **Expect** "That code did not match or has expired. Check the latest email." and the field selected again.
4. Paste the real code. **Expect** it checks itself at the sixth digit, then onboarding opens ("Your observer identity").
5. Close the app before finishing onboarding and open it again. **Expect** onboarding again, not the app.
6. Finish onboarding (section 2), then sign out with nothing waiting (section 3, step 6). **Expect** welcome.
7. Choose Sign in. Enter the address with a wrong password. **Expect** "That email and password do not match."
8. Choose Forgot password?, then Send recovery code. In Mailpit, open "Your DECA Mark password reset code". On "Choose a new password", type `000000`, then a new password twice, then Save new password. **Expect** "That code did not match…" on the code field.
9. Enter the real code and your current password as the new one. **Expect** "Choose a password different from your current one." Then enter a new password twice and save without a new code. **Expect** "Password changed", "You are signed in as …"; choose Continue. **Expect** Projects. [MOB-05]
10. Create a second account but do not verify it. On sign-in, enter it. **Expect** "This email address is not verified yet." with Send a new code; press it. **Expect** the code screen, counting down from 1:00.
11. With VoiceOver on, repeat steps 7 and 9: each screen's title is read as a heading and each error is announced. Every button is easy to hit with a thumb.
12. Turn on airplane mode and try to sign in. **Expect** "We could not reach the server." and "Your records are safe on this device."
13. Do steps 1–4 again in Dusk (the Day / Dusk switch at the top of the gallery, `(dev)/gallery`, sets the screen preference) and with the largest text size: nothing is cut off.

## 2. Mobile onboarding and joining (MOB-06, WEB-07)

On the simulator (0.1), with an account from section 1 still in onboarding, and the web app from 0.1.

1. On "Your observer identity", type a full name; the initials fill in. Change them to two letters. **Expect** "Recorded as" to read them. Continue.
2. On the web (`http://127.0.0.1:3000`), sign in as `manager@fieldmaps.test`, open Team and create an invitation for an observer without an email. Note the eight-character code.
3. In the app, on "Join a project", type the code in lower case with a dash. **Expect** it uppercases and Preview project turns on. Preview it. **Expect** "Join Play study acceptance…?" with the organization and the role Observer, and nothing joined yet.
4. Join. **Expect** Projects lists the project beside Training. [MOB-06, WEB-07]
5. Repeat with an expired or revoked code (revoke it on the web first). **Expect** the code's own message under the field, nothing joined.
6. From Projects, choose Join, and open `decamark://join?code=<a valid code>` from Safari in the simulator. **Expect** the join screen filled in; nothing joins until you confirm.
7. With a new account, choose "Skip for now" on the join step. **Expect** Projects with Training only.
8. VoiceOver from sign-in to a joined project (MOB-24): every step is reachable and read in order.

## 3. Mobile Account: profile, sign-out, deletion (MOB-07)

On the simulator (0.1), signed in with a joined account.

1. Open Account. **Expect** your name, observer code and email, the counts on this device (with "Practice records" when there are any), Screen orientation, Field guide, Sign out and Review account deletion. No "Upload now".
2. Edit profile: change the initials and save. **Expect** Account shows the new code. Turn on airplane mode, change them again and save. **Expect** "Profile saved on this device…", and the change reaches the web's Team page after you reconnect and reopen the app.
3. With airplane mode on, collect one observation on a downloaded hosted site so a record waits, and one practice observation (Training) beside it. Choose Sign out. **Expect** "Your unsent work needs a clear owner.", "1 observation has not been uploaded.", "1 practice record stays on this device and is never uploaded.", "They remain on this device for <your email>…" and "Signing out pauses their upload until <your email> signs in again on this device." Nothing says uploading is missing.
4. Choose Stay signed in. **Expect** Account again, nothing changed.
5. Sign out with airplane mode on (Sign out and keep local records). **Expect** welcome with "1 record waiting on this device for <your email>".
6. Sign in again. **Expect** the welcome note gone and the record back in Observations. Then sign out with nothing waiting: **Expect** "Nothing is waiting on this device for …" and welcome.
7. Review account deletion. **Expect** the list of consequences, and Delete account off until DELETE is typed. With a record waiting, **expect** an "Upload 1 first" button (with the signal back, the record uploads at once and the count drops to none, and you stay on the screen), and "Delete with 1 record not uploaded?" with "Delete anyway" when you delete without it.
8. On the local stack the API has no Auth Admin key. Delete. **Expect** "Deleting accounts is not available yet. Nothing was deleted." and the account still signed in.
9. On staging, only once the user has set BE-08's key (see the PR's production steps), delete a throwaway account. **Expect** welcome with "This account was deleted." and its records said to stay and not upload; the web then refuses that account's sign-in.
10. Lose the session: sign in, note the account's user id (Supabase Studio, `http://127.0.0.1:54323`, Authentication), run `delete from auth.sessions where user_id = '<id>';` in Studio's SQL editor, then close the app and reopen it once the access token has expired (one hour on the local stack). **Expect** "Sign in to resume uploads" on Projects and Account; its Sign in opens with the email filled in; after signing in the note is gone. [MOB-03, MOB-08]

## 4. Contour foundation and shell (MOB-23, MOB-24, MOB-25)

On the simulator.

1. Open the gallery (`(dev)/gallery`, development builds only) in Day and in Dusk. **Expect** every primitive, the fonts Geologica and Spline Sans Mono, and the Reanimated example moving. Screenshot both themes. [MOB-23]
2. Set the largest text size: labels wrap, nothing is cut off.
3. Walk Projects → a project → a site → Before you begin in Day and Dusk, on an iPhone and an iPad simulator. **Expect** the dock on every tab screen, hidden only in collect, centred and at most 420 wide on the iPad. [MOB-25]

## 5. Map palettes on a device (MOB-22)

On a real phone or tablet (0.3).

1. Open a site's map. **Expect** Day by default; the QGIS layers read clearly in daylight.
2. Switch to Night and to Aerial. **Expect** each to look as it did before Day existed. Screenshot each.

## 6. Collect on phone and tablet (MOB-26)

On a real iPhone and a real iPad (0.3), then on the simulator if no device is at hand (say which).

1. Before you begin, then Start collection. Arm placement. **Expect** the map stops panning while armed, "Tap where the play happened".
2. Place at map centre. **Expect** the point at the centre, a light haptic if haptics are on.
3. Answer every question, review, save. **Expect** "Saved on this device", and "Place the next observation" returns with no transition.
4. Turn the iPad to landscape with the preferred hand set to left, then right. **Expect** the panel on that side.
5. With VoiceOver: place, answer, review and save are all reachable and announced.

## 7. Map versions and updates (MOB-30)

On the simulator, with a site whose map v1 is downloaded and map v2 published (upload v2 on the web's Map packages).

1. Screenshot Projects ("1 site ready offline · map update for 1 site"), the Project row ("map v1 · v2 available"), the Site island (the v2 Note, "Download v2 · …", Set up this session opening v1), a download in progress ("Downloading · part 2 of 4"), older maps with "Used by …" and Remove off, and the Brief's version note.

## 8. Placement against zone boundaries (MOB-31)

On an iPhone and an iPad simulator, with VoiceOver on, on a bound map with at least two zones sharing an edge.

1. Place inside one zone, on the shared edge (choose either zone), inside another zone ("Switch to …"), between zones (choose one), and outside every zone. **Expect** each readout, and Place point here off with its reason outside every zone.
2. Review a point moved outside before saving. **Expect** "Not saved yet." with Adjust point.
3. Record what VoiceOver reads in each of the five states, on both devices.

## 9. Resume after a force quit and a missing map (MOB-32)

On the simulator.

1. Start an observation, answer two questions, force-quit the app (swipe it away). Reopen. **Expect** "Unfinished observation" with Resume; Resume opens the same point and answers.
2. With an unfinished observation on map v1, make map v1 missing (on the simulator, delete its folder under the app's `Documents/hosted`; `xcrun simctl get_app_container booted com.fieldmaps.collector.local data` prints where) and reopen. **Expect** "Download map v1 again" and "Keep for later"; nothing offers another zone or a newer map.

## 10. Zone editor manual matrix and iPad Safari (WEB-28, WEB-30 gates 4 and 8)

On the web app (0.2), signed in as `manager@fieldmaps.test`.

1. Keyboard only: open a site's Zones, start a draft, move a point, draw a shape at the cross, review and publish, with no mouse. **Expect** every step reachable and focus visible.
2. VoiceOver with Safari, and NVDA with Firefox or Chrome: handle names, announcements and dialogs are read.
3. iPad Safari: open `http://<address>:3000/dev/zone-editor?shapes=fall-creek` in portrait and landscape. Gate 4: select Zone A, Fit zone, drag a point with a finger (no page scroll or zoom, no long-press callout), pinch, and check 44 px targets; start a point drag and add a second finger (the plan pinches, the point goes back); repeat on "Holed square"; Draw rectangle with a second finger (pinch, nothing drawn); tap out a shape with Draw shape.
4. Gate 8: choose "250 zones · 20,000 points" and read "Drawn in … ms" (under 200 passes); choose "2,000 points", drag point 1 for a few seconds and read "Last drag: … frames a second" (50 or more passes).
5. On the iPad, edit a real draft (not the specimen) and try to leave with an unsaved change. **Expect** "Save your changes first?".
6. Browser matrix: Chrome and Firefox at 1440 and 1024, Safari on macOS at 1440, iPad Safari at 1024×768 portrait and landscape: the editor works and nothing scrolls sideways. With reduced motion on, camera moves jump.
7. Record the iPad model, iPadOS and Safari versions, the numbers and screenshots in the WEB-30 table of `web/ZONE-BOUNDARIES-UI.md` and on WEB-28.

## 11. The Contour gallery against the design pages (WEB-20)

1. Run `pnpm --dir web test:specimen`; it writes `web/e2e/screenshots/gallery-<width>/<theme>/dev-contour.png`.
2. Compare each screenshot with the Contour system pages (pp. 1–12; the design sets are not committed, see `docs/ux/README.md`). Note every difference on WEB-20.

## 12. The complete zone feature (QA-07)

QA-07 also needs MOB-29 (the uploader) and GIS-09; run it only when both are done. Follow `docs/plan/zone-boundaries/verification.md`: two managers, an old queue, a physical device, and more than 500 rows, read back on the web and in QGIS.

## 13. Web identity on a phone (WEB-04, WEB-06)

1. In Safari on an iPhone (0.2 address), sign up, verify with the Mailpit code, and sign out from the account menu. **Expect** the same screens as on the desktop, nothing cut off at phone width.
2. Open `/privacy` and `/privacy/delete-data`. **Expect** the app's account deletion and offline sign-out described.
