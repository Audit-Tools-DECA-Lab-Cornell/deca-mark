# Form schema 2: production rollout

**Recorded application:** October 26, 2026, explicitly approved for DECA Mark GIS.
The connected Supabase SQL tool executed the reviewed preservation transaction;
all eight forms and the default are now at schema2. Definitions and historical
data passed before/after hash comparisons. See [hosted evidence](../../docs/reviews/schema2-hosted-application-2026-10-26/README.md).
Do not reapply this transition to that target. The manual PostgreSQL service
below is an operator alternative; it was not required for the plugin execution.

The migration changes the existing version values/default to 2. It adds no table
or column and preserves definitions, question IDs, revisions, answers and package
bindings. Do not use the local Docker helper against production.

Run `pnpm db:migrate:guide` for command reminders. The
[migration guide](../../docs/Database-Migrations.md) records the current hosted
metadata diagnosis and the local legacy-preservation repair. Its release and
target checks must pass before production application.

## 1. Clear release gates

Use one approved, committed release containing the migration, backend, web, mobile
and generated contracts. Record its Git revision and migration SHA256. Complete
real web/API browser and physical-device acceptance before production application.

Rehearse the procedure below on an authorized staging copy first. Verify the
production project identity and compare `supabase_migrations.schema_migrations`
with every file in `supabase/migrations/`: all preceding migrations must already
match, with only `20261024090000_form_schema2.sql` pending. Stop on divergent or
legacy history; the old launch-runbook baseline/repair recipe is not applicable.
Do not reapply the baseline, reset the database, or stamp this migration manually.
Supabase records applied files in that history table; see its
[migration workflow](https://supabase.com/docs/guides/deployment/database-migrations).

## 2. Pause writes and capture production state

Arrange a maintenance window. Pause all API processes/workers and other database
writers, including form publication and mobile sync, until matching runtimes and
acceptance checks are ready. Preserve device queues and drafts. Confirm a recent,
restorable backup/PITR point and its timestamp before proceeding. Availability
depends on the project plan; follow the [backup guide](https://supabase.com/docs/guides/platform/backups).

Use an already provisioned PostgreSQL service named `decamark-production-admin`,
pointing to the confirmed production database through a direct or **session-mode**
connection, with verified TLS and full table visibility/owner privileges. Do not
use transaction pooling. Do not paste credentials into commands, chat or Git.
The operator configures this service through the normal secure credential process;
these instructions do not authorize an assistant to inspect secret files.

From the release checkout's root, in the same shell:

```sh
umask 077
DECAMARK_SCHEMA2_DIR=$(mktemp -d "${TMPDIR:-/tmp}/deca-schema2.XXXXXX")
psql -X --dbname 'service=decamark-production-admin' -v ON_ERROR_STOP=1 -c 'SELECT current_database(), current_user, inet_server_addr(), version();'
psql -X --dbname 'service=decamark-production-admin' -v ON_ERROR_STOP=1 -c 'SELECT version,name FROM supabase_migrations.schema_migrations ORDER BY version;'
psql -X --dbname 'service=decamark-production-admin' -qAt -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SET LOCAL row_security=off; SELECT coalesce(json_agg(json_build_object('id',id,'schema_version',schema_version,'definition_text',definition::text) ORDER BY id),'[]'::json) FROM fieldmaps.form_versions; COMMIT;" > "$DECAMARK_SCHEMA2_DIR/forms-before.json"
```

Confirm the displayed database/server against the intended project's connection
details; the database name alone does not establish project identity. The JSON
snapshot contains form contents: keep this directory private and outside Git.
Do not proceed if any command fails or table visibility is incomplete.

## 3. Validate and prepare the exact transaction

Use the release's installed, locked Python environment. The actual production
parser must accept **every** stored row, including drafts, retired and platform
forms. Canonical forms use the schema2 authoring parser; fields-only forms use
the existing historical parser without normalization or conversion. Unknown
versions, invalid definitions, or formerly ignored schema2 properties cause
refusal. Do not bypass refusal or rewrite frozen forms
to force it through.

```sh
pnpm --silent db:forms:prepare < "$DECAMARK_SCHEMA2_DIR/forms-before.json" > "$DECAMARK_SCHEMA2_DIR/apply.sql"
```

Stop if preparation fails. It emits no SQL on validation failure; an empty output
file is not a migration bundle. `--silent` keeps pnpm's banner out of the SQL.
The command runs offline and neither connects to production nor applies anything.

Review `apply.sql`, including its execution-source filename, SHA256 and validated-form
count in the header, and record the approved Git revision. This uses the same
parser and transaction builder tested locally. The embedded preflight report, table
lock, migration source and Supabase migration-history insertion share **one
session/transaction**. Changed rows, unexpected defaults/triggers, or a history
conflict cause rollback. The transaction only disables the named published-form
trigger and restores it before commit.

An entirely canonical population selects the original migration unchanged.
A population containing valid fields-only forms selects
supabase/repairs/20261024090000_form_schema2_preserve_legacy.sql and requires a
format2 preflight report binding each row's raw definition bytes and parser
classification. This is an alternate execution source for the same **pending**
schema2 migration version, not an extra migration to apply afterwards. The
wrapper records the exact source actually executed in the history row's
statements array, under version 20261024090000 and name form_schema2. It neither
claims the original source ran nor stamps history without performing the
transition. Preserve that audit evidence. Never apply the alternate source to
an installation where this version is already recorded.

A bare `supabase db push` cannot attach an arbitrary production report to this
session. Use the reviewed bundle for this migration; ordinary CLI history checks
can resume afterwards. The embedded two-row baseline proof is not evidence for
the production population.

## 4. Apply once and verify before reopening

This is the production mutation. Run it only with explicit approval for the
confirmed target and release, after steps 1–3 pass:

```sh
psql -X --dbname 'service=decamark-production-admin' -v ON_ERROR_STOP=1 -f "$DECAMARK_SCHEMA2_DIR/apply.sql"
psql -X --dbname 'service=decamark-production-admin' -v ON_ERROR_STOP=1 -c 'SELECT schema_version,count(*) FROM fieldmaps.form_versions GROUP BY schema_version;'
psql -X --dbname 'service=decamark-production-admin' -v ON_ERROR_STOP=1 -c "SELECT pg_get_expr(d.adbin,d.adrelid) AS schema_default FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum WHERE d.adrelid='fieldmaps.form_versions'::regclass AND a.attname='schema_version'; SELECT tgenabled FROM pg_trigger WHERE tgrelid='fieldmaps.form_versions'::regclass AND tgname='immutable_form_version'; SELECT version,name FROM supabase_migrations.schema_migrations WHERE version='20261024090000';"
psql -X --dbname 'service=decamark-production-admin' -qAt -v ON_ERROR_STOP=1 -c "BEGIN READ ONLY; SET LOCAL row_security=off; SELECT coalesce(json_agg(json_build_object('id',id,'schema_version',schema_version,'definition_text',definition::text) ORDER BY id),'[]'::json) FROM fieldmaps.form_versions; COMMIT;" > "$DECAMARK_SCHEMA2_DIR/forms-after.json"
PYTHONPATH=backend/src backend/.venv/bin/python - "$DECAMARK_SCHEMA2_DIR" <<'PY'
import json
import sys
from pathlib import Path

directory = Path(sys.argv[1])
before = json.loads((directory / 'forms-before.json').read_text())
after = json.loads((directory / 'forms-after.json').read_text())
assert all(row['schema_version'] == 2 for row in after), 'Unexpected stored version'
for row in before + after:
    row.pop('schema_version')
assert before == after, 'Form IDs or definition bytes changed'
print(f'Verified {len(after)} unchanged form definitions and IDs.')
PY
```

Compare the history row's statements[1] with the execution source named in
apply.sql, including its SHA256. For the preservation variant, comparing only
with supabase/migrations/20261024090000_form_schema2.sql would compare the wrong
implementation. The original file and already-applied canonical installations
are unchanged.

Expect the original row count entirely at version 2, default `2`, trigger `O`, and
one history entry. On an empty database expect no grouped rows, with the same
default/trigger/history. Retain production evidence privately, including checks
that revisions, observations and package bindings match the maintenance snapshot.
Do not rerun the version-1 preflight after a successful transition: its refusal of
already upgraded rows is intentional. Never manually insert a history entry after
a failed application.

## 5. Deploy matching runtimes and accept the full flow

Keep maintenance in place while deploying the same approved backend and web
release. Distribute and verify the schema-2 collector before enabling schema-2
collection. Old clients cannot install newly served schema-2 forms. Do not clear
their installed packages, drafts or queues; known supported cached layouts have a
bounded upgrade path, while unknown layouts remain retained with an update message.

Verify `/ready`, authenticated form detail with `schema_version: 2`, manager
save/reload and publication with ETag checks, then a new package download,
offline save/restart/upload and exact receipt retry. Include number bounds/decimal,
conditions, date/time and automatic identity/capture fields. Confirm existing
observations still export correctly and existing bound/retried records retain
their original answers. Open access only after these checks; record hosted and
physical-device evidence separately.

Retained fields-only forms keep the historical upload/export interpretation.
This migration does not make them valid new authoring input or installable by
the canonical-only collector. Existing legacy caches/queues remain retained;
do not rebind their observations or rewrite their immutable bodies.

If SQL fails, the transaction rolls back; diagnose and regenerate a fresh report
before a new approved attempt. If application acceptance fails after commit, keep
writes paused and fix forward. Do not relabel rows as version 1, delete history,
or deploy an old parser over schema-2 definitions. Restoring a backup requires a
separate recovery decision that accounts for writes since the restore point.
