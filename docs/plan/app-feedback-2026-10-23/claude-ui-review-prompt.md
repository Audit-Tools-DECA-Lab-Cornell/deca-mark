# Claude UI/UX review handoff

Use this after implementation checks finish. Read CURRENT.md for the actual runtime and authorization state; do not restart the implementation plan or reset the checkout.

```text
Review the implemented reviewer feedback in the existing field-ops checkout on
branch docs/app-feedback-2026-10-23-plan. Start with
 docs/plan/app-feedback-2026-10-23/CURRENT.md
 docs/plan/app-feedback-2026-10-23/ledger.json
 docs/reviews/app-feedback-2026-10-23/README.md
and the owning component PLAN.md entries WEB-61–64, MOB-50, CON-08, BE-27,
DB-21 and QA-10. Verify the branch and current diff; changes may be uncommitted.

This is a review task. Preserve the implementation and concise execution records. Git history preserves completed work; do not generate duplicate source snapshots.
Do not reimplement, commit, push, reset, apply migrations, deploy, change roles
or send invitations. A pending authorization remains pending until the human
answers. No environment or secret-file inspection.

Use Sonnet to coordinate a maximum of three parallel reviewers, with disjoint
surfaces. Use Haiku for bounded evidence reconciliation and mechanical checks;
use Opus for cognitive walkthroughs, interaction alternatives, accessibility,
responsive behavior and adversarial review. Record actual models; do not silently
substitute a costlier model or create nested reviewer trees. Apply appropriate
UI/UX skills while preserving Contour, PRODUCT.md and DESIGN.md.

Review requirements first, then implementation quality. R27 templates and R29
variable library are deferred. Existing role permissions are unchanged by the
wording request. Numeric bounds are optional; whole number is default; decimal
values receive no fixed-place rounding. Account ID is existing authenticated
identity. Automatic identity/code/time freeze at first placement.

Inspect actual running source, not the stale build on port3000. The temporary
3101 harness described in workers/P32-preview.md renders actual components with
clearly labeled synthetic fixtures; it establishes no API/save/publish, auth,
physical-device or deployment acceptance. Use CURRENT.md to find a verified real
runtime for integration. Confirm the rendered theme, not just a selector label.

Walk through manager reorder/rename/rules/dynamic options, invalid→valid bounds,
date/time/DST/source settings, new-question defaults, invitation batches/account
switch/recovery, and report All/Custom filters. Check Day/Dusk, 390/768/1024/1440
widths, keyboard/focus and touch target behavior. Distinguish demonstrated bugs
from preferences. Avoid generic redesigns, extra panels, decorative typography,
unnecessary abstractions or comments. Focus on comprehension, error recovery,
responsive operation and preservation of typed work.

Keep a journal under docs/plan/app-feedback-2026-10-23/workers/ before starting.
Checkpoint bounded work/evidence every five minutes and before handoff. Use the
existing synchronous recovery CLI; no global hooks/settings changes. At20%
reported usage/context reserve, stop new dispatch, save the current marker,
checks and exact next action, and release ownership. Unknown usage is unknown;
use short packets. Never depend on a final callback after provider exhaustion.
No paid overage, account switching or repeated quota retries.

Return at most five actionable findings, ordered by severity. Give each a source
path/line, a concrete trigger, observed behavior, impact and smallest suitable
fix. Separate tested runtime evidence from source inference. If no defects were
demonstrated, say that and list precise remaining acceptance gaps. Do not claim
WCAG, native-device, hosted or QGIS Desktop acceptance from a source/preview test.
```
