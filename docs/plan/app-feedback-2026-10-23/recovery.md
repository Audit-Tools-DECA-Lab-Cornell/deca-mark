# Execution recovery and usage limits

## Current delivery policy

On October 25, 2026 the user requested that generated checkpoint files be removed
from the PR. Git branch history now preserves committed implementation. Keep
CURRENT.md, ledger.json and concise worker/test evidence; do not commit duplicate
source snapshots for completed work. The ignored checkpoints/ directory is optional
local protection for unfinished, uncommitted work only. No snapshots are required
to review or resume the committed PR.

## Records

- CURRENT.md: current Git/source identity, completed checks, unresolved gates,
  authorization and one bounded next action.
- ledger.json: packet ownership, source/evidence references, observed usage and
  pending work. Product task status remains in its owning component PLAN.md.
- Worker journals: intent, owned paths, results, meaningful failed attempts,
  decisions and handoff. Keep relevant evidence, not copies of entire source trees.

## During unfinished work

Record intent before editing. Update the marker/journal after bounded changes,
after test results, before handoff and at least every five minutes while active.
Bound a packet to 15 minutes or 20 tool calls. Preserve intended untracked files and
identify incomplete operations. Optional local snapshots must use explicit safe
allowlists, atomic writes and hash verification; exclude secrets, configuration,
dependencies, unrelated work and raw reviewer inputs. They remain ignored by Git
and can be removed after the work is committed. Do not promise hooks that were not
installed; explicit synchronous records remain required. Never rely on a final
model callback after a hard usage stop.

## Usage and resume

At 20% reported remaining quota or context, stop new worker dispatch, finish only
the current bounded change, save records and release ownership. Distinguish fresh,
last-known and unknown readings. A confirmed provider limit means no retry loop,
automatic paid overage, account switch or provider switch.

On resume, inspect Git HEAD/status, CURRENT.md, ledger and the relevant journal.
Preserve newer/unknown edits; do not reset or restore over them. Check unfinished
commands before reclaiming a worker lease. Reuse evidence whose source inputs are
unchanged; rerun affected checks after source changes or failures. An interrupted
command, quota stop, missing device or failed check is not completion. Reconcile
uncertain external outcomes before retrying invitations or other writes.

Git commits/pushes and external changes still require direct user authorization.
Current Git-delivery approval does not authorize production migration/deployment,
secret access, resets or future unrelated automatic commits.
