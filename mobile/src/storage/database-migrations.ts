import { z } from "zod";
import { databaseWrite } from "./database-write";
import type { LocalDatabase } from "./observation-store";

/** The pilot schema (D31): the last one created by a reset. A fresh install starts here. */
export const PILOT_SCHEMA_VERSION = 7;
/** The schema as origin/master's builds left it, the one device in the field holds before the pilot. */
const MASTER_SCHEMA_VERSION = 6;

/** What every refused start says. It is the only thing a person sees, so it also says nothing was lost. */
export const UNREADABLE_VERSION_MESSAGE =
  "This version cannot read the records on this device. Update DECA Mark; nothing was deleted.";

/** Thrown, before anything is written, when the records on this device are not in a version this build reads. */
export class CollectorVersionError extends Error {
  constructor() {
    super(UNREADABLE_VERSION_MESSAGE);
    this.name = "CollectorVersionError";
  }
}

/**
 * One forward step, run inside its own transaction: it moves the database from the version before it
 * to the next, keeping every observation, draft and installed package.
 */
export type Migration = (db: LocalDatabase) => Promise<void>;

/**
 * The forward migrations, in order. Entry `i` moves `user_version` `PILOT_SCHEMA_VERSION + i` to
 * `PILOT_SCHEMA_VERSION + i + 1`. Empty at the pilot schema. A collector change that touches SQLite
 * appends one entry here, never edits the pilot schema or an earlier entry, and never drops a table
 * that holds observations or drafts (mobile/README.md, "Collector database versions").
 */
export const migrations: readonly Migration[] = [];

export const SCHEMA_VERSION = PILOT_SCHEMA_VERSION + migrations.length;

const observationsTable = `
  CREATE TABLE observations (
    id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL,
    owner_scope TEXT NOT NULL DEFAULT 'local',
    sync_state TEXT NOT NULL DEFAULT 'pending'
      CHECK (sync_state IN ('pending', 'synced', 'needs-attention')),
    sync_error TEXT NOT NULL DEFAULT '', server_receipt TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    package_key TEXT NOT NULL DEFAULT ''
  );`;
const observationIndexes = `
  CREATE INDEX observations_created_at ON observations(created_at DESC);
  CREATE INDEX observations_pending ON observations(owner_scope, sync_state, next_attempt_at);
  CREATE INDEX observations_package_reference ON observations(package_key);`;

const pilotSchema = `
  ${observationsTable}
  ${observationIndexes}
  CREATE TABLE observation_drafts (
    owner_scope TEXT PRIMARY KEY NOT NULL, id TEXT NOT NULL,
    updated_at TEXT NOT NULL, payload TEXT NOT NULL, package_key TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX drafts_package_reference ON observation_drafts(package_key);
  CREATE TABLE parked_observation_drafts (
    owner_scope TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL,
    payload TEXT NOT NULL, package_key TEXT NOT NULL DEFAULT '', PRIMARY KEY(owner_scope,id)
  );
  CREATE INDEX parked_drafts_package_reference ON parked_observation_drafts(package_key);
  CREATE TABLE package_contents (
    content_key TEXT PRIMARY KEY NOT NULL, issuer TEXT NOT NULL, project_id TEXT NOT NULL,
    site_id TEXT NOT NULL, package_id TEXT NOT NULL, digest TEXT NOT NULL, payload TEXT NOT NULL,
    UNIQUE(issuer, project_id, package_id)
  );
  CREATE TABLE package_authorizations (
    owner_scope TEXT NOT NULL, content_key TEXT NOT NULL,
    PRIMARY KEY(owner_scope, content_key)
  );
  CREATE TABLE available_current_packages (
    owner_scope TEXT NOT NULL, project_id TEXT NOT NULL, site_id TEXT NOT NULL,
    payload TEXT NOT NULL, PRIMARY KEY(owner_scope, project_id, site_id)
  );
  CREATE TABLE local_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
`;

/**
 * The one-time step from the schema master's builds left (6) to the pilot schema. Only the
 * `observations` table changes shape (the retired `local-only` state leaves its CHECK and DEFAULT), so
 * it is rebuilt and every other table stays as it is:
 * - every bound observation moves with its payload, frozen `uploadBody`, state, error, receipt, attempt
 *   counters, scope and package key untouched; one held in `local-only` that is bound (master
 *   activated these on sign-in) becomes `pending`, which is what master would have made it;
 * - the retired unbound practice rows and the practice drafts (no package key) are the only rows removed;
 * - installed packages, their authorizations and the file-reset marker are not touched, so a verified
 *   install stays installed.
 */
async function upgradeFromMaster(db: LocalDatabase): Promise<void> {
  await db.execAsync(`
    DROP INDEX observations_created_at;
    DROP INDEX observations_pending;
    DROP INDEX observations_package_reference;
    ALTER TABLE observations RENAME TO observations_master;
    ${observationsTable}
    INSERT INTO observations
      (id, created_at, payload, owner_scope, sync_state, sync_error, server_receipt, attempts, next_attempt_at, package_key)
      SELECT id, created_at, payload, owner_scope,
        CASE sync_state WHEN 'local-only' THEN 'pending' ELSE sync_state END,
        sync_error, server_receipt, attempts, next_attempt_at, package_key
      FROM observations_master
      WHERE NOT (sync_state = 'local-only' AND package_key = '');
    DROP TABLE observations_master;
    ${observationIndexes}
    DELETE FROM observation_drafts WHERE package_key = '';
    DELETE FROM parked_observation_drafts WHERE package_key = '';
  `);
}

async function inTransaction(db: LocalDatabase, version: number, step: () => Promise<void>) {
  await db.execAsync("BEGIN IMMEDIATE;");
  try {
    await step();
    await db.execAsync(`PRAGMA user_version = ${version}; COMMIT;`);
  } catch (error) {
    await db.execAsync("ROLLBACK;");
    throw error;
  }
}

/**
 * Brings the database to `SCHEMA_VERSION`, never deleting an observation, draft or install:
 * - a new install (version 0) gets the pilot schema, then any forward migrations;
 * - master's schema (6) takes the one-time step above;
 * - a pilot schema or later takes the forward migrations it has not yet had, each in its own
 *   transaction;
 * - any other version (older than master's, which no build in the field holds, or newer than this build)
 *   throws `CollectorVersionError` before anything is written.
 * `steps` is the migration list; only tests pass another.
 */
export function initializeDatabase(
  db: LocalDatabase,
  steps: readonly Migration[] = migrations,
): Promise<void> {
  const target = PILOT_SCHEMA_VERSION + steps.length;
  return databaseWrite(db, async () => {
    const rows = z
      .array(z.object({ user_version: z.number().int() }))
      .parse(await db.getAllAsync("PRAGMA user_version"));
    let version = rows[0]?.user_version ?? 0;
    const readable =
      version === 0 ||
      version === MASTER_SCHEMA_VERSION ||
      (version >= PILOT_SCHEMA_VERSION && version <= target);
    if (!readable) throw new CollectorVersionError();
    await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    if (version === 0) {
      await inTransaction(db, PILOT_SCHEMA_VERSION, async () => {
        await db.execAsync(
          `${pilotSchema} INSERT INTO local_metadata VALUES ('package_files_need_reset', '1');`,
        );
      });
      version = PILOT_SCHEMA_VERSION;
    } else if (version === MASTER_SCHEMA_VERSION) {
      await inTransaction(db, PILOT_SCHEMA_VERSION, () => upgradeFromMaster(db));
      version = PILOT_SCHEMA_VERSION;
    }
    for (; version < target; version++) {
      const step = steps[version - PILOT_SCHEMA_VERSION];
      if (!step) throw new CollectorVersionError();
      await inTransaction(db, version + 1, () => step(db));
    }
  });
}

export function packageFileResetPending(db: LocalDatabase): Promise<boolean> {
  return databaseWrite(db, async () => {
    const rows = z
      .array(z.object({ value: z.literal("1") }))
      .parse(
        await db.getAllAsync(
          "SELECT value FROM local_metadata WHERE key = 'package_files_need_reset'",
        ),
      );
    return rows.length > 0;
  });
}

export function completePackageFileReset(db: LocalDatabase): Promise<void> {
  return databaseWrite(db, async () => {
    await db.runAsync("DELETE FROM local_metadata WHERE key = 'package_files_need_reset'");
  });
}
