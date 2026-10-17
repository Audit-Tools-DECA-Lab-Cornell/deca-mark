# Engineering audit — condensed implementation handoff

Audited commit: 2b5bf9aaa7067c98c44520de3c9b3f573a166731.
This document summarizes a prior audit; its results must not be represented as tests executed in the current checkout.

Verdict: preserve the core transactional architecture and fix specific defects.

Ranked findings:
1. P1: observers can read/export other creators’ research observations.
2. P1: the QGIS converter requires removed assignment_basis/display_anchor_basis fields and rejects current exports.
3. P2: form drafts lack stale-write and reviewed-publication preconditions.
4. P2: required numeric questions with min > max can be published.
5. P2: obsolete form compatibility paths, reserved-question-ID guards, and test-only upload validators add unnecessary maintenance.

Implement finding 1 only.

At the audited commit:
- supabase/migrations/20261012120000_current_baseline.sql:2471,
  assigned_observations, limits creator visibility only in Training.
- backend/src/fieldmaps_api/services/observation_analysis.py:
  page/detail/summary check project access.
- backend/src/fieldmaps_api/services/observation_exports.py:
  export checks project access without requiring a review/export role.
- PRODUCT.md:43 and docs/plan/product.md specify that observers read
  their own observations; viewers/managers have review/export access.

Prior reproduction:
A synthetic manager uploaded a record. A different user with observer
membership in that same research project could list the record, open
its answers, and download those answers in an export. All returned 200.
This demonstrated within-project disclosure, not cross-tenant disclosure.

Prior verification:
- 676 backend tests passed in 526.96 seconds.
- SQL acceptance, 2,545 numeric comparisons, and seven concurrency
  scenarios passed.
- Those checks used disposable PostgreSQL 17/PostGIS 3.5 plus pg_cron
  because the pinned Supabase image exceeded available Docker storage.
- These results do not establish hosted compatibility.
- No application changes, hosted changes, real email, or credential
  reads occurred during that audit.

Preserve authentication, tenant isolation, Training creator isolation,
historical package/form/zone attribution, durable retry receipts, and
authority rechecks. Do not combine the other findings with this fix.
