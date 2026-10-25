# P00 recovery tooling journal

Owner: recovery_tooling worker; lease assigned by coordinator for this bounded packet.

## Intent before editing

Own only `scripts/feedback-checkpoint.mjs`, `scripts/feedback-checkpoint.test.mjs`, and this journal. Implement explicit allowlisted synchronous checkpoints and non-destructive comparison using Node 24 built-ins. Preserve previous complete snapshots, record deleted files as tombstones, publish a verified manifest last by atomic directory rename. Reject secret/configuration/dependency/Git paths and all symlink components before reading file content. No app, central ledger/CURRENT, Git, database, hosted, or settings mutation.

Tests use isolated synthetic temporary directories. Exercise create/help/bad CLI input, disk differences, tombstones, untracked files, sensitive/symlink rejection, interrupted temp directories and prior checkpoint preservation. Explicit synchronous checkpoints are supported; Claude command hooks are unavailable in this Codex execution and no automatic mutation guard is claimed.

## Progress

Intent recorded; implementation and validation pending.

## Completed implementation

- Added dependency-free Node 24 CLI: `create --id SIX_DIGITS[-label] --file EXACT_PATH` (repeat file flag); `verify [--id ID]`; `compare [--id ID]`; optional explicit fixture `--root DIRECTORY` and `--help`.
- Default repository root derives from the script location. Storage is fixed at `docs/plan/app-feedback-2026-10-23/checkpoints`. Create hashes copied bytes with SHA-256, persists data and directories with fsync, writes manifest last, verifies copied bytes, then publishes by atomic directory rename. Published IDs cannot be reused. Absent explicitly selected files become deletion tombstones. Failed creates retain distinguishable `.tmp-*` directories and prior checkpoints.
- All allowlist names are checked before source reads. Secret-like segments, conventional configuration files/stores, dependencies, Git, traversal and nested checkpoint collection are denied. Every path component is checked for symlinks; content opens use O_NOFOLLOW. No recursive workspace scan or shell/Git/config access occurs. Manifest entries are validated before snapshot content reads. Compare validates snapshot integrity before reporting disk SHA-256 differences; it never restores.

## Validation and evidence

Red: initial CLI tests failed because the requested CLI did not exist. Green: final synthetic suite below passed 10/10, exit 0, Node v24.18.0, approximately 1.53 seconds. Both modules also passed `node --check`; path-scoped `git diff --check` passed. No application tests were needed for this independent tooling packet.

Tested input hashes:

```
scripts/feedback-checkpoint.mjs SHA256 8dfb82c1ce45113a0912649b36dabd7cbd0550fb79320c6c965a0f726dbb7961
scripts/feedback-checkpoint.test.mjs SHA256 472a54a4a49a5d20832d3bb45c72afa346395eb6994ccb82c5af62aa447aafb0
```

```
Command: /Users/praty/.nvm/versions/node/v24.18.0/bin/node --test scripts/feedback-checkpoint.test.mjs
Exit: 0
✔ creates an untracked snapshot and deletion tombstone
✔ comparison reports newer bytes and recreated deleted files without restoring
✔ rejects sensitive names, traversal and configuration before content reads
✔ rejects a symlink ancestor even when its target does not exist
✔ ignores interrupted temp directories and preserves previous snapshots
✔ detects corrupted snapshot bytes before disk comparison
✔ offers help and rejects missing allowlists and unknown arguments
✔ rejects a tampered manifest containing a sensitive path before snapshot reads
✔ rejects source-file and checkpoint-store symlinks
✔ reports a file deleted after the snapshot without recreating it
Tests 10; pass 10; fail 0; cancelled 0; skipped 0.
```

Architectural review: each module owns one cohesive responsibility (checkpoint CLI / checkpoint behavior tests), with 158 / 120 significant lines. CLI arguments and manifest structures are checked at entry; manifest states use explicit exhaustive rejection. No dependencies, type escape suppressions, app edits or automatic restore were added.

## Limits and handoff

Explicit synchronous checkpoints are active and tested; Claude hooks and automatic mutation detection are unavailable in this Codex run. Coordinator must pause writers, serialize publication and separately update ledger/CURRENT. This tool records disk bytes/root identity, not Git revision/diff or worker leases; coordinator journals supply those baseline and ownership records. IDs must increase lexically for default latest selection. Configuration and secret-looking source names are conservatively excluded. No remote backup, hostile concurrent filesystem mutation guarantee, filesystem-loss guarantee or automatic restoration is claimed.

Next bounded action: coordinator creates the first real checkpoint using an exact reviewed file list, then records its manifest pointer in central recovery records. Ownership of these three delivered files can now be released; no in-flight command remains.
