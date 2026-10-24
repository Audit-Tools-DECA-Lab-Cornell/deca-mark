# Durable execution and usage-limit recovery

## Initial state

The planning commit includes an initial [ledger](ledger.json) and [CURRENT marker](CURRENT.md). They say implementation has not started. Worker journals, recovery tooling, snapshots, hooks, and the recovery drill are **not implemented or verified** by this documentation delivery. Establish and test them in Wave 0 before editing application code.

## Ownership and records

| Artifact | Writer | Required contents |
| --- | --- | --- |
| `ledger.json` | Coordinator only | Format version; run/branch/base; active wave; packet IDs, dependency/evidence pointers, exact owned paths and exclusions; worker/model identity and lease; last valid checkpoint; next bounded action; fresh/last-known/unknown usage; pending authorization. Product task status remains in its component plan. |
| `CURRENT.md` | Coordinator only | One-screen entrypoint: current wave, last valid checkpoint, active/released leases, unresolved findings, exact resume commands and evidence that remains valid. |
| `workers/<packet>.md` | Assigned worker only | Intent before editing; current owner/lease; intended paths; completed edits; test command/exit/log/hash; failed attempts; decisions; next action. |
| `checkpoints/<sequence>/` | Recovery tooling under coordinator serialization | Allowlisted changed source/docs (including intended untracked files), baseline identities, current hashes, relevant diff, journal/evidence pointers and manifest. Immutable after publication. |
| `evidence/` | Assigned evidence owner | Logs/screenshots/review reports with packet, timestamp, tested input hashes, command, exit code, surface and outcome. No credentials, invitation tokens or real-provider messages. |

Before workers start, record the existing worktree baseline, including relevant tracked and untracked files, without overwriting or staging them. Identify each pre-existing change as outside this run or explicitly assigned. A checkpoint is not a Git commit and does not authorize Git writes.

## Checkpoint protocol

1. Write the packet intent and exact file allowlist before editing. A mutation cannot start without a valid lease and writable journal. Never read or snapshot secret/configuration stores, symlink targets outside the allowlist, dependencies or unrelated work.
2. Journal each bounded change. Checkpoint after at most two edited files, after a test result, before handoff/compaction/risky edits, and at least every five minutes while active. End a packet at 15 minutes or 20 tool calls before taking another checkpoint. In-flight commands remain explicitly in flight.
3. Copy allowlisted current files and preserve deletions as manifest tombstones into a new temporary checkpoint directory. Include binary artifacts only if explicitly needed and reviewed; source snapshots must not collect the input deck or reviewer screenshots automatically. Write hashes and the manifest last, verify it, publish the directory by atomic rename, then atomically update ledger/CURRENT. Keep the prior complete checkpoint intact.
4. Pause writers while creating a shared snapshot. Do not snapshot half of a multi-file operation and label it consistent. Worker journals use separate files to avoid concurrent append/write collisions. Coordinator alone changes central pointers.
5. Add supported command hooks for this run to refresh mutation/evidence records without model calls. Use additive session-local settings, not replacements for global configuration. Hook failures must surface before the next mutation. Always retain explicit checkpoints: hooks may not run after a quota stop, kill or crash.

Recovery tooling must be callable without an available model. Test it on an isolated synthetic directory: interrupted temp snapshot leaves the previous checkpoint usable; pending mutation is distinguishable from complete; untracked source and deletions are represented; old checkpoints are not overwritten; restore comparison is non-destructive. Do not simulate failures by damaging real source or interrupting another person's process.

Automatic mutation detection must cover approved shell-based edits as well as Write/Edit tool operations. Avoid recursive journal-trigger loops. If the installed Claude client cannot support the planned hooks, record that limitation and use the explicit synchronous journal/checkpoint workflow; do not claim the hook guard exists.

## Evidence validity

A passed check records a revision plus an input hash set covering its relevant sources, generated artifacts, cases and non-secret tool/config versions. Do not retain a pass solely because the test file itself is unchanged. Changes to any relevant dependency invalidate that check. Interrupted, stale-input or unknown-result checks never count as passed.

Store complete logs on disk, summarize only key results, and link evidence in reviews. Avoid broad raw tool output in every worker prompt. Preserve failed evidence and the exact command needed to reproduce it. Repeat a full suite only after changes/failures make it necessary, not after every copy edit.

## Usage thresholds

Use the installed client's supported usage/context surfaces; do not read secret files or scrape credential stores. Record when a reported percentage was observed and whether it is fresh, last-known or unknown. A context percentage and account quota are different limits; either can trigger the stop rule.

At **20% remaining reported quota or context**, stop dispatching new workers. Finish only the current bounded edit if possible, synchronously checkpoint, release ownership and leave a next action. If already hard-limited, rely on the last durable record and non-model tooling rather than requesting one more final summary.

If usage cannot be observed, record **unknown** and continue only in the bounded checkpointed packets. A temporary usage-status lookup failure is not proof the provider has exhausted model quota. On a confirmed provider usage-limit response, stop new model dispatch. Do not loop retries, buy credits, enable paid overage, change accounts or switch providers. A later session can resume after capacity returns.

All subagents share account limits. Using Haiku does not evade a shared hard limit. Do not promise exact savings; record actual model routing and observed usage when available.

## Resume protocol

1. Read CURRENT, ledger, the assigned journal and the last **complete** manifest. Confirm branch and repository; identify unfinished commands/processes before treating a lease as abandoned. Never launch a duplicate worker because an earlier response is merely delayed.
2. Compare disk with the recorded hashes. Preserve newer edits; classify mismatches as expected newer work, unrelated work or an incomplete last mutation. Inspect in-flight changes; never blindly restore a snapshot over disk, reset the checkout or discard unfinished work.
3. Reclaim an ended worker's lease through the coordinator, journal the handoff, and verify only the affected files. Restoration that would overwrite newer/conflicting content requires explicit resolution, not an automatic retry.
4. Reuse tests and reviews whose full relevant inputs still match. Invalidate only affected evidence. Resume the next incomplete action rather than repeating repository discovery, accepted design reasoning or completed implementation.
5. Reconcile uncertain external outcomes before retries. In particular, an uncertain invitation create is not a definite failure and must not be resent automatically. A quota stop, failed test, unavailable device or incomplete review is never recorded as product completion.

## Reliability boundary

This protocol preserves saved files, decisions and evidence across quota/context interruptions in the same retained workspace. It cannot guarantee preservation of reasoning never written to disk or survival of workspace/disk loss. Checkpoints are not remote backups unless separately committed/pushed with direct authorization. Never create automatic commits or pushes merely to make checkpoints durable.
