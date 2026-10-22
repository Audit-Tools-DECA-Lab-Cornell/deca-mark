

{
 "test_groups": [
  {
   "group": "CI-gated web tests (web/tests/api-errors, auth, profile-answer, data-export; 84 tests)",
   "files": "web/tests/*.test.mjs",
   "verdict": "KEEP",
   "protected_risk": "open-redirect safeNext, identity schema, service-worker private-URL exclusion, API error copy, export columns",
   "justification": "Run today in CI (about 2 s total). Only edit: drop the two 'fieldmaps-' cache names at auth.test.mjs:58,69 with the SW constants (TEST-07)."
  },
  {
   "group": "Web unit suite: zone editor logic (zone-save-queue, zone-drafts, zone-editor-state, zone-drawing, zone-geometry, zone-plan, zone-hints, zone-identity, zone-publish, zones-page, zone-editor-chrome)",
   "files": "web/tests/unit/zone-*.test.mjs, zones-page.test.mjs",
   "verdict": "KEEP",
   "protected_risk": "lost or duplicated zone saves; 401/403/412/409/428/429/offline/echo mismatch; shared geometry cases",
   "justification": "Best state coverage in the repo and 0.2 s per file. Currently NOT in CI: add pnpm --dir web test:unit (TEST-01). zone-editor-chrome gate 5 (no hex literals in editor source) is a source lint in test clothing but cheap; keep, and let its luminance helper stay (a shared helper is optional).",
   "remaining_coverage": "n/a"
  },
  {
   "group": "Web unit suite: manager data truth (data-view, data-map, summary, reports, overview, export-files, api-shapes, answers, time, labels, site-view, site-code)",
   "files": "web/tests/unit/*.test.mjs",
   "verdict": "REWRITE",
   "protected_risk": "counts vs the 500-row cap, project-timezone days across DST, unread sources not reported as fine, answers labelled by form version",
   "justification": "Mostly KEEP and add to CI. Small rewrites only: labels.test.mjs lines 9-19 assert the text of mobile source files (replace with shared cases or delete); remove the three round_type: null cases (summary.test.mjs:74-86, :172; labels.test.mjs:23-26). Fields-only reader fixtures in answers/forms-model stay (owner instruction b93a2b2).",
   "replacement": "Two-line shared cases file or drop the regex; narrow roundOf to RoundType."
  },
  {
   "group": "Web unit suite: access, identity, org, team (access, home, workspace-index, org, team-rules, invitation, invitations, project-settings-rules, account-deletion, ids, errors)",
   "files": "web/tests/unit/*.test.mjs",
   "verdict": "KEEP",
   "protected_risk": "role gating, home routing, invitation links, deletion states, settle() failure shapes",
   "justification": "Real modules, milliseconds each; only the CI wiring is missing (TEST-01)."
  },
  {
   "group": "Web unit suite: forms (forms-model, forms-start, form-definition-cases, forms-concurrency)",
   "files": "web/tests/unit/forms-*.test.mjs, form-definition-cases.test.mjs",
   "verdict": "KEEP",
   "protected_risk": "ETag compare-and-set: no silent overwrite, explicit re-review, stale editor keeps edits; shared definition cases",
   "justification": "Only coverage of form conflicts; the registerHooks harness is also the template for the missing page-failure test. Needs forms:parity in CI because web never runs the answer-behaviour cases on its engine copy."
  },
  {
   "group": "Web unit suite: packages and archives (package-checks, package-history, project-import, qgis, site-archive)",
   "files": "web/tests/unit/*.test.mjs",
   "verdict": "KEEP",
   "protected_risk": "upload preview checks, archive reading against real Fall Creek files",
   "justification": "Real fflate fixtures, no stack, fast."
  },
  {
   "group": "auth-local.test.mjs",
   "files": "web/tests/auth-local.test.mjs; package.json test:auth:local",
   "verdict": "REWRITE",
   "protected_risk": "recovery-cookie mismatch refusals (lib/auth/actions.ts:54-68) and email never in a URL",
   "justification": "Hand-run, skipped by default, needs a :3002 dev server and Next private React Flight internals. Its mismatch assertions are the only ones in the repo, so port before deleting.",
   "replacement": "Three context.addCookies tamper cases in e2e/auth-flows.spec.ts, then delete the file and script."
  },
  {
   "group": "E2E single-actor journeys",
   "files": "web/e2e: sign-in, org, team, settings, sites, packages, packages-identity, qgis-reports, data, data-history, overview-sql, forms, join-observer, invite-viewer, account-deletion, auth-flows",
   "verdict": "KEEP",
   "protected_risk": "manager and observer journeys, zone identity across uploads, stale upload refused, export equals records, overview equals SQL",
   "justification": "Assertions compare against independent sources (SQL, API). Run nightly, not per PR (stack required). The phone-390 project repeats all of them; restricting phone to honesty and zones-editor is optional cost trimming."
  },
  {
   "group": "E2E overview.spec.ts",
   "files": "web/e2e/overview.spec.ts",
   "verdict": "MERGE",
   "protected_risk": "overview counts",
   "justification": "Coverage test duplicates overview-sql.spec.ts:41.",
   "remaining_coverage": "overview-sql.spec.ts (total plus coverage by zone and round against SQL); the first overview.spec test compares the API sum, keep it or move it into overview-sql",
   "replacement": "Move or delete the coverage test; no new code."
  },
  {
   "group": "E2E zone multi-actor and interrupted work",
   "files": "web/e2e: zones-conflict, zones-account, zones-network, zones-publish, zones-draft, zones-access, zones-editor",
   "verdict": "KEEP",
   "protected_risk": "two managers, sign-out in another tab, account swap sends nothing, offline save and leave guard, lost answer replay publishes once, each conflict-dialog choice",
   "justification": "The earlier proposal to merge the conflict steps into zones-conflict is refuted: zones-draft covers Replace and Discard, zones-publish covers note-only difference, save-as-file and published-elsewhere. Nightly, not per PR."
  },
  {
   "group": "Copy and layout scan ('honesty')",
   "files": "web/e2e/honesty.spec.ts, zones-honesty.spec.ts, support/scan.ts, support/routes.ts",
   "verdict": "KEEP",
   "protected_risk": "banned words, sample strings, one primary action, sideways scroll, axe in Day and Dusk, designed 404 and empty states",
   "justification": "Keep as a lint, rename it honestly, add dialogs to axe. It does not detect no-access text, failed, stale or offline states (TEST-06)."
  },
  {
   "group": "screenshots.spec in the default run",
   "files": "web/e2e/screenshots.spec.ts, playwright.config.ts projects",
   "verdict": "REWRITE",
   "protected_risk": "design-review assets only (asserts 200, data-theme, main visible)",
   "justification": "Asset generator that runs in 5 projects on the default run. Keep the file and the screenshots-web.sh path; select by '@screenshots' tag instead of removing tablet projects, which that script still names.",
   "replacement": "--grep-invert @screenshots in the default test:e2e script; screenshots-web.sh adds --grep @screenshots."
  },
  {
   "group": "removed-routes.spec",
   "files": "web/e2e/removed-routes.spec.ts; routes.ts REMOVED_ROUTES; next.config.ts OLD_ROUTES",
   "verdict": "DELETE",
   "protected_risk": "old addresses (Nocturne, sample workspace, set-up flow) redirect or 404",
   "justification": "Policy: compatibility for old addresses.",
   "remaining_coverage": "SCAN_ROUTES sample-workspace-gone (/o/deca expects 404), project-missing-page, org-missing; the unmatched old addresses become the designed 404",
   "replacement": "Delete the spec, REMOVED_ROUTES and the redirects in next.config.ts (NEW-LEGACY-REDIRECTS)."
  },
  {
   "group": "Specimen suite",
   "files": "web/e2e/specimen/zone-editor, zone-drawing, contour-gallery",
   "verdict": "KEEP",
   "protected_risk": "lossless serialise, keyboard/mouse/touch edits, no tile requests, axe while drawing; gallery sections non-empty",
   "justification": "zone-editor and zone-drawing are unique and stack-free (nightly on a build). contour-gallery could become one scan route with axe; optional."
  },
  {
   "group": "Mobile stores and outbox (storage 18 files, sync 6, auth/session retention)",
   "files": "mobile/src/storage, sync, auth",
   "verdict": "KEEP",
   "protected_risk": "exactly-once, restart, account fence, frozen records, atomic reset",
   "justification": "Highest value and real node:sqlite. node:sqlite is not expo-sqlite and 'restart' is reopen, not process kill (device gap, see missing tests). database-migrations.test.ts pins the sanctioned wipe (consistent with TEST-04 policy); shrink its loop to [SCHEMA_VERSION - 1, 99]."
  },
  {
   "group": "Mobile outbox dual-mode tests (fields-only-outbox, published-form-outbox) with backend driver",
   "files": "mobile/src/sync/*-outbox.test.ts; backend/tests/test_fields_only_history.py, test_published_form_compatibility.py",
   "verdict": "KEEP",
   "protected_risk": "production createBoundUpload transport against the real API, replay of a lost response, rejected body retained across restart",
   "justification": "The only CI-run join between the real TS client and the real API (backend job installs mobile deps for it). Weakness: the API half is silently absent in 'pnpm mobile:test' unless the Python driver supplies the fixture."
  },
  {
   "group": "Mobile session provider",
   "files": "mobile/src/session (7 files)",
   "verdict": "KEEP",
   "protected_risk": "A to B to A isolation, stale callbacks ignored, draft persisted before next render, package pinned for a visit",
   "justification": "Strong logic-level account-switch coverage on real SQLite. Rename the 'legacy-shell-map' fixture ids on next touch (naming only)."
  },
  {
   "group": "Mobile packages and hosted",
   "files": "mobile/src/packages (3 + 11 hosted files)",
   "verdict": "KEEP",
   "protected_risk": "verified install, retained versions, missing-map recovery",
   "justification": "Recovery states covered with fs-backed fakes and real SQLite."
  },
  {
   "group": "Mobile forms engine and contracts",
   "files": "mobile/src/forms (5 files)",
   "verdict": "KEEP",
   "protected_risk": "language-neutral answer behaviour shared with backend",
   "justification": "Cheapest cross-language guard; also the only test of the engine that web copies, hence forms:parity in CI."
  },
  {
   "group": "Mobile maps and geometry",
   "files": "mobile/src/maps (6 files)",
   "verdict": "KEEP",
   "protected_risk": "boundaries, coverage, clustering, palette 3:1 and 4.5:1 contrast",
   "justification": "Pure plus shared JSON. The fourth WCAG helper (palette.test.ts:58-70) may stay; sharing across packages is optional."
  },
  {
   "group": "Mobile auth, onboarding, API client, platform",
   "files": "mobile/src/auth, features/auth, features/onboarding, data/api, platform",
   "verdict": "REWRITE",
   "protected_risk": "sign-up and reset, invitations, API errors, encrypted session storage",
   "justification": "Keep, but delete the four migrateLegacySession tests with the function (auth-storage.test.ts:98,108,117,126) and rename legacyStorageKey in the remaining tests.",
   "replacement": "Local test key constant."
  },
  {
   "group": "Mobile screen render tests",
   "files": "9 files via screen.fixture (UnfinishedCard, account-screens, device-screens, auth-screens, ResetPasswordScreen, ResumeUploadsNote, HostedPackageIsland, ReviewStep, PlaceStep)",
   "verdict": "KEEP",
   "protected_risk": "state to controls mapping, disabled states, alerts, navigation",
   "justification": "74 says() assertions and 10-22 vi.mock per file; a hand-written fake react-native computes no layout or keyboard behaviour, so it is no substitute for a device (UXC-01 and MFD-1 are exactly what it cannot see). On the next edit pin states or key phrases, not full sentences."
  },
  {
   "group": "Mobile acceptance files (5 env-gated)",
   "files": "mobile/src/sync/bound-upload-api.acceptance.test.ts, packages/hosted/bound-install-api.acceptance.test.ts, auth-calls, join, deletion",
   "verdict": "REWRITE",
   "protected_risk": "real round trips: install, offline save, restart, v2 publication, drain, observer export 403",
   "justification": "They skip silently (5 skipped in vitest) and bound-upload's driver is referenced by nothing at HEAD; backend CI already proves the pattern with the two outbox tests.",
   "replacement": "Move database/tests/test_mobile_bound_upload_api.py and test_mobile_package_api.py into backend/tests; remaining env-gated files stay manual or are given the same driver."
  },
  {
   "group": "brand-artwork.test.ts",
   "files": "mobile/src/ui/brand-artwork.test.ts (10 tests)",
   "verdict": "DELETE",
   "protected_risk": "cosmetic equality of in-app logo, installed icon and web mark",
   "justification": "Design preference; fails only when someone edits one of three files and protects nothing a researcher does.",
   "remaining_coverage": "none needed; optionally keep the colour-set test and the web-mark colour test (2 tests)",
   "replacement": "Optional 2-test colour equality."
  },
  {
   "group": "Orientation policy and field guide content",
   "files": "mobile/src/layout, features/guide",
   "verdict": "KEEP",
   "protected_risk": "orientation lock mapping, guide structure",
   "justification": "Pure and cheap."
  },
  {
   "group": "Seed guards and tooling",
   "files": "scripts/*.test.mjs, database/*.test.mjs (10 tests)",
   "verdict": "KEEP",
   "protected_risk": "seed refuses hosted or credentialed targets; role-password verifier",
   "justification": "Already in CI (plan job), guards catastrophic misuse."
  },
  {
   "group": "CI workflow",
   "files": ".github/workflows/ci.yml",
   "verdict": "REWRITE",
   "protected_risk": "everything above",
   "justification": "Add test:unit, forms:parity and the contour-tokens check to the web job (about 6 s, TEST-01); move the orphaned acceptance driver under backend/tests. Do not add Playwright to PR CI; a nightly or manual job suffices.",
   "replacement": "Three added run lines; one file move."
  }
 ],
 "commands_run": [
  "git rev-parse HEAD; git status --short (clean before and after)",
  "pnpm --dir web test:unit (393 pass, 4.55s wall); repeated with TZ=UTC (393 pass)",
  "pnpm forms:parity (pass 0.44s)",
  "pnpm tokens:check (pass 1.0s; includes make -C backend email-templates-check)",
  "pnpm mobile:test (836 pass, 5 skipped, 14.6s wall)",
  "pnpm --dir web test:api-errors / test:auth / test:account (38 / 34 / 12 pass)",
  "node --test scripts/*.test.mjs database/*.test.mjs (10 pass)",
  "node w2/tests/ntp.mjs (NOT_THE_PAGE regex against no-access sentences)",
  "grep/sed over ci.yml, playwright.config.ts, scan.ts, routes.ts, screenshots.spec.ts, next.config.ts, auth-storage*, database-migrations*, lib/auth/actions.ts, backend/tests spawning vitest",
  "Playwright, Docker, Supabase and the API were not started"
 ],
 "notes": "TEST-01 re-run (HEAD 0279fd3, Node 24.22.1, pnpm 10.17.1, tree clean before and after): web test:unit 393/393 in 4.55 s wall (TZ=UTC also green); forms:parity pass 0.44 s; tokens:check pass 1.0 s (the email half ran offline against the existing venv, no error); mobile:test 836 pass + 5 skipped (841) in 14.6 s; CI-run web tests 38+34+12=84 in under 2 s; scripts+database node tests 10 pass. ci.yml web/mobile/plan jobs are unchanged from the finding; docs/Workspace.md:67 still claims parity with local checks. Not run (per instructions): Playwright, Docker, Supabase, API; TEST-06 timings are the earlier run's artifact times. TEST-04 is consistent with the owner policy (sanctioned wipe); only its 5-version loop is redundant. TEST-05 re-checked at HEAD: publish/page.tsx:143-155 still collapses failed formList/siteList reads into 'No other version of this form is published.' (confirmed live).\\n\\nMISSING COVERAGE, the 6 tests that protect the most, in priority order:\\n1. Draft survives a real process kill (native runner, Maestro or equivalent, closes MOB-21): bundled Training site, offline, place a point, answer two questions, kill the app, relaunch; Unfinished card shows the progress, Resume restores both answers. Same flow asserts the answer field and Continue stay visible with the software keyboard up on a small iPhone and an Android edge-to-edge emulator (this is exactly UXC-01 and MFD-1, which the fake react-native cannot see; the native run confirmed both defects).\\n2. Collector upload round trip against the real API as one named CI-run test: move database/tests/test_mobile_bound_upload_api.py into backend/tests (install, save offline, reopen SQLite, publish v2, drain, lost-response retry, manager export shows one record, observer export 403), plus one inventory-body upload through createBoundUpload. The point-observation join already runs in CI via the two outbox tests.\\n3. Failed read is not an empty list, per page: tests/unit/page-failures.test.mjs reusing the registerHooks harness of forms-concurrency.test.mjs; render Sites, Data, Team, Forms, Packages, Overview and the form PublishPage with listForms/listSites rejecting (timeout, 503, 401); assert LoadFailure is present and 'No sites yet', 'No observations' and 'No other version of this form is published.' are absent. It fails today on the publish page (TEST-05).\\n4. Session expiry during a Server Action: Playwright, sign in, open the create-site (and invite, and settings save) dialog, expire the session server-side (revoke the refresh token and remove the access cookie) in another context, submit; assert the dialog keeps its input, shows 'Nothing was created. You were signed out. Sign in again.', nothing is created, and signing in again returns to the page. Only the zone editor path is covered today (zones-account.spec.ts:87,142); lib/api/mutations.ts actions are covered only for copy (api-errors.test.mjs).\\n5. Account switch with an unsent record on one phone: account A saves offline and signs out (warning names the count), account B signs in and sees an empty list, a drain sends nothing for B, A signs back in and the record uploads once. Logic is covered on node:sqlite in session/provider.test.tsx and coordinator.test.ts; this adds real SecureStore, auth and expo-sqlite. Second Maestro flow.\\n6. Recovery-cookie tamper plus axe on dialogs in Playwright: three addCookies cases on fm-recovery-user and fm-recovery-email (NEW-AUTH-RECOVERY-UNRUN), and the invite, export, create-site, leave-guard and conflict dialogs run through axeFindings in Day and Dusk with focus returning to the trigger.\\n\\nWhat I reproduced vs code-derived: reproduced = the TEST-01 command results, the NOT_THE_PAGE regex result, unit-suite pass under TZ=UTC; everything else (TEST-06 config analysis, TEST-07 reachability, TEST-08 duplication, NEW items) is code-derived from the files at HEAD. Caveat: the HEAD commit message says the database CI job was broken, so CI status at HEAD is unverified; the corrected TEST-02 relies on ci.yml and the backend tests as written, not on a green run."
}