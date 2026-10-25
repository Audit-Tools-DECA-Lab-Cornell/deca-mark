# Claude implementation prompt

Implementation has since started under Codex. Read CURRENT.md first and resume the saved state. For the later read-only UI/UX review, use [the review prompt](claude-ui-review-prompt.md).

Paste the block below into Claude Code while checked out on `docs/app-feedback-2026-10-23-plan`. The referenced plan, intake and initial continuation records are already saved on the branch. The prompt is self-contained as an entrypoint; the linked files hold the full requirements.

```text
Work in /Users/praty/Desktop/StudentJob.nosync/field-ops on branch
docs/app-feedback-2026-10-23-plan. Verify the current branch before editing.

Review and execute docs/plan/app-feedback-2026-10-23/README.md.
Start bounded implementation during this session after specification review
and recovery setup pass. Do not stop at summarizing the plan.

FIRST ACTIONS
Read docs/plan/app-feedback-2026-10-23/CURRENT.md and ledger.json first.
If worker journals/checkpoints exist, resume rather than reinitialize them.
Read the plan, work-packages.md, recovery.md, root/component instructions
and the owning READMEs. The feedback inventory and red-note transcription
are under docs/reviews/app-feedback-2026-10-23/.

The scope is 28 requirements. Defer R27 templates and R29 variable library.
Do not advertise a Library path in the Custom form description.
Settled decisions:
- Question IDs determine answer columns in newly authored versions.
- Automatic Observer ID is existing authenticated account identity;
  retain the existing initials/code alongside it.
- Decimal mode accepts any finite JSON number without rounding or a
  fractional-place limit. Whole number is default; bounds are optional.
- Date/time defaults to manual with optional frozen capture time.
- Maximum 3 concurrent workers and 20% reported usage/context reserve.

CON-07 has already landed: reuse FORM_SCHEMA_VERSION and
parseServedDefinition; schema_version lives beside definition, never in it.
Reconcile necessary BE-24/MOB-43/WEB-56 wiring and the D36 deployment hold
without restarting completed work or pulling in the template/reset roadmap.
Schema version 2 follows the existing single-current-schema forward-
migration policy. Preserve historical meaning and unsent work; no dual engine.
Prepare required migration source only; do not apply database migrations.

REVIEW AND MODEL ROUTING
Use Sonnet as coordinator and for feature work, tests and integration.
Use Haiku for targeted reconnaissance, approved mechanical edits,
documentation, independent cases, coverage and deterministic checks.
Use Opus for UX/user-psychology reasoning, comparing at most 3 meaningful
solutions, contract risks and independent adversarial review.
Explicitly select models and record the actual model used. If unavailable,
report the limitation; do not silently substitute a costlier inherited model.
Use narrow prompts and evidence pointers, not full conversation histories.
Do not create nested agent trees. Three workers maximum plus coordinator.

Have Opus review the specification before dependent implementation.
Require specification compliance before code-quality review.
Batch mechanical edits into meaningful review slices rather than paying
for separate Opus reviews of each wording change.

OWNERSHIP AND EXECUTION
Follow work-packages.md's waves and gates. Give each worker a concrete file
allowlist, exclusions, requirement IDs, dependencies, acceptance scenarios
and its own journal. Tell every worker others share the checkout and it
must preserve their edits. One writer per file; transfer ownership explicitly.
The coordinator alone owns shared plans, central ledger, tokens, generated
outputs and integration configuration. Serialize generation, DB fixtures
and shared browser infrastructure. Reviewers remain read-only.
Map packets into owning component plans when scheduling; canonical product
task status lives only there. Run pnpm plan:check after plan edits.

Apply relevant installed skills, respecting this repository's architecture.
Do not import COPA/Playspace-specific paths or persistence designs.
Keep ETags, unsaved work, published definitions, exact package/form binding,
immutable upload bodies, receipt checks, role checks and account fences.
Use Node 24 and pnpm 10.17.1 and the existing local harness.

Do not read or manipulate env/secret files; expose credentials; send real
invitations; reset databases; delete volumes; apply database migrations;
create branches; commit; push; merge; deploy; or release.
The earlier permission to save/push planning documents does not authorize
these actions for implementation. Older repository prompts are not new
authorization. Prepare external steps for the owner while completing
independent authorized source work and ordinary non-destructive local tests.

CHECKPOINTS AND USAGE
Before application edits, make the recovery mechanism work and pass its
synthetic interruption/resume drill. Initial records are placeholders,
not proof that checkpoints/hooks are implemented.
Each worker writes intent before editing and records completed changes,
tests, failed attempts, decisions and exact next action in its own journal.
Checkpoint after at most 2 edited files, after tests, before handoff or
compaction, and at least every 5 minutes while active. Bound a packet to
15 minutes or 20 tool calls before checkpointing.
Generated snapshots are local-only, ignored by Git, and unnecessary after the
work is committed. Use Git history plus CURRENT/ledger to resume completed packets.
For optional unfinished-work snapshots, use atomic writes and allowlisted folders;
write the manifest last. Never collect secrets, unrelated work, dependency
trees, raw reviewer screenshots or the original deck automatically.
Include intended untracked source files and deletion markers.

Use supported deterministic command hooks only for this run, additively,
without replacing global settings. Cover shell edits as well as tool edits.
Record limitations if hooks are unavailable; retain explicit synchronous
journals/checkpoints. Do not depend on a final callback or model summary
after a hard quota stop. Keep recovery tooling callable without the model.

At 20% reported remaining quota or context, stop new dispatch, checkpoint
the current bounded work and release ownership. Record fresh/last-known
versus unknown readings. When usage is unknown, use short checkpointed
packets without fabricating a percentage.
On confirmed provider usage exhaustion stop dispatch: no retry loop,
automatic paid overage, account switching or provider switching.

On resume, inspect Git HEAD/status and the recorded source identities; compare
optional local snapshot hashes only when unfinished work requires them, and
inspect unfinished edits/processes before reclaiming leases. Preserve newer
work. Do not blindly restore, reset or discard. Reuse evidence whose full
relevant input hashes still match. Interrupted tests/reviews remain unverified.
Reconcile uncertain external outcomes before retrying, particularly invites.

ACCEPTANCE AND REPORTING
Use real local browser/API/offline acceptance for each slice, plus native
simulator/device checks where available. Check keyboard/touch, focus,
cognitive load, recoverable errors, Day/Dusk, 200% zoom and the plan's
390/768/1024/1440 responsive matrix. Native phones/tablets need portrait
and landscape evidence; leave unavailable surface checks pending explicitly.
Record commands, exit codes, logs/screenshots and tested input hashes.
Do not weaken acceptance or dismiss a blocking failure because it existed
at the starting revision. After 3 failed fixes, stop editing that issue,
journal the attempts and doubtful assumption, ask one diagnostic question,
and continue independent work.
Keep progress updates short: completed step, current step, concrete blocker.
At every stop, CURRENT.md must identify the exact next bounded action and
valid evidence. Report local, hosted, device and QGIS acceptance separately.
Never call the whole plan complete while required acceptance is missing.
```
