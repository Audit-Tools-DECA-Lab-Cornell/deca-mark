import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initializeDatabase, packageFileResetPending, SCHEMA_VERSION } from "./database-migrations";
import { adapter } from "./package-store.fixture";

const collectionTables = [
  "observations",
  "observation_drafts",
  "package_contents",
  "package_authorizations",
  "available_current_packages",
] as const;
/** Tables that older builds created and nothing writes any more: a reset leaves none of them behind. */
const retiredTables = ["package_selections", "active_sessions"] as const;

describe("Prelaunch collection schema reset", () => {
  for (const version of [1, 2, 3, 4, 99] as const) {
    it(`resets every non-internal collector table from incompatible schema ${version}`, async () => {
      const sqlite = new DatabaseSync(":memory:");
      const db = adapter(sqlite);
      try {
        for (const table of [...collectionTables, ...retiredTables])
          sqlite.exec(`CREATE TABLE ${table}(payload TEXT); INSERT INTO ${table} VALUES ('old');`);
        sqlite.exec(`
          CREATE TABLE server_capabilities(payload TEXT);
          INSERT INTO server_capabilities VALUES ('old');
          CREATE TABLE "retired""; DROP TABLE observations; --"(id INTEGER PRIMARY KEY AUTOINCREMENT);
          INSERT INTO "retired""; DROP TABLE observations; --" DEFAULT VALUES;
          PRAGMA user_version = ${version};
        `);
        await initializeDatabase(db);
        for (const table of collectionTables)
          expect(sqlite.prepare(`SELECT COUNT(*) total FROM ${table}`).get()).toEqual({ total: 0 });
        for (const table of retiredTables)
          expect(
            sqlite.prepare("SELECT name FROM sqlite_master WHERE name = ?").all(table),
          ).toEqual([]);
        expect(
          sqlite
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'retired%'")
            .all(),
        ).toEqual([]);
        expect(
          sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'").get(),
        ).toEqual({ name: "sqlite_sequence" });
        expect(
          sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'server_capabilities'").all(),
        ).toEqual([]);
        expect(sqlite.prepare("PRAGMA user_version").get()).toEqual({
          user_version: SCHEMA_VERSION,
        });
        expect(await packageFileResetPending(db)).toBe(true);
        expect(
          sqlite
            .prepare(
              "SELECT name FROM pragma_table_info('observations') WHERE name IN ('upload_protocol', 'canonicalization_version')",
            )
            .all(),
        ).toEqual([]);
      } finally {
        sqlite.close();
      }
    });
  }

  it("rolls back the complete reset when current schema creation fails", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const base = adapter(sqlite);
    try {
      sqlite.exec(`
        CREATE TABLE observations(payload TEXT); INSERT INTO observations VALUES ('raw original');
        CREATE TABLE local_metadata(key TEXT PRIMARY KEY, value TEXT);
        INSERT INTO local_metadata VALUES ('original', 'keep'); PRAGMA user_version = 4;
      `);
      const db = {
        ...base,
        async execAsync(sql: string) {
          await base.execAsync(
            sql.replace("CREATE TABLE package_contents", "INVALID TABLE package_contents"),
          );
        },
      };
      await expect(initializeDatabase(db)).rejects.toThrow();
      expect(sqlite.prepare("SELECT payload FROM observations").get()).toEqual({
        payload: "raw original",
      });
      expect(sqlite.prepare("SELECT * FROM local_metadata").get()).toEqual({
        key: "original",
        value: "keep",
      });
      expect(sqlite.prepare("PRAGMA user_version").get()).toEqual({ user_version: 4 });
      await initializeDatabase(base);
      expect(sqlite.prepare("SELECT COUNT(*) total FROM observations").get()).toEqual({ total: 0 });
      expect(await packageFileResetPending(base)).toBe(true);
    } finally {
      sqlite.close();
    }
  });
});
