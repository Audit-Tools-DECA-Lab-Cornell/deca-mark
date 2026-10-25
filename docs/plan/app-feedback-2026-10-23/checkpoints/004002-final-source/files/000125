import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';

const cli = resolve(import.meta.dirname, 'feedback-checkpoint.mjs');
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'feedback-checkpoint-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function run(root, ...args) {
  return spawnSync(process.execPath, [cli, ...args, '--root', root], { encoding: 'utf8' });
}
function create(root, id = '000001', files = ['new.txt', 'deleted.txt']) {
  return run(root, 'create', '--id', id, ...files.flatMap(file => ['--file', file]));
}
const store = root => join(root, 'docs/plan/app-feedback-2026-10-23/checkpoints');

test('creates an untracked snapshot and deletion tombstone', t => {
  // Given an explicitly selected new file and absent deleted file.
  const root = fixture(t);
  writeFileSync(join(root, 'new.txt'), 'saved content');
  // When the CLI creates the checkpoint.
  const result = create(root);
  // Then the complete manifest preserves bytes and absence.
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(readFileSync(join(store(root), '000001/manifest.json')));
  assert.equal(manifest.files[0].state, 'deleted');
  assert.equal(manifest.files[1].sha256.length, 64);
  assert.equal(readFileSync(join(store(root), '000001/files/000001'), 'utf8'), 'saved content');
});

test('comparison reports newer bytes and recreated deleted files without restoring', t => {
  // Given a complete checkpoint followed by newer disk changes.
  const root = fixture(t);
  writeFileSync(join(root, 'new.txt'), 'old');
  assert.equal(create(root).status, 0);
  writeFileSync(join(root, 'new.txt'), 'new');
  writeFileSync(join(root, 'deleted.txt'), 'recreated');
  // When comparing with the latest complete checkpoint.
  const result = run(root, 'compare');
  // Then both differences are reported and newer bytes remain.
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).differences.map(item => item.path), ['deleted.txt', 'new.txt']);
  assert.equal(readFileSync(join(root, 'new.txt'), 'utf8'), 'new');
});

test('rejects sensitive names, traversal and configuration before content reads', t => {
  // Given protected-looking paths, including nonexistent ones.
  const root = fixture(t);
  // When each prohibited name is selected.
  for (const file of ['.env', 'secret.txt', 'credentials/a', '.git/HEAD', 'node_modules/a', 'x.config.js', '../outside', 'package.json']) {
    const result = create(root, '000001', [file]);
    // Then policy rejection precedes filesystem content access.
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unsafe allowlist path/);
  }
});

test('rejects a symlink ancestor even when its target does not exist', t => {
  // Given a dangling link that must never be followed.
  const root = fixture(t);
  symlinkSync(join(root, 'missing-secret'), join(root, 'link'));
  // When selecting a child through the link.
  const result = create(root, '000001', ['link/file.txt']);
  // Then the symlink is rejected before opening its target.
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Symlink rejected/);
});

test('ignores interrupted temp directories and preserves previous snapshots', t => {
  // Given a checkpoint plus an interrupted newer temporary directory.
  const root = fixture(t);
  writeFileSync(join(root, 'new.txt'), 'old');
  assert.equal(create(root).status, 0);
  mkdirSync(join(store(root), '.tmp-999999'));
  writeFileSync(join(root, 'new.txt'), 'new');
  assert.equal(create(root, '000002').status, 0);
  // When comparing against an explicit older checkpoint and latest.
  const older = run(root, 'compare', '--id', '000001');
  const latest = run(root, 'compare');
  // Then the older snapshot survives and the complete latest is selected.
  assert.equal(JSON.parse(older.stdout).differences.length, 1);
  assert.equal(JSON.parse(latest.stdout).checkpoint, '000002');
  assert.equal(JSON.parse(latest.stdout).differences.length, 0);
  assert.equal(create(root, '000001').status, 1);
});

test('detects corrupted snapshot bytes before disk comparison', t => {
  // Given a corrupted published snapshot.
  const root = fixture(t);
  writeFileSync(join(root, 'new.txt'), 'old');
  assert.equal(create(root).status, 0);
  writeFileSync(join(store(root), '000001/files/000001'), 'corrupt');
  // When verifying the checkpoint.
  const result = run(root, 'verify');
  // Then corruption fails verification.
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Snapshot hash mismatch/);
});

test('offers help and rejects missing allowlists and unknown arguments', t => {
  // Given a clean fixture.
  const root = fixture(t);
  // When calling help or invalid CLI variants.
  const help = run(root, '--help');
  const invalid = [run(root, 'create', '--id', '000001'), run(root, 'create', '--wat'), run(root, 'delete')];
  // Then help succeeds and bad input fails without mutation.
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--file/);
  for (const result of invalid) assert.equal(result.status, 1);
});

test('rejects a tampered manifest containing a sensitive path before snapshot reads', t => {
  // Given a manifest redirected at a nonexistent secret and nonexistent blob.
  const root = fixture(t);
  writeFileSync(join(root, 'new.txt'), 'old');
  assert.equal(create(root).status, 0);
  const path = join(store(root), '000001/manifest.json');
  const manifest = JSON.parse(readFileSync(path));
  manifest.files[1].path = '.env';
  manifest.files[1].blob = 'missing';
  writeFileSync(path, JSON.stringify(manifest));
  // When verifying the tampered checkpoint.
  const result = run(root, 'verify');
  // Then the unsafe path fails before any entry content read.
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unsafe allowlist path/);
});

test('rejects source-file and checkpoint-store symlinks', t => {
  // Given links to nonexistent targets on both file and storage boundaries.
  const root = fixture(t);
  symlinkSync(join(root, 'missing'), join(root, 'new.txt'));
  mkdirSync(join(root, 'docs/plan/app-feedback-2026-10-23'), { recursive: true });
  symlinkSync(join(root, 'elsewhere'), store(root));
  // When attempting to snapshot through either link.
  const fileResult = create(root);
  const storeResult = create(root, '000001', ['absent.txt']);
  // Then both links fail closed before reading their targets.
  for (const result of [fileResult, storeResult]) {
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Symlink rejected/);
  }
});

test('reports a file deleted after the snapshot without recreating it', t => {
  // Given a saved file subsequently removed on disk.
  const root = fixture(t);
  writeFileSync(join(root, 'new.txt'), 'saved');
  assert.equal(create(root).status, 0);
  rmSync(join(root, 'new.txt'));
  // When comparing.
  const result = run(root, 'compare');
  // Then the missing disk bytes remain a reported difference.
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).differences.map(item => [item.path, item.disk]), [['new.txt', null]]);
});
