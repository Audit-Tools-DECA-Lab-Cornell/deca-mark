# Frontend audit, October 2026: report and evidence

A skeptical audit of the web (`web/`) and collector (`mobile/`) frontends, run 2026-10-17 to 2026-10-22. It reviewed revision `0279fd3` (it started at `9928f53`; the frontend differs only in `mobile/src/sync/upload-failure.ts`, two mobile tests and `web/vercel.json`). It changed no application code. The work it found is planned as tasks; [docs/plan/pilot-readiness.md](../../plan/pilot-readiness.md) orders them.

**Start with [REPORT.md](REPORT.md).** It holds the verdict, the five top findings with their corrected fixes, 43 finding clusters, route and data-flow tables, journeys, simplifications, the test classification and the coverage limits. Dated evidence: it describes the revision above, not later code.

## Owner answers (2026-10-22)

The report's section 9 asked eight questions. The answers became decisions D31–D34 in [decisions.md](../../plan/decisions.md):

- **Schema reset:** allowed until the pilot launches. The launch has no fixed date: it happens when everything in the launch gate (QA-08) is ready; after one last sanctioned reset, collector and hosted schema changes preserve data (D31).
- **Fields-only forms:** reset them. Forms live only in the database in one canonical format and are fetched from the backend; nothing is hard-coded in the apps (D32).
- **Pilot devices:** iPhones, Android phones, Samsung Galaxy tablets and iPads (D33).
- **Skew protection:** the web is on Vercel's free plan, so Skew Protection is not available. The page handles an unrecognised Server Action, and a fixed `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` keeps action ids stable (D34).

Still open (recorded as `Needs user` on the task): whether an online basemap should block a package or only warn (BE-23). Since then the owner has set `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` in Vercel (OPS-20); the final reset (OPS-19) runs once QA-08 is ready, with the owner's authorization.

## How the audit ran

1. **Mac run (2026-10-17 to 2026-10-19).** Nine dimension reviews, each checked by an independent verifier; browser journeys and lab performance on a production build (M1 Pro, local stack); a partial iOS-simulator run (iPhone 17 Pro, iOS 26.5, dev build). The local database there lacked three migrations, so every Forms endpoint returned 500 and 14 e2e tests per project failed for that reason only.
2. **Cloud run (2026-10-21 to 2026-10-22).** A fresh local stack with every migration applied; verification of the 34 findings the Mac run had not checked; the Forms journeys; a controlled loading-boundary experiment (seven production builds); a hydration investigation; Opus triage into 43 clusters; adversarial skeptics on the top five. Desktop e2e passed 134/134, phone 133/134 (the one failure is the hydration defect C07).

## What is where

| Path | Contents |
|---|---|
| [REPORT.md](REPORT.md) | The final report. Paths in it that begin `/tmp/claude-0/…/scratchpad/` now live under `cloud/` here (for example `…/scratchpad/w3/clusters.md` is `cloud/w3/clusters.md`). |
| (outside git) | All screenshots (292 PNG, 22 JPEG, about 89 MiB) and the raw measurement files: perf, journey, e2e and vitest JSON, the ESLint report, the boundary experiment's raw results, the hydration run's raw output and the Mac workflow journals. Every number in the report comes from them, but nothing in the plan needs them. They are kept outside the repository in `frontend-audit-2026-10-17-assets.tgz`; ask the owner for it. Run `tar xzf frontend-audit-2026-10-17-assets.tgz` at the repository root to put every file back at its original path. |
| `results/` | Mac run: `all-findings.json` (the 76 original findings with their first verification), `all-reviews.json` (per-dimension assessments, including route and data-flow tables), `surviving-compact.json`, per-dimension reviewer and verifier notes, `runtime-journeys.md` (the browser journey report). |
| `runtime/` | Mac run evidence: `checks/` (the lint, type and unit run summary), `mobile-checks/` (vitest summary, bundle attribution, native dependency diff), `perf/` (`SUMMARY.md` and the run log), `journeys/` (the journey log), `e2e/` (Playwright summaries and each failure's error context), `native/` (the simulator `PROGRESS.md`). The raw JSON and the screenshots, including the keyboard covering the answer field, are in the asset bundle. |
| `cloud/w2/` | Cloud verification: `ledger.md` (all 76 findings plus the new items with both verdicts), `results.json`, `verify-tests.md` (CI gap re-run and test classification), `runtime-forms.md` (Forms journeys), `boundary-summary.md` (the loading-boundary experiment), and each verifier's scratch reproducers. |
| `cloud/w3/` | Judgement: `clusters.md` (the 43 clusters with locations, triggers, fixes and verification), `triage-meta.md` (area verdicts, policy notes, keep-despite-complex, simplifications, test groups, first actions, Next.js capabilities), `skeptics.md` and `skeptic-*/` (adversarial checks with their reproducers), `hydration.md` and `runtime-hydration/` (the pre-hydration typing defect). |
| `cloud/run/` | Cloud runtime: `e2e/` (both Playwright runs and the settings-spec repeats), `forms/` (Forms journey scripts and page-text captures), `boundary/` (the experiment's analysis and harness). The screenshots and the boundary experiment's raw results are in the asset bundle. |

Session files, Playwright traces and a duplicated source tree were removed before the evidence was committed; a scan found no tokens, passwords or keys.
