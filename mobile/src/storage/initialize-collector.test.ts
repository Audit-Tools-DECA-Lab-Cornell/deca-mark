import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { packageFileResetPending } from "./database-migrations";
import { initializeCollectorDatabase } from "./initialize-collector";
import { adapter } from "./package-store.fixture";

it("retries interrupted incompatible-file cleanup before mounting, and preserves same-schema maps on restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "mob28-reset-"));
  const path = join(root, "collector.db");
  const maps = join(root, "hosted");
  const oldMap = join(maps, "incompatible.json");
  mkdirSync(maps);
  writeFileSync(oldMap, "obsolete map");
  let sqlite = new DatabaseSync(path);
  try {
    sqlite.exec(
      "CREATE TABLE observations(id TEXT); INSERT INTO observations VALUES ('obsolete'); PRAGMA user_version=3;",
    );
    await expect(
      initializeCollectorDatabase(adapter(sqlite), () => {
        throw new Error("Disk unavailable");
      }),
    ).rejects.toThrow("Disk unavailable");
    expect(await packageFileResetPending(adapter(sqlite))).toBe(true);
    expect(existsSync(oldMap)).toBe(true);
    sqlite.close();
    sqlite = new DatabaseSync(path);
    await initializeCollectorDatabase(adapter(sqlite), () =>
      rmSync(maps, { recursive: true, force: true }),
    );
    expect(existsSync(oldMap)).toBe(false);
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
