# Implement observation authorization

Implement finding 1 from the accompanying condensed audit.

Read AGENTS.md, PRODUCT.md, relevant decisions, and owning backend,
database, and Supabase documentation. Record current HEAD. You previously
verified 8ad122e77b130d91c6e372d510fab0f766820214 and reported relevant
source unchanged from the audit; verify that this still holds.

Required behavior:
- Research observers read only records whose immutable creator user ID
  matches their own. Never use observer initials for ownership.
- Viewers/managers and organization owners/admins retain documented
  review access, including inherited organization-level authority.
- Organization membership alone does not grant project access.
- Training remains creator-only and excluded from research exports.
- Research export endpoints require documented review/export roles.
- Lists, details, summaries, counts, filters, pagination, and GIS
  observation projections must respect the applicable row scope.
- Uploads, retries, revocation, and historical attribution remain intact.

Enforce row visibility in RLS. Add explicit API authorization where an
operation requires a review/export role. Follow existing error conventions.
Do not implement a frontend-only fix or introduce a new permission framework.

Add a regression that fails against the vulnerable source. Use synthetic
records from two creators in the same project. Cover signed API requests
and restricted-role SQL, including observer/viewer/manager/admin access,
foreign tenants, Training, exports, and upload/retry regressions.

Choose a schema change consistent with current migration policy. Editing
a baseline alone does not update existing installations. Document the
required migration path without applying it to an existing database.

Use Node 24, pnpm 10.17.1, and repository Python tooling. Run focused
regressions, then appropriate backend static checks and disposable
backend/SQL suites. Report actual results and infrastructure limitations.

Do not read secrets or environment/password files, dump environment
variables, contact real email providers, reset existing databases, change
hosted services, commit, push, deploy, or switch/create branches.

Finish the local implementation and verification; do not stop at a plan.
Report changed files, before/after behavior, tests, and remaining migration
or deployment work.
