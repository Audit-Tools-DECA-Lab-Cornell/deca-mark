import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initializeDatabase, SCHEMA_VERSION } from "./database-migrations";
import { adapter } from "./package-store.fixture";

function foreignKeyDatabase(): DatabaseSync {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE parent(id INTEGER PRIMARY KEY);
    CREATE TABLE child(parent_id INTEGER REFERENCES parent(id));
    INSERT INTO parent VALUES (1); INSERT INTO child VALUES (1);
    PRAGMA user_version = 4;
  `);
  return sqlite;
}

describe("Complete incompatible collector schema reset", () => {
  it("resets an FTS virtual table even when dropping it removes its shadow tables", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(
        "CREATE VIRTUAL TABLE feature_search USING fts5(body); INSERT INTO feature_search VALUES ('obsolete'); PRAGMA user_version = 4;",
      );
      await initializeDatabase(adapter(sqlite));
      expect(
        sqlite.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'feature_search%'").all(),
      ).toEqual([]);
      expect(sqlite.prepare("PRAGMA user_version").get()).toEqual({ user_version: SCHEMA_VERSION });
    } finally {
      sqlite.close();
    }
  });

  it("resets populated foreign-key tables and restores enabled constraint enforcement", async () => {
    const sqlite = foreignKeyDatabase();
    try {
      await initializeDatabase(adapter(sqlite));
      expect(
        sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('parent', 'child')").all(),
      ).toEqual([]);
      expect(sqlite.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
    } finally {
      sqlite.close();
    }
  });

  it("restores foreign-key tables and enforcement when reset creation fails", async () => {
    const sqlite = foreignKeyDatabase();
    const base = adapter(sqlite);
    const db = {
      ...base,
      async execAsync(sql: string) {
        await base.execAsync(
          sql.replace("CREATE TABLE package_contents", "INVALID TABLE package_contents"),
        );
      },
    };
    try {
      await expect(initializeDatabase(db)).rejects.toThrow();
      expect(sqlite.prepare("SELECT * FROM parent").all()).toEqual([{ id: 1 }]);
      expect(sqlite.prepare("SELECT * FROM child").all()).toEqual([{ parent_id: 1 }]);
      expect(sqlite.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
      expect(sqlite.prepare("PRAGMA user_version").get()).toEqual({ user_version: 4 });
    } finally {
      sqlite.close();
    }
  });

  it("removes incompatible views before recreating current tables with the same names", async () => {
    const sqlite = new DatabaseSync(":memory:");
    try {
      sqlite.exec(
        "CREATE TABLE obsolete(payload TEXT); INSERT INTO obsolete VALUES ('old'); CREATE VIEW observations AS SELECT * FROM obsolete; PRAGMA user_version = 4;",
      );
      await initializeDatabase(adapter(sqlite));
      expect(
        sqlite.prepare("SELECT type FROM sqlite_master WHERE name = 'observations'").get(),
      ).toEqual({ type: "table" });
      expect(sqlite.prepare("SELECT COUNT(*) total FROM observations").get()).toEqual({ total: 0 });
      expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'view'").all()).toEqual(
        [],
      );
    } finally {
      sqlite.close();
    }
  });
});
