import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { packageFileResetPending, UNREADABLE_VERSION_MESSAGE } from "./database-migrations";
import { initializeCollectorDatabase } from "./initialize-collector";
import { MASTER_USER_VERSION, masterSchemaV6 } from "./master-v6.fixture";
import { adapter } from "./package-store.fixture";

it("retries interrupted new-install file cleanup before mounting, and preserves same-schema maps on restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "mob44-install-"));
  const path = join(root, "collector.db");
  const maps = join(root, "hosted");
  const staleMap = join(maps, "stale.json");
  mkdirSync(maps);
  writeFileSync(staleMap, "unreferenced map");
  let sqlite = new DatabaseSync(path);
  try {
    await expect(
      initializeCollectorDatabase(adapter(sqlite), () => {
        throw new Error("Disk unavailable");
      }),
    ).rejects.toThrow("Disk unavailable");
    expect(await packageFileResetPending(adapter(sqlite))).toBe(true);
    expect(existsSync(staleMap)).toBe(true);
    sqlite.close();
    sqlite = new DatabaseSync(path);
    await initializeCollectorDatabase(adapter(sqlite), () =>
      rmSync(maps, { recursive: true, force: true }),
    );
    expect(existsSync(staleMap)).toBe(false);
    expect(await packageFileResetPending(adapter(sqlite))).toBe(false);
    mkdirSync(maps);
    const current = join(maps, "current.json");
    writeFileSync(current, "current map");
    sqlite.close();
    sqlite = new DatabaseSync(path);
    await initializeCollectorDatabase(adapter(sqlite), () => {
      throw new Error("Same-schema content must not be reset");
    });
    expect(existsSync(current)).toBe(true);
  } finally {
    sqlite.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("keeps verified package files when a device at master's schema is upgraded", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`${masterSchemaV6} PRAGMA user_version = ${MASTER_USER_VERSION};`);
    await initializeCollectorDatabase(adapter(sqlite), () => {
      throw new Error("A verified install must not be reset");
    });
    expect(await packageFileResetPending(adapter(sqlite))).toBe(false);
  } finally {
    sqlite.close();
  }
});

it("still removes the files of a master device whose own clean-up was pending", async () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(
      `${masterSchemaV6} INSERT INTO local_metadata VALUES ('package_files_need_reset', '1'); PRAGMA user_version = ${MASTER_USER_VERSION};`,
    );
    let cleaned = 0;
    await initializeCollectorDatabase(adapter(sqlite), () => {
      cleaned++;
    });
    expect(cleaned).toBe(1);
    expect(await packageFileResetPending(adapter(sqlite))).toBe(false);
  } finally {
    sqlite.close();
  }
});

it("refuses to start collection on a newer database: nothing is cleaned or deleted", async () => {
  const root = mkdtempSync(join(tmpdir(), "mob44-future-"));
  const maps = join(root, "hosted");
  mkdirSync(maps);
  const installed = join(maps, "installed.json");
  writeFileSync(installed, "verified map");
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec(`${masterSchemaV6}
      INSERT INTO observations (id, created_at, payload, sync_state, package_key) VALUES ('a', 'a', 'unsent', 'pending', 'k');
      INSERT INTO local_metadata VALUES ('package_files_need_reset', '1');
      PRAGMA user_version = 99;`);
    await expect(
      initializeCollectorDatabase(adapter(sqlite), () => {
        throw new Error("Files must not be touched");
      }),
    ).rejects.toThrow(UNREADABLE_VERSION_MESSAGE);
    expect(existsSync(installed)).toBe(true);
    expect(sqlite.prepare("SELECT payload FROM observations").all()).toEqual([
      { payload: "unsent" },
    ]);
    expect(await packageFileResetPending(adapter(sqlite))).toBe(true);
  } finally {
    sqlite.close();
    rmSync(root, { recursive: true, force: true });
  }
});
