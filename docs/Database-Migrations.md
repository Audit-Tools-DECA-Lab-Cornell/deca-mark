# Database migrations

From the repository root, run `pnpm db:migrate:guide` for the command reminder.
Database migrations are a separate release step: deploying web/API code does not
apply them to hosted Supabase. Canonical SQL lives in `supabase/migrations/`.

## Your current next step

**Hosted schema2 was applied and verified on October 26, 2026**, after explicit
user approval, through the connected Supabase SQL tool. All eight forms are at
schema 2; the default is 2; the immutability trigger is enabled; migration
20261024090000 is recorded with the actual preservation source. Hashes confirm
unchanged definitions/metadata, 72 observations, three packages and seven zone
snapshots. The hosted API reports ready.

Refresh Forms in the web application. Do not rerun the schema1 preflight or
apply schema2 again. Signed-in browser acceptance remains unverified because
browser host access was restricted. See [hosted evidence](reviews/schema2-hosted-application-2026-10-26/README.md).

The PostgreSQL service used in the manual procedure is optional operator
configuration, not something this repository creates. The connected Supabase
plugin can execute the reviewed transaction without that service or pasted
database credentials. Do not copy the manual procedure unless its service is
already provisioned.

## Diagnosis and preparation before application

The October 25 hosted check confirmed schema2 was pending. Its original preflight
accepted seven forms and rejected legacy `shell-v1`. The local compatibility
repair now validates that format with the retained historical reader and selects
a preservation transaction. It changes only schema-version metadata/defaults;
published definitions and historical answers remain unchanged.

Use the [production procedure](../database/hosted/form-schema2-rollout.md) to capture
a fresh authorized snapshot and prepare the transaction for review. Local
migration commands do not update hosted Supabase. No hosted application is
authorized by preparing SQL. See the [compatibility decision](decisions/0002-schema2-legacy-preservation.md).

The local database was separately checked read-only on October 25, 2026: all 14
forms are at schema 2 and migration `20261024090000` is recorded. No local schema
change is needed. The schema1 preflight deliberately refuses already-upgraded
rows; its failure is not evidence that the local migration is missing.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm db:migrate:guide` | Print commands and runbook locations; no connection |
| `pnpm db:migrations:hosted` | Compare repository files with the linked hosted history; read-only |
| `pnpm db:forms:prepare --help` | Explain offline schema2 SQL preparation; no connection |

Use Node 24, pnpm 10.17.1 and the repository's pinned Supabase CLI 2.118.0.
Preparation also requires `pnpm backend:setup` once for the locked Python runtime.
`--silent` keeps pnpm's command banner out of redirected SQL. Keep snapshots and
SQL private, outside Git; use `umask 077` before redirecting them. Failed
preparation exits nonzero and emits no SQL. Never apply output from a failed command.
SQL preparation accepts an explicit existing snapshot filename, or JSON on stdin.
It does not download forms or create an input snapshot. Obtain that snapshot only
through the authorized operator procedure.

The history command needs an existing CLI login and project link. If missing,
configure them yourself with `pnpm dlx supabase@2.118.0 login`, followed by
`pnpm dlx supabase@2.118.0 link --project-ref lezmqhuucfwqknspgcdy`. Confirm
**DECA Mark GIS** is the intended target. Keep passwords out of command arguments,
documentation and Git.

## Current Forms failure: schema2 is a special migration

Read-only metadata checked on October 25, 2026 for `lezmqhuucfwqknspgcdy` showed
the five preceding migrations applied, with `20261024090000_form_schema2.sql`
absent. All eight stored forms were at schema 1; the current web parser requires
schema 2. This explains the version mismatch behind “Update DECA Mark to use this
form.” No migration or deployment was performed.

Seven forms have a `questions` array. One published form, `shell-v1`
(`10000000-0000-4000-8000-000000000004`), still has the historical `fields` format.
The original all-row parser preflight confirmed that this was the sole failing
form; the other seven passed. A subsequent read-only reference check found no
observations, packages, or zone-draft inventory bindings pointing to `shell-v1`.
That does not establish the absence of device caches, drafts or queued uploads,
and does not authorize deleting or rewriting the published form. No migration
was applied.

**Do not run a bare `supabase db push` to repair this failure.** This migration
needs a production-parser report bound to every stored definition inside the
same transaction. A pending file is not proof it is ready to apply. The repaired
preflight selects the preservation source for a valid legacy population.
Do not delete the form, rewrite frozen
definitions, relabel versions, or stamp history to bypass the gate. Retiring it
alone does not help: preflight includes retired and platform forms too.

The [schema2 production procedure](../database/hosted/form-schema2-rollout.md)
owns release gates, the privileged read-only snapshot, application and verification.
Use its numbered procedure in order with the repaired release.
The operator creates a private directory and an authorized snapshot before
preparing SQL. Apply only after preparation succeeds, SQL is reviewed, and the
production target/release is approved. The PostgreSQL service must already be
securely provisioned for the confirmed target with verified TLS and owner
visibility. These commands do not create it or inspect credential files.
Generation alone does not check live history, prove snapshot completeness,
establish backup readiness or approve a release. The transaction locks the form
table and refuses stale/incomplete reports, unexpected schema state or an existing
migration-history entry. Matching API/web/mobile release and acceptance remain necessary.

For future ordinary migrations, after schema2 is complete and target/history/release
checks pass, use `pnpm dlx supabase@2.118.0 db push --linked`. Preview with the same
command plus `--dry-run`. Never reset or repair history as a routine update.
See the official [CLI reference](https://supabase.com/docs/reference/cli/supabase-db-push)
and [migration workflow](https://supabase.com/docs/guides/deployment/database-migrations).

## What the terminal errors mean

| Error | Cause and action |
| --- | --- |
| Preflight requires schema 1 but finds schema 2 | The local upgrade is already recorded and all local rows are schema 2; stop local migration commands |
| `forms-before.json` does not exist | No authorized hosted snapshot was captured; preparation cannot run yet |
| `/forms-before.json` does not exist | `DECAMARK_SCHEMA2_DIR` was unset; it is created in the operator procedure before use |
| `zsh: parse error near '|'` | A Markdown table row was pasted into the shell; copy only a command from a code block |

## Local development

For ordinary pending migrations, with local Supabase running:

```sh
pnpm dlx supabase@2.118.0 migration up --local
```

An existing schema1 database with forms needs the special helper for schema2:

```sh
sh database/form-schema2.sh preflight
sh database/form-schema2.sh apply-local
```

Run `apply-local` only after successful preflight and explicit local migration
approval. The helper accepts only the known local Docker stack or named disposable
rehearsal containers. `pnpm db:start` does not upgrade hosted Supabase.
See [database operations](../database/README.md).

## Automation and release reminder

Preparation automates parser validation, snapshot fingerprints, transaction
assembly, timeouts, source SHA256 and the atomic Supabase history entry. It validates
canonical definitions with the schema2 authoring parser and fields-only definitions
with the retained historical parser. It refuses invalid definitions, already-upgraded
rows and formerly ignored schema2 properties. Legacy input selects
supabase/repairs/20261024090000_form_schema2_preserve_legacy.sql; canonical-only
input still selects the unchanged original migration.
It never connects or applies SQL.

CI already rehearses migrations against isolated local databases. Hosted
application is not currently automated. A future workflow can use an approved
target, a protected deployment environment/manual release gate, serialized
migration execution and post-apply checks. Provision credentials through the
hosting platform's secure process. For schema2, retain parser preflight and the
same-session transaction. No recurring reminder or hosted job is created here.

Before each release that changes `supabase/migrations/`:

1. Run `pnpm db:migrations:hosted` and confirm project and history.
2. Read the pending migration's guide and rehearse the approved release.
3. Apply reviewed SQL during its maintenance window before matching runtimes resume writes.
4. Verify history, API readiness and the affected flow; record hosted and device evidence separately.
