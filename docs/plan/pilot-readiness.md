# Pilot readiness: execution guide (2026-10-22)

This guide orders the work that the [October 2026 frontend audit](../reviews/frontend-audit-2026-10-17/README.md) found between today and the pilot launch. The launch has no fixed date: it happens when the launch gate QA-08 passes (D31). It owns no task: every task is defined once in its component plan, and status lives only there. This file says **in which order, in which lane and under which rules** the tasks run, so that several agents can work at once without editing the same files.

Read first: [the plan index](README.md) (conventions), decisions D31–D36 in [decisions.md](decisions.md), and the [audit report](../reviews/frontend-audit-2026-10-17/REPORT.md) §1–§2.

## What the owner decided (2026-10-22)

| Decision | In one line | Consequence for this work |
|---|---|---|
| D31 | The pre-launch reset policy ends when the pilot launches. | One last sanctioned reset (OPS-19 hosted, MOB-44 collector). After it, collector schema changes are forward migrations and never drop unsent work; hosted migrations preserve data. Everything that deletes compatibility code or changes the collector's tables must land **before** MOB-44. |
| D32 | Forms live only in the database, in one canonical format. | Fields-only forms are reset; no app compiles a form in; Training comes from the server and its practice records upload to the Training project (D4). |
| D33 | The pilot uses iPhones, Android phones, Samsung Galaxy tablets and iPads. | Every collector layout, keyboard, rotation or touch change is checked on all four families, portrait and landscape. |
| D34 | The web stays on Vercel's free plan, without Skew Protection. | The page handles an unrecognised Server Action (WEB-44); a fixed `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` keeps action ids stable (OPS-20). |
| D35 (2026-10-23) | An online background map in a QGIS project asks the manager before uploading. | Confirming uploads the vector layers with a warning; cancelling uploads nothing (BE-23 in the API, WEB-60 on the web). |
| D36 (2026-10-24) | Until OPS-19 the hosted API stays on the code from before BE-24; the web keeps following master. | From BE-24's own commit until OPS-19, every commit to master carries `[skip render]` and nobody deploys the API by hand ("Deploys before OPS-19" below). |

## The launch gate

The pilot launches when **QA-08** passes on the four device families with the build the pilot ships. QA-08 depends on the correctness tasks below; it does not wait for PowerSync, store listings or the polish waves. QA-05 remains the full pilot walkthrough for later.

Launch also needs work this guide does not own. Check it before the launch day: installable builds for the four device families (MOB-20, or an internal-distribution build), the hosted API and web deployed from the same commit as the pilot build (OPS-04, OPS-05), Janet's published forms and first maps on the hosted target (OPS-19), and MOB-29's physical-device acceptance.

## Waves and lanes

A **lane** is one agent working through its tasks in order on its own branch (or worktree). Lanes in the same wave run in parallel because they own disjoint files. A task whose file belongs to another lane waits until that lane's change has merged, then rebases.

### Wave 0: guards first (day 1, morning)

| Lane | Tasks | Owns |
|---|---|---|
| G (CI) | OPS-18 | `.github/workflows/ci.yml`, `docs/Workspace.md`, the moved Python acceptance files |
| D (contracts) | CON-07 | `contracts/README.md`, `contracts/forms/cases`, `contracts/forms/definition.cases.json`, `docs/plan/contracts.md` |

OPS-18 goes first so every later PR runs the 393 web unit tests, `forms:parity` and the token check.

### Wave 1: launch-gate fixes (days 1–3)

| Lane | Tasks, in order | Owns (exclusive while the lane runs) |
|---|---|---|
| A (collect screen) | MOB-34 → MOB-35 → MOB-36 → MOB-41 | `mobile/src/features/collect/**`, `mobile/src/layout/**`, `mobile/src/ui/use-keyboard-visible*` (new), the two hooks it replaces (`mobile/src/features/auth/use-keyboard.ts`, `mobile/src/features/onboarding/use-keyboard-visible.ts`) and their import lines in `features/auth/parts.tsx` and `app/(onboarding)/join/index.tsx`, `mobile/src/session/draft-persistence.ts`, `observation-actions.ts`, `recovered-drafts.ts`, `mobile/src/features/projects/UnfinishedCard.tsx` |
| B (collector sync and account) | MOB-40 → MOB-39 → MOB-37 → MOB-38 | `mobile/src/sync/**` (except `wire-body.ts`), `mobile/src/storage/use-observations.ts`, `mobile/src/storage/sync-store.ts`, `mobile/src/components/screen.tsx`, the `records` route lines in `mobile/app/_layout.tsx`, `mobile/src/data/api/me-provider.tsx`, `mobile/src/packages/hosted/provider.tsx`, `mobile/app/(app)/(tabs)/account/**`, `mobile/src/features/account/**`, `mobile/src/features/preview/queue.ts`, `mobile/app/(app)/(tabs)/observations/**`, `mobile/app/records.tsx`, `mobile/src/features/guide/**` |
| C (collector storage and forms) | MOB-42 → MOB-43 (after DB-20 and BE-24) → MOB-44 | `mobile/src/storage/**` (except `use-observations.ts` and `sync-store.ts`), `mobile/src/data/legacy/**`, `mobile/src/platform/auth-storage.ts`, `mobile/src/auth/client.ts`, `mobile/src/auth/session-retention.ts`, `mobile/src/packages/package-references.ts`, `mobile/src/packages/hosted/operations.ts`, `mobile/src/features/preview/device-projects.ts`, `mobile/src/features/preview/data-source.tsx`, `mobile/src/sync/wire-body.ts`, `mobile/app.config.ts`, `mobile/src/forms/registry.ts`, `mobile/src/forms/fixtures/**`, `mobile/src/packages/bundled.ts`, `mobile/src/domain/**`, `mobile/src/session/round-forms.ts` |
| D (server) | DB-20 → BE-24 → BE-25, then BE-23 | `supabase/**`, `database/**`, `backend/**`, `contracts/openapi.json` and both generated API type files |
| E (web actions, auth, inputs) | WEB-45 → WEB-46 → WEB-44 | `web/src/lib/auth/**`, `web/src/features/auth/**`, `web/src/features/account/**`, `web/src/proxy.ts`, `web/src/components/contour/{TextInput,Textarea,PasswordInput,CodeInput}.tsx`, `web/src/features/forms/DraftEditorScreen.tsx` and the five Forms dialogs, `web/src/features/project-settings/**`, `web/src/features/sites/*Dialog.tsx`, `web/e2e/settings.spec.ts` |
| F (web review surfaces) | WEB-47 → WEB-50 → WEB-51 → WEB-60 (after BE-23 merges) | `web/src/features/packages/{UploadStep,ProjectImport,VersionHistory}.tsx`, `project-import.ts`, `checks.ts`, `web/e2e/packages.spec.ts`, `web/src/features/forms/model.ts`, `ProjectFormsScreen.tsx`, `web/src/features/overview/**`, `web/src/features/packages/forms.ts`, `web/src/app/(app)/o/[org]/**/loading.tsx`, `web/src/features/data/**` (WEB-44's `loadMore` catch is lane E's; coordinate on `DataScreen.tsx`) |

Cross-lane edits that are known in advance (each is allowed only after the tasks it names have merged, and the PR lists it):
- MOB-37 changes the practice copy in `SavedStep.tsx:115-120`, which lane A owns: do that one edit after MOB-34 has merged.
- MOB-42 removes the `activateHeldObservations` call in `mobile/src/sync/provider.tsx` (lane B) after MOB-39 has merged.
- MOB-43 (lane C) changes the observation domain that lanes A and B read: start it after MOB-34, MOB-37 and MOB-41 have merged, and rebase the others on it. Once those and MOB-39 have merged, MOB-43 may also edit the practice wording and the `local-only` paths in files lanes A and B own: `mobile/src/features/collect/SavedStep.tsx`, `features/collect/records.ts`, `features/collect/CollectScreen.tsx`, `mobile/src/features/guide/**`, `mobile/src/features/account/leaving.ts`, `mobile/src/features/preview/queue.ts`, `mobile/src/storage/sync-store.ts`, `mobile/src/sync/provider.tsx` and `coordinator.ts`. Its PR lists those edits, and the owning lanes rebase on it.
- A file that no lane lists belongs to the lane whose task first needs it; a later task in another lane waits for that change to merge, rebases, and lists its own edit in its PR.
- WEB-44 (lane E) adds the `loadMore` catch in `DataScreen.tsx`, which lane F owns: lane E makes that one-line change first; lane F rebases.

**Deploys before OPS-19.** Render builds the API from master's head on every commit that reaches master without `[skip render]` in its message, and on every manual deploy. Vercel deploys the web on every master commit. From BE-24's own squash commit until OPS-19 deploys, two rules hold. (1) Every commit that reaches master carries `[skip render]` in its first line: a squash merge (the only merge style allowed in that window) or a direct push, the owner's included. (2) Nobody deploys the API by hand: no "Deploy latest commit", and an environment-variable or Secret File change is saved without deploying. Any of these would build master's head, which includes BE-24. A config change that needs a redeploy waits for OPS-19. That way the hosted API keeps the code from before BE-24, and keeps serving the hosted fields-only forms, until the reset removes them. In that window the hosted web may run ahead of the hosted API (D36). For example, WEB-60's confirmation relies on BE-23, which the hosted API lacks until OPS-19. A commit that reaches master without the tag deploys BE-24 early: tell the owner at once, so they can roll Render back to the previous deploy.

### Wave 2: the gate (days 3–5)

| Who | Tasks |
|---|---|
| Owner | OPS-19 (authorize the final reset and the deploys once everything else in QA-08 is ready); OPS-20's check that two deploys keep the action ids (it needs a browser signed in to Vercel) |
| Lane G | MOB-49 (Maestro flows for the queue era), run on iOS and Android |
| Owner with an agent | QA-08 on the four device families, recorded in its task |

### Wave 3: during the pilot (no destructive schema change after D31)

| Lane | Tasks |
|---|---|
| A | MOB-45 (collect-map accessibility), then MOB-48 (needs a device) |
| B | MOB-46 (preferences), MOB-47 (download errors) |
| D | BE-26 (rebind), then lane F takes WEB-48 |
| E | WEB-52, WEB-53, WEB-54 |
| F | WEB-49, WEB-58, WEB-59 |
| One agent, alone, last | WEB-56 (after BE-24 and BE-25), then WEB-55 (it touches many files), then QA-09 |
| Owner with an agent | WEB-57 (needs the hosted preview) |

After the launch, any collector change that touches SQLite adds a forward migration through MOB-44's mechanism. A schema change with no migration is a bug.

## Protocol for every agent

1. **Read** this guide, the plan index's conventions, the owning task in full (Context, `Read first`, `Do`, `Done when`, `Verify`) and the audit cluster it cites. Check that every `Depends:` task is `done`.
2. **Stay in the lane's files.** The only exceptions are the cross-lane edits listed under wave 1, once the tasks they name have merged. If a task needs any other file another lane owns, stop and say so; do not edit it.
3. **Write the regression test first** where the task names one (the audit reproduced most defects with real modules; the reproducers are under `docs/reviews/frontend-audit-2026-10-17/cloud/`). It must fail before the fix and pass after.
4. **Implement the smallest change that meets `Done when`.** The audit's "keep despite looking complex" list (REPORT §6) is off limits unless the task says otherwise: the single-transaction commit, frozen upload bodies and receipt matching, account fences, verified package installs, the zone save queue, ETag compare-and-set, `settle()`/LoadFailure, role checks before reads.
5. **Run the task's `Verify` commands** and the component checks: `pnpm web:check` and `pnpm --dir web test:unit`; `pnpm mobile:check` and `pnpm mobile:test`; `pnpm backend:check` and `pnpm backend:test`; `pnpm db:test` for database changes; `pnpm forms:parity`; `pnpm tokens:check`; `pnpm plan:check`.
6. **Review adversarially before opening the PR.** A separate reviewer (an Opus agent) tries to refute that the change meets `Done when` and that no guarantee from step 4 is weakened. Fix what it finds.
7. **Report honestly.** Set the task's status in its owning file; add one line saying what now works and how it was verified. Never claim a device, simulator, hosted or production check that was not run. A cloud (Linux) session cannot run the iOS simulator: say "device check pending (owner)" and list the exact steps.
8. **Never** read `.env` or secret files, run a hosted reset or migration, change Vercel or Supabase settings, or deploy. Those are owner steps (`Needs user:`).

## Environment notes for agents

- Node 24 and pnpm 10.17.1 (`corepack enable`), uv with Python 3.13. Each app installs from its own lockfile (`pnpm setup:apps`, `pnpm backend:setup`).
- The local stack: `pnpm db:start`, then `sh scripts/e2e-local.sh --prod --zones` for browser tests. In a cloud container, start `dockerd` first. If Docker Hub or ECR rate-limits image pulls, run `pnpm db:start` with `SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io`: the images are the same, and the audit's cloud run used it.
- Playwright's Chromium is preinstalled in cloud sessions (`/opt/pw-browsers`); do not run `playwright install`.
- Mobile layout, keyboard and screen-reader checks need the iOS simulator and an Android emulator, which means a Mac. Run lanes A and B where those exist, or leave the device step to the owner as in step 7.

## Starting an execution session

Paste this into a new Claude Code session opened on this repository:

```text
You are the lead engineer driving DECA Mark to its pilot launch. The launch happens when QA-08 passes, not on a fixed date, so do the work properly rather than fast. Work in this repository from master.

Read, in order: AGENTS.md, docs/plan/README.md (conventions), docs/plan/pilot-readiness.md (this is your playbook), decisions D31-D35 in docs/plan/decisions.md, and docs/reviews/frontend-audit-2026-10-17/REPORT.md sections 1-2. Each task is defined in its component plan (mobile/PLAN.md, web/PLAN.md, backend/PLAN.md, supabase/PLAN.md, docs/plan/contracts.md, operations.md, verification.md); status lives only there.

Goal: complete waves 0 and 1 of pilot-readiness.md, then prepare wave 2 (MOB-49 and everything the owner needs for OPS-19, OPS-20 and QA-08), then continue into wave 3 if time remains. Use workflows with one agent per lane, each in its own git worktree and branch (pilot/<lane>-<task-id>), lanes in the same wave in parallel, tasks within a lane in order. Use Sonnet agents to implement well-specified tasks, Haiku for read-only reconnaissance, and Opus for orchestration, cross-lane decisions and the adversarial review of every change. Follow the "Protocol for every agent" section exactly: regression test first, the lane's files only, the task's Verify commands, an adversarial review before each PR, honest status lines.

Authorization for this session: you may create branches, commit, push and open pull requests, one PR per task. Merge a PR into master (by squash) only when CI is green on it and its adversarial review passed, then rebase the other lanes. Do not run hosted resets or migrations, change Vercel or Supabase settings, deploy, or read .env or secret files: list those steps for me instead. When a task says "Needs user", ask me, keep going with the other lanes meanwhile.

Report after each wave: tasks done (with the verification each got), PRs, anything blocked and why, and the exact device steps I must run for QA-08.
```

Edit the authorization paragraph before pasting if you want a narrower scope (for example, PRs but no merges).
