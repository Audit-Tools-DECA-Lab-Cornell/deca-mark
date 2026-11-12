# Backend planning handoff: variable library and form templates

Paste everything below the line into the planning agent. It assumes the agent can read and write files in the repository.

---

Work in `/Users/praty/Desktop/StudentJob.nosync/field-ops` (DECA Mark: a Next.js manager web app, an Expo offline collector, a FastAPI API and Supabase PostgreSQL).

## Your task

Write the database, API and contract plans for a new feature: a variable library and form templates. You are planning only. Write no application code, no migration and no test, and make no Git or hosted change.

The frontend for this feature was designed first, deliberately. You are working backwards from it. You know which screens exist, what each one asks the server for, how often, and at what size. Use that to decide where the design needs care and where the plainest thing is right. The goal is the simplest schema and API that serve these screens well and do not block the stated future directions. A design that is more general than the interface needs is a defect here, not a virtue.

The frontend plan is a direction, not a fence. Where it states an outcome, you choose the mechanism. Where one of its decisions makes the backend much more costly or fragile than a nearby alternative, do not silently comply and do not silently change it: write down the cost, the alternative and what the interface would lose, and leave the decision to the owner.

## Read first, in this order

1. `AGENTS.md`, then `docs/plan/README.md` (conventions, the pre-launch reset policy, how tasks and IDs work).
2. `docs/plan/library/README.md`: the feature brief. It holds the usage profile, what is fixed, what is open for you to decide, what not to build and where the feature may go later. Treat its section 6 ("What not to build") as binding, and note that it separates what is excluded from what is only postponed.
3. `web/LIBRARY-UI.md`: the interface. Section 2 has the decisions (L1 to L17), section 8 has the table of what each screen needs from the server and the rules the server must hold.
4. `web/PLAN.md` tasks WEB-61 to WEB-72: the web work your tasks must unblock.
5. The existing system, as far as you need it: `supabase/PLAN.md` and `supabase/migrations/` (forms, form versions, `form_templates`, roles and row-level security), `backend/PLAN.md` and `backend/src/fieldmaps_api/` (the forms and form-templates routers, `form_preconditions.py`, the error envelope, the role functions), `docs/plan/contracts.md` and `contracts/README.md` (form definition schema, the schema-version rule from CON-07, typed errors from CON-04).
6. `docs/variables/Behavior Mapping Variable Library_ Additional.xlsx` (two sheets: the variables, and the standard forms as lists of variable codes) and the workbook defects listed in `docs/QGIS-Field-Collection-Feasibility.md`.

Section 8 of the brief lists facts about today's system. Verify each one in the source before relying on it, and correct the brief if one is wrong.

## How to reason

Start from the screens, not from an entity model. For each row of the table in `web/LIBRARY-UI.md` section 8, decide the request, the response and the storage that make it simple. Then check the result against the brief's future directions: each should remain possible without a rewrite, and none should be built now.

Things the usage profile should lead you to notice:

- One read carries almost all the traffic: everything a project can see, in one response. Make that read simple, correct under the permission rules and cheap. It needs no paging or search.
- Adding variables to a form involves no new endpoint. The browser inserts questions and the existing draft save stores them.
- Writes are rare, whole-object and low-contention. Do not design for concurrent editing beyond a clear stale-save refusal.
- The data is a few hundred small rows per project. Do not add caches, queues, search indexes or denormalized counters unless you can show a plain query fails at ten times the brief's numbers.
- Correctness matters most in four places: identity (what a source tag and a template reference point at), permissions by level, the rules that keep display rules and templates valid, and refusing deletes and saves that would break them. Put your depth there.

For each significant choice, compare at least two real options and say why you chose one. At minimum: the storage shape for four levels; how templates reference variables in order; how "used in N forms" is answered; where each validation rule is enforced (database constraint, private function or API) and why; how Universal is seeded and later updated by the developer; and what happens to the existing `fieldmaps.form_templates` table and `GET /v1/form-templates`.

Follow the patterns the codebase already has (typed error codes, strong ETags where a precondition is needed, the existing role functions, row-level security written the way current tables write it, generated OpenAPI types) unless you give a reason to differ. Because of the pre-launch policy, you may reshape or reset existing form-template data; add no compatibility path.

## Out of scope

- Reliability forms. Decision L17 keeps today's behaviour: Reliability rounds use the Standard form and the round records `Rel_Round`. Site packages, the collector and observation upload do not change. Leave `RelRound1` and `FirstRound1` out of the Universal seed and out of the seeded templates.
- Anything in the brief's "What not to build".
- Any change to how observations are recorded, uploaded or exported, other than the form definition accepting the new source tag.
- Frontend design. If the web plan needs to change for the backend to be sound, list the change; do not edit `web/LIBRARY-UI.md`.

## What to produce

1. `docs/plan/library/contract.md`: the wire contract. Each endpoint with method, path, who may call it, request and response shapes, error codes and preconditions; the source-tag addition to the form definition and its effect on the schema version; a table mapping every row of the web plan's "what each screen needs" table to the endpoint that serves it.
2. `supabase/LIBRARY.md`: tables, keys, constraints, indexes, row-level security, any private functions, and the seed for Universal variables and templates. Include how the workbook's columns map to stored fields and a list of workbook rows that need a decision from Janet before seeding.
3. `backend/LIBRARY.md`: modules, validation, how each refusal is detected and reported, and the test plan (API tests, SQL tests, shared contract cases).
4. Tasks in the owning plan files, following the conventions in `docs/plan/README.md` exactly: `DB-21` onward in `supabase/PLAN.md`, `BE-27` onward in `backend/PLAN.md`, `CON-08` onward in `docs/plan/contracts.md`, and a `MOB-*` task only if the collector must change. Mark them `Post-pilot` like the web tasks. Each task is at most size L, has `Read first`, `Do`, `Done when` and `Verify` lines, and depends only on real prerequisites. Check the next free ID in each file before using these numbers.
5. Update the `Depends:` line of WEB-61 to WEB-70 and WEB-72 with the tasks each one needs, then run `pnpm plan:check --fix` and `pnpm plan:check` until it passes.
6. Order the tasks so the web can start early: the Universal seed and the one library read come first, then variable writes, then templates.

In `docs/plan/library/contract.md`, end with three short sections:

- **Decisions and alternatives:** each significant choice, the option rejected and the reason.
- **Requests to change the frontend plan:** anything in `web/LIBRARY-UI.md` you recommend changing, with the cost of not changing it. Write "None" if there are none.
- **What to revisit as it grows:** the first things that would need redesign, and at what size or with which future direction.

## When you are unsure

Do not stop to ask. Choose the simplest option consistent with the brief, record it as an assumption in the contract, and continue. Collect questions that only the owner or Janet can answer into one list at the top of `docs/plan/library/contract.md`, at most seven, each with your recommended answer.

## Rules

- Never read, print or edit `.env`, `.env.*` or secret files.
- No commits, pushes, branches, migrations applied, deployments or hosted changes.
- Use Node 24 and pnpm 10.17.1 for the plan check. Do not start servers or databases.
- State only what you verified in the repository. Where you infer, say so.

## Final report

When finished, reply with: the files written, the task IDs added and their order, the three or four decisions that most shaped the design with one sentence each, the questions for the owner, and anything you could not verify.
