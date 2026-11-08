import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  initializeDatabase,
  type Migration,
  migrations,
  PILOT_SCHEMA_VERSION,
  packageFileResetPending,
  SCHEMA_VERSION,
  UNREADABLE_VERSION_MESSAGE,
} from "./database-migrations";
import { MASTER_USER_VERSION, masterSchemaV6 } from "./master-v6.fixture";
import { adapter } from "./package-store.fixture";

const pilotTables = [
  "available_current_packages",
  "local_metadata",
  "observation_drafts",
  "observations",
  "package_authorizations",
  "package_contents",
  "parked_observation_drafts",
];
const schemaOf = (sqlite: DatabaseSync) =>
  sqlite
    .prepare(
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' ORDER BY type, name",
    )
    .all();
const version = (sqlite: DatabaseSync) => sqlite.prepare("PRAGMA user_version").get();

describe("the pilot schema is created fresh on install", () => {
  it("ships the pilot version with no forward migration yet", () => {
    expect(PILOT_SCHEMA_VERSION).toBe(7);
    expect(migrations).toEqual([]);
    expect(SCHEMA_VERSION).toBe(PILOT_SCHEMA_VERSION);
  });

  it("creates exactly the pilot tables, without the retired local-only state or old tables", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(sqlite));
      expect(version(sqlite)).toEqual({ user_version: SCHEMA_VERSION });
      expect(
        sqlite
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
          .all()
          .map((row) => row["name"]),
      ).toEqual(pilotTables);
      expect(
        sqlite
          .prepare("SELECT name, \"notnull\", dflt_value FROM pragma_table_info('observations')")
          .all()
          .find((column) => column["name"] === "sync_state"),
      ).toMatchObject({ dflt_value: "'pending'" });
      expect(() =>
        sqlite
          .prepare(
            "INSERT INTO observations (id, created_at, payload, sync_state) VALUES ('a', 'a', '{}', 'local-only')",
          )
          .run(),
      ).toThrow(/CHECK/);
      // A fresh install has no map files to keep, so the file clean-up runs once.
      expect(await packageFileResetPending(adapter(sqlite))).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it("is the same schema whether created fresh or reached from master's schema", async () => {
    const fresh = new DatabaseSync(":memory:");
    const upgraded = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(fresh));
      upgraded.exec(`${masterSchemaV6} PRAGMA user_version = ${MASTER_USER_VERSION};`);
      await initializeDatabase(adapter(upgraded));
      expect(schemaOf(upgraded)).toEqual(schemaOf(fresh));
    } finally {
      fresh.close();
      upgraded.close();
    }
  });

  it("starting again at the current version changes nothing", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      const db = adapter(sqlite);
      await initializeDatabase(db);
      sqlite.exec("INSERT INTO observations (id, created_at, payload) VALUES ('a', 'a', 'raw')");
      await initializeDatabase(db);
      expect(sqlite.prepare("SELECT payload FROM observations").all()).toEqual([
        { payload: "raw" },
      ]);
    } finally {
      sqlite.close();
    }
  });
});

describe("the one-time step from master's schema", () => {
  it("rolls back whole when it fails, leaving every row and the version", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(`${masterSchemaV6} PRAGMA user_version = ${MASTER_USER_VERSION};
        INSERT INTO observations (id, created_at, payload, sync_state, package_key) VALUES ('a', 'a', 'raw', 'pending', 'k');
        INSERT INTO observation_drafts VALUES ('o', 'd', 'a', 'draft', 'k');`);
      const base = adapter(sqlite);
      const before = schemaOf(sqlite);
      const broken = {
        ...base,
        execAsync: (sql: string) =>
          base.execAsync(sql.replace("DROP TABLE observations_master", "DROP TABLE nothing_here")),
      };
      await expect(initializeDatabase(broken)).rejects.toThrow();
      expect(version(sqlite)).toEqual({ user_version: MASTER_USER_VERSION });
      expect(schemaOf(sqlite)).toEqual(before);
      expect(sqlite.prepare("SELECT payload FROM observations").all()).toEqual([
        { payload: "raw" },
      ]);
      expect(sqlite.prepare("SELECT payload FROM observation_drafts").all()).toEqual([
        { payload: "draft" },
      ]);
      await initializeDatabase(base);
      expect(version(sqlite)).toEqual({ user_version: SCHEMA_VERSION });
      expect(sqlite.prepare("SELECT payload FROM observations").all()).toEqual([
        { payload: "raw" },
      ]);
    } finally {
      sqlite.close();
    }
  });
});

const pendingPayload = JSON.stringify({
  id: "a",
  note: "Café — 遊び",
  uploadBody: '{"frozen":"é"}',
});
function pilotDeviceWithRows() {
  const sqlite = new DatabaseSync(":memory:");
  return initializeDatabase(adapter(sqlite)).then(() => {
    sqlite
      .prepare(
        "INSERT INTO observations (id, created_at, payload, owner_scope, sync_state, sync_error, attempts, package_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("a", "2026-11-01T10:00:00.000Z", pendingPayload, "scope", "pending", "", 3, "k");
    sqlite
      .prepare(
        "INSERT INTO observation_drafts (owner_scope, id, updated_at, payload, package_key) VALUES ('scope', 'd', 'u', ?, 'k')",
      )
      .run('{"draft":"é"}');
    sqlite
      .prepare(
        "INSERT INTO parked_observation_drafts (owner_scope, id, updated_at, payload, package_key) VALUES ('scope', 'p', 'u', ?, 'k')",
      )
      .run('{"parked":true}');
    return sqlite;
  });
}
const content = (sqlite: DatabaseSync) => ({
  observations: sqlite.prepare("SELECT * FROM observations ORDER BY id").all(),
  drafts: sqlite.prepare("SELECT * FROM observation_drafts").all(),
  parked: sqlite.prepare("SELECT * FROM parked_observation_drafts").all(),
});

/** Test-only samples (never shipped): version 8 adds a column and a table, version 9 adds an index. */
const addNoteColumn: Migration = async (db) => {
  await db.execAsync(`
    ALTER TABLE observations ADD COLUMN note TEXT NOT NULL DEFAULT '';
    CREATE TABLE sample_extra (id TEXT PRIMARY KEY NOT NULL);
  `);
};
const addIndex: Migration = async (db) => {
  await db.execAsync("CREATE INDEX sample_index ON observations(owner_scope, note);");
};

describe("forward migrations", () => {
  it("keeps pending rows and drafts byte-identical across a sample migration", async () => {
    const sqlite = await pilotDeviceWithRows();
    try {
      const before = content(sqlite);
      await initializeDatabase(adapter(sqlite), [addNoteColumn]);
      expect(version(sqlite)).toEqual({ user_version: PILOT_SCHEMA_VERSION + 1 });
      const after = content(sqlite);
      expect(after.drafts).toEqual(before.drafts);
      expect(after.parked).toEqual(before.parked);
      expect(after.observations).toEqual(before.observations.map((row) => ({ ...row, note: "" })));
      expect(after.observations[0]?.["payload"]).toBe(pendingPayload);
      expect(
        sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'sample_extra'").all(),
      ).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });

  it("runs each step in its own transaction: a failing step keeps the earlier ones and every row", async () => {
    const sqlite = await pilotDeviceWithRows();
    try {
      const before = content(sqlite);
      const failing: Migration = async (db) => {
        await db.execAsync("CREATE INDEX sample_index ON observations(owner_scope);");
        throw new Error("step failed");
      };
      await expect(initializeDatabase(adapter(sqlite), [addNoteColumn, failing])).rejects.toThrow(
        "step failed",
      );
      expect(version(sqlite)).toEqual({ user_version: PILOT_SCHEMA_VERSION + 1 });
      expect(
        sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'sample_index'").all(),
      ).toEqual([]);
      expect(content(sqlite).drafts).toEqual(before.drafts);
      expect(content(sqlite).observations).toHaveLength(1);
      // The next start resumes at the step that failed.
      await initializeDatabase(adapter(sqlite), [addNoteColumn, addIndex]);
      expect(version(sqlite)).toEqual({ user_version: PILOT_SCHEMA_VERSION + 2 });
      expect(content(sqlite).observations[0]?.["payload"]).toBe(pendingPayload);
    } finally {
      sqlite.close();
    }
  });

  it("brings a new install and a master device to the newest version with the same schema", async () => {
    const fresh = new DatabaseSync(":memory:");
    const upgraded = new DatabaseSync(":memory:");
    try {
      upgraded.exec(`${masterSchemaV6} PRAGMA user_version = ${MASTER_USER_VERSION};`);
      for (const sqlite of [fresh, upgraded])
        await initializeDatabase(adapter(sqlite), [addNoteColumn, addIndex]);
      expect(schemaOf(upgraded)).toEqual(schemaOf(fresh));
      expect(version(fresh)).toEqual({ user_version: PILOT_SCHEMA_VERSION + 2 });
    } finally {
      fresh.close();
      upgraded.close();
    }
  });
});

describe("a version this build cannot read", () => {
  // 1 to 5 are development schemas no build in the field holds; 8 is newer than this build.
  it.each([1, 2, 3, 4, 5, 8, 99])("refuses version %i and deletes nothing", async (found) => {
    const sqlite = await pilotDeviceWithRows();
    try {
      sqlite.exec(`PRAGMA user_version = ${found};`);
      const before = { content: content(sqlite), schema: schemaOf(sqlite) };
      await expect(initializeDatabase(adapter(sqlite))).rejects.toThrow(UNREADABLE_VERSION_MESSAGE);
      expect(content(sqlite)).toEqual(before.content);
      expect(schemaOf(sqlite)).toEqual(before.schema);
      expect(version(sqlite)).toEqual({ user_version: found });
    } finally {
      sqlite.close();
    }
  });

  it("says exactly what the person reads", () => {
    expect(UNREADABLE_VERSION_MESSAGE).toBe(
      "This version cannot read the records on this device. Update DECA Mark; nothing was deleted.",
    );
  });
});
