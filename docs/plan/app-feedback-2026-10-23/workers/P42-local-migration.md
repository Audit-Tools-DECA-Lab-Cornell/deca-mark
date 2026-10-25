# P42: approved persistent local schema-2 application

User approval on October 25, 2026: “apply to local supabase and then tell me how to
perform on production”. Scope: existing local database, plus production procedure;
no hosted mutation or release authorization.

Docker context `desktop-linux` resolved to the local Unix socket. Fresh read-only
`sh database/form-schema2.sh preflight` passed for two canonical rows. Applied via
`form_schema_upgrade.run("apply-local", "supabase_db_field-maps")`, the same path as
`sh database/form-schema2.sh apply-local`. Fresh preflight, exact source and migration
history insertion shared one transaction.

Verified two schema-2 rows; default 2; trigger `immutable_form_version` enabled;
exact migration source in Supabase history. Before/after counts and sorted row
fingerprints for all 18 fieldmaps/fieldmaps_meta/gis application tables matched,
excluding only `schema_version` on form_versions. Local observations/packages were
empty: preservation of populated records is covered by the earlier isolated suite,
not invented as live local evidence. Verification JSON contains only metadata,
counts and fingerprints. No credentials/config/environment file was read.

Prepared `database/hosted/form-schema2-rollout.md`: confirmed target/history gate,
backup/maintenance, full-visibility snapshot, actual offline parser, same-session
reviewed transaction, exact post-check, coordinated release and forward-recovery
rules. Shell blocks passed `bash -n`; embedded Python blocks parsed with `ast.parse`.
No production commands were executed. Reconciled stale handoff status and approval
markers; source tests were not needlessly repeated because no product code changed.

Quota now 19%, below the configured reserve. No new workers or browser acceptance
packet dispatched. Real browser/native/hosted acceptance remains pending. Resume
from CURRENT.md and checkpoint 004007-local-schema2 when quota permits.
