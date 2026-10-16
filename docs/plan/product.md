# Product: stakeholders, roles and journeys

This file is part of the [DECA Mark production plan](README.md) and defines no tasks. It answers two questions: who the system serves, and what "pilot-ready" means. Architecture is in [architecture.md](architecture.md); contracts are in [contracts.md](contracts.md).

Current implementation and remaining acceptance are summarized in [current position](current-state.md). Journeys below define pilot requirements, including uncompleted mobile/operations gates; they are not a claim that every step works today.

## Stakeholders

| Who | Surface | What they need | Plan areas that serve them |
|---|---|---|---|
| **PI / research lead** (Janet) | Web | An instrument whose versions never reinterpret old data; coverage against the protocol; exports; QGIS analysis | `CON-02`, `BE-11`, `WEB-09`, `WEB-11`, `GIS-01` |
| **Org owner / lab admin** | Web | Create the organization and projects; manage admins and members; own the data; billing later | `DB-05`, `BE-07`, `WEB-06`, `WEB-07` |
| **Project manager / coordinator** | Web on a laptop or iPad | Turn a QGIS project into site packages; publish form versions; invite and assign observers; watch sync health | `BE-13`, `WEB-08`, `WEB-09`, `WEB-07`, `WEB-11` |
| **Field observer** (research assistant, student) | Mobile, on a phone or tablet: offline, in the sun, one-handed | Fast sign-up; a clear "saved" / "uploaded" state; never losing a record; minimal typing | `MOB-*`, `SYNC-*` |
| **GIS analyst** | QGIS and exports | Stable typed columns; live read-only layers; per-project access | `GIS-*`, `BE-14` |
| **Platform operator** (us) | Supabase, PowerSync, Render, Vercel and EAS dashboards | Backups, diagnostics, runbooks, cost control | `OPS-*` |
| **Governance** (IRB, university, app stores) | Policies and store review | No child PII; retention rules; in-app account deletion (Apple 5.1.1(v)); a Play web-deletion link; privacy labels and Data safety | `BE-08`, `MOB-07`, `WEB-14`, `OPS-11` |

## Roles

Authorization is stored in the database and checked on every request. It is not put in JWT claims, which go stale until the next token refresh. See [architecture.md](architecture.md#security-rules).

| Level | Role | Can |
|---|---|---|
| Organization | `owner` | Everything an admin can do, plus delete the org, manage admins and transfer ownership. Every org has at least one owner. |
| Organization | `admin` | Create projects, invite and remove `member`s, act as a manager on every project in the org. Admins cannot touch `owner` or `admin` rows (DB-06). |
| Organization | `member` | Belong to the org; project access comes from project roles |
| Project | `manager` | Sites and packages, form versions, invitations, members, exports |
| Project | `observer` | Collect and upload; read the project's sites, forms, packages and their own observations |
| Project | `viewer` | Read-only review and export |
| Project | GIS reader grant | A per-project read-only database login or key ([qgis/PLAN.md](../../qgis/PLAN.md)). This is not a user role. |
| Platform | platform admin | A support flag in the database, not a JWT claim; used only by support tooling |

The project roles `manager`, `observer` and `viewer` are defined in the canonical [schema baseline](../../supabase/migrations/20261012120000_current_baseline.sql).

## Journeys the pilot must support

### J1: The manager sets up a study (web)

1. Sign up, then enter the 6-digit email code.
2. Under D30, an operator bootstraps the organization and first study; owners/admins create later projects on the web. There is no web organization-onboarding flow.
3. Sites: upload the QGIS export (the ground and zones layers plus the `.qgz`). The checks pass, and version 1 becomes the site's current package.
4. Forms: prepare Janet's approved canonical definition as a draft, review validation, then publish and bind its exact version to a map. Template-based drafts exist; arbitrary JSON import remains WEB-09 scope.
5. Team: create an 8-character observer join code, or an invitation link (shown once, to copy).
6. Overview: watch observations arrive, with coverage by zone and round.

### J2: The observer collects (mobile)

1. Install the app. Create an account, then enter the 6-digit code.
2. Profile: display name and initials. The initials become the observer code on every record.
3. The Training project is already there. The observer practises one observation offline.
4. Enter the join code, and the project appears.
5. Download the site on Wi-Fi. The size is shown first, and on cellular the app asks.
6. In the field, with no signal: brief, then place a point, then answer, then review, then save, repeated.
7. Back online, records upload by themselves, and the Observations tab shows "Uploaded".
8. A record the server rejects stays visible as "needs attention", with the reason.

### J3: The analyst reads (QGIS and exports)

1. The manager exports CSV or GeoJSON for a date range.
2. For live access, the operator issues a per-project read-only login (pilot) and the analyst opens the project's typed layer in QGIS.

### J4: An account leaves

1. An observer signs out with unsent records. The app warns them, and the records wait for that account.
2. A user deletes their account in the app or on the web:
   - memberships are removed;
   - the profile is anonymized;
   - observations keep the observer code as a research label;
   - the Auth user is deleted.

## Pilot-ready means

All of these must be true. Each is verified by the [verification.md](verification.md) item named in brackets.

- **Fixtures.** No fixture data on any production mobile or web screen (QA-05 walkthrough).
- **Account lifecycle.** Sign-up, verification, sign-in, password reset, join, sign-out and account deletion work on a real device and on the web (QA-04).
- **Tenant isolation.** A user in org B cannot read or write anything of org A's, through the API or through PowerSync (QA-01, QA-02).
- **Durability.** An offline record survives a force-quit, a restart and an expired session, and uploads exactly once (QA-03).
- **Janet's form.** It is published server-side, validated identically on the device and on the server, and readable in QGIS with typed columns (QA-05).
- **Operations.** Production has backups and has passed a restore drill. Errors reach Sentry from all three apps (QA-06).
