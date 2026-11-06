# Hosted schema2 application — October 26, 2026

Target: DECA Mark GIS, project lezmqhuucfwqknspgcdy. The user explicitly approved
“Apply the hosted migration now” after the earlier preparation/read-only scope.

## Application

The connected Supabase SQL tool executed the freshly prepared, tested
preservation transaction. It performed the schema transition and recorded version
20261024090000, name form_schema2, in one session/transaction. The migration
tool's automatic version assignment was not used; the repository's existing
migration ID and actual execution source were preserved.

Execution source: supabase/repairs/20261024090000_form_schema2_preserve_legacy.sql.
The recorded history statement SHA256 matches that file:

68836df5bc319a45ac2ae1740d39d7f9c0f8d71503e89b09e3a7aa3ddce1c2c1

The first approved write request returned an expired request-state error. A
read-only query confirmed that no transition or history entry had occurred.
The fresh retry succeeded; subsequent verification confirmed exactly one entry
for the expected migration version.

## Verified outcome

| Check | Result |
| --- | --- |
| Stored form schema versions | All eight are 2 |
| schema_version default | 2 |
| immutable_form_version trigger | Enabled, state O |
| Supabase migration history | Expected version/name, exact preservation source SHA256 |
| Definitions and all other form metadata | Before/after SHA256 match, excluding only schema_version |
| Observations and receipt metadata | All 72 rows match before/after SHA256 |
| Packages, manifests and archive bytes | All three rows match before/after SHA256 |
| Historical zone snapshots | All seven rows match before/after SHA256 |
| Hosted API readiness | https://field-maps.onrender.com/ready returned ready |

The one legacy definition was not converted or deleted. No grants, RLS policies,
answers, bindings or queued request bodies were changed. Temporary raw form
snapshots were removed after verification; the private audit contains SQL,
hashes and verification metadata.

## Limits

This is hosted database application and preservation evidence. The signed-in web
page was not inspected because browser host access was restricted by policy.
No new physical-device or QGIS Desktop acceptance is claimed. At the time of
hosted verification, no deployment, commit or push had occurred; the application
source was still in the working tree.

The local PostgreSQL service mentioned in the manual runbook did not exist on
this computer. The plugin execution required neither that service nor the
database credentials pasted in chat. Those credentials were not written to
files or used in commands.
