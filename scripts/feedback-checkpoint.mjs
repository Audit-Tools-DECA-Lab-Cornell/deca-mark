#!/usr/bin/env node
import { constants, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';

const STORE = 'docs/plan/app-feedback-2026-10-23/checkpoints';
const ID = /^[0-9]{6}(?:-[a-z0-9-]+)?$/;
const HELP = `Explicit synchronous feedback checkpoints (Node 24)
  node scripts/feedback-checkpoint.mjs create --id 000001 --file relative/path [--file other/path]
  node scripts/feedback-checkpoint.mjs verify [--id 000001]
  node scripts/feedback-checkpoint.mjs compare [--id 000001]
Options: --root DIRECTORY (default: repository containing this script), --help
Latest means lexically greatest complete sequence. compare reports JSON differences; it never restores.
Pause writers before create. Only explicit file paths are read; no directory expansion or Git access.
`;
class CheckpointError extends Error {}
const fail = message => { throw new CheckpointError(message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function safePath(path) {
  const parts = typeof path === 'string' ? path.split('/') : [];
  const forbidden = /(?:secret|credential|password|token|private[-_]?key)|^\.env|^\.(?:git|aws|ssh|vercel|supabase|local|codex|agents)$|^(?:node_modules|vendor|dist|build|config|configuration)$|\.(?:pem|key|p12|pfx)$|config|^(?:package\.json|app\.json|eas\.json|vercel\.json|settings\.json|pyproject\.toml|.*lock.*|\.npmrc|\.yarnrc.*|.*\.qgz)$/i;
  if (!parts.length || parts.some(part => !part || part === '.' || part === '..' || forbidden.test(part)) || path.includes('\\') || path.includes('\0') || path === STORE || path.startsWith(`${STORE}/`)) fail(`Unsafe allowlist path: ${path}`);
  return path;
}
function inspect(root, relative) {
  let current = root;
  const parts = relative.split('/');
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    let stat;
    try { stat = lstatSync(current); }
    catch (error) { if (error?.code === 'ENOENT') return false; throw error; }
    if (stat.isSymbolicLink()) fail(`Symlink rejected: ${relative}`);
    if (index < parts.length - 1 && !stat.isDirectory()) fail(`Not a directory: ${relative}`);
    if (index === parts.length - 1) return stat;
  }
  fail('Empty internal path');
}
function readRegular(root, relative) {
  const stat = inspect(root, relative);
  if (!stat || !stat.isFile()) fail(`Regular file required: ${relative}`);
  const fd = openSync(join(root, relative), constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return readFileSync(fd); } finally { closeSync(fd); }
}
function durableWrite(path, bytes) {
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
function syncDirectory(path) {
  const fd = openSync(path, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function parseArgs(args) {
  if (args.includes('--help')) return { help: true };
  const [command, ...rest] = args;
  if (!['create', 'verify', 'compare'].includes(command)) fail('Expected create, verify, or compare; use --help');
  const options = { command, root: resolve(import.meta.dirname, '..'), files: [] };
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = rest.slice(i, i + 2);
    if (!value || value.startsWith('--')) fail(`Missing value for ${flag}`);
    switch (flag) {
      case '--root': options.root = resolve(value); break;
      case '--id': if (options.id) fail('Duplicate --id'); options.id = value; break;
      case '--file': options.files.push(safePath(value)); break;
      default: fail(`Unknown option: ${flag}`);
    }
  }
  if (options.id && !ID.test(options.id)) fail('ID must start with exactly six digits, optionally followed by a lowercase label');
  if (command === 'create' && (!options.id || !options.files.length)) fail('create requires --id and at least one --file');
  if (command !== 'create' && options.files.length) fail('--file is only valid for create');
  if (new Set(options.files).size !== options.files.length) fail('Duplicate --file');
  options.files.sort();
  return options;
}
function manifestAt(root, checkpoint) {
  const manifest = JSON.parse(readRegular(root, `${checkpoint}/manifest.json`).toString('utf8'));
  if (manifest.version !== 1 || manifest.status !== 'complete' || !ID.test(manifest.id) || !Array.isArray(manifest.files) || !manifest.files.length) fail('Invalid checkpoint manifest');
  const seen = new Set();
  for (const [index, entry] of manifest.files.entries()) {
    safePath(entry.path);
    if (seen.has(entry.path)) fail('Duplicate manifest path');
    seen.add(entry.path);
    switch (entry.state) {
      case 'deleted': if (entry.sha256 !== null || entry.blob !== null) fail('Invalid tombstone'); break;
      case 'present':
        if (!/^[a-f0-9]{64}$/.test(entry.sha256) || entry.blob !== `files/${String(index).padStart(6, '0')}`) fail('Invalid snapshot entry');
        break;
      default: fail('Invalid manifest state');
    }
  }
  return manifest;
}
function verify(root, checkpoint, manifest) {
  for (const entry of manifest.files) {
    if (entry.state === 'present' && hash(readRegular(root, `${checkpoint}/${entry.blob}`)) !== entry.sha256) fail(`Snapshot hash mismatch: ${entry.path}`);
  }
}
function create(options, root) {
  const files = options.files.map(path => {
    const stat = inspect(root, path);
    if (stat && !stat.isFile()) fail(`Regular file required: ${path}`);
    return { path, present: Boolean(stat) };
  });
  const storeStat = inspect(root, STORE);
  if (storeStat && !storeStat.isDirectory()) fail('Checkpoint store must be a directory');
  mkdirSync(join(root, STORE), { recursive: true });
  const destination = join(root, STORE, options.id);
  if (existsSync(destination)) fail(`Checkpoint already exists: ${options.id}`);
  const temp = mkdtempSync(join(root, STORE, '.tmp-'));
  mkdirSync(join(temp, 'files'));
  const entries = files.map(({ path, present }, index) => {
    if (!present) return { path, state: 'deleted', sha256: null, blob: null };
    const bytes = readRegular(root, path);
    const blob = `files/${String(index).padStart(6, '0')}`;
    durableWrite(join(temp, blob), bytes);
    return { path, state: 'present', sha256: hash(bytes), blob, bytes: bytes.length };
  });
  const manifest = { version: 1, status: 'complete', id: options.id, root, files: entries };
  // Manifest is the last file written; directory publication is the commit point.
  syncDirectory(join(temp, 'files'));
  durableWrite(join(temp, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  syncDirectory(temp);
  const relative = temp.slice(root.length + 1);
  verify(root, relative, manifestAt(root, relative));
  renameSync(temp, destination);
  syncDirectory(dirname(destination));
  return { checkpoint: options.id, manifest: `${STORE}/${options.id}/manifest.json`, files: entries.length };
}
function report(options, root) {
  inspect(root, STORE);
  const id = options.id ?? readdirSync(join(root, STORE), { withFileTypes: true })
    .filter(item => item.isDirectory() && ID.test(item.name)).map(item => item.name).sort().at(-1);
  if (!id) fail('No complete checkpoint available');
  const checkpoint = `${STORE}/${id}`;
  const manifest = manifestAt(root, checkpoint);
  if (manifest.id !== id || manifest.root !== root) fail('Checkpoint identity does not match this root');
  verify(root, checkpoint, manifest);
  const differences = [];
  if (options.command === 'compare') {
    // Preflight every source before reading any source bytes.
    const states = manifest.files.map(entry => ({ entry, stat: inspect(root, entry.path) }));
    for (const { entry, stat } of states) {
      if (stat && !stat.isFile()) fail(`Regular file required: ${entry.path}`);
      const diskHash = stat ? hash(readRegular(root, entry.path)) : null;
      if (diskHash !== entry.sha256) differences.push({ path: entry.path, snapshot: entry.sha256, disk: diskHash });
    }
  }
  return { checkpoint: id, verified: true, differences };
}
// CLI boundary: propagate failures as a nonzero exit, retaining interrupted temp directories.
try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) process.stdout.write(HELP);
  else {
    const root = realpathSync(options.root);
    const result = options.command === 'create' ? create(options, root) : report(options, root);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`feedback-checkpoint: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
