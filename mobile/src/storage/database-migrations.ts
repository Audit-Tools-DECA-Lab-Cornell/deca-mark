import { z } from "zod";
import { databaseWrite } from "./database-write";
import type { LocalDatabase } from "./observation-store";

export const SCHEMA_VERSION = 6;
const objectCommands = { view: "VIEW", table: "TABLE" } as const;

const resetSchema = `
  CREATE TABLE observations (
    id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL,
    owner_scope TEXT NOT NULL DEFAULT 'local',
    sync_state TEXT NOT NULL DEFAULT 'local-only'
      CHECK (sync_state IN ('local-only', 'pending', 'synced', 'needs-attention')),
    sync_error TEXT NOT NULL DEFAULT '', server_receipt TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    package_key TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX observations_created_at ON observations(created_at DESC);
  CREATE INDEX observations_pending ON observations(owner_scope, sync_state, next_attempt_at);
  CREATE INDEX observations_package_reference ON observations(package_key);
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
  CREATE TABLE package_selections (
    owner_scope TEXT NOT NULL, project_id TEXT NOT NULL, site_id TEXT NOT NULL,
    content_key TEXT NOT NULL, PRIMARY KEY(owner_scope, project_id, site_id)
  );
  CREATE TABLE available_current_packages (
    owner_scope TEXT NOT NULL, project_id TEXT NOT NULL, site_id TEXT NOT NULL,
    payload TEXT NOT NULL, PRIMARY KEY(owner_scope, project_id, site_id)
  );
  CREATE TABLE active_sessions (
    owner_scope TEXT PRIMARY KEY NOT NULL, package_key TEXT NOT NULL, payload TEXT NOT NULL
  );
  CREATE TABLE local_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  INSERT INTO local_metadata VALUES ('package_files_need_reset', '1');
`;

export function initializeDatabase(db: LocalDatabase): Promise<void> {
  return databaseWrite(db, async () => {
    const rows = z
      .array(z.object({ user_version: z.number().int() }))
      .parse(await db.getAllAsync("PRAGMA user_version"));
    await db.execAsync("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    if (rows[0]?.user_version === SCHEMA_VERSION) return;
    const [settings] = z
      .tuple([z.object({ foreign_keys: z.union([z.literal(0), z.literal(1)]) })])
      .parse(await db.getAllAsync("PRAGMA foreign_keys"));
    await db.execAsync("PRAGMA foreign_keys = OFF;");
    try {
      await db.execAsync("BEGIN IMMEDIATE;");
      try {
        const objects = z
          .array(z.object({ name: z.string().min(1), type: z.enum(["view", "table"]) }))
          .parse(
            await db.getAllAsync(
              "SELECT name,type FROM sqlite_master WHERE type IN ('view','table') AND name NOT GLOB 'sqlite_*' ORDER BY CASE type WHEN 'view' THEN 0 ELSE 1 END",
            ),
          );
        for (const object of objects)
          await db.execAsync(
            `DROP ${objectCommands[object.type]} IF EXISTS "${object.name.replaceAll('"', '""')}";`,
          );
        await db.execAsync(`${resetSchema} PRAGMA user_version = ${SCHEMA_VERSION}; COMMIT;`);
      } catch (error) {
        await db.execAsync("ROLLBACK;");
        throw error;
      }
    } finally {
      await db.execAsync(`PRAGMA foreign_keys = ${settings.foreign_keys};`);
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
