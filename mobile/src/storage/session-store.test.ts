import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initializeDatabase } from "./observation-store";
import { installPackage, readSelected, removePackage } from "./package-catalog";
import {
  adapter,
  entry,
  identity,
  memoryDatabase,
  otherOwner,
  owner,
  session,
} from "./package-store.fixture";
import { clearSession, readSession, saveSession } from "./session-store";

describe("Pinned session durability", () => {
  it("restores the exact package/zone/forms after closing a real database", async () => {
    const directory = mkdtempSync(join(tmpdir(), "decamark-package-session-"));
    const path = join(directory, "session.db");
    let sqlite = new DatabaseSync(path);
    try {
      let db = adapter(sqlite);
      await initializeDatabase(db);
      await installPackage(db, owner, entry);
      await saveSession(db, owner, session);
      const successor = {
        ...entry,
        identity: {
          ...identity,
          packageId: "30000000-0000-4000-8000-000000000002",
          packageVersion: 8,
          packageSha256: "b".repeat(64),
        },
      };
      await installPackage(db, owner, successor);
      sqlite.close();
      sqlite = new DatabaseSync(path);
      db = adapter(sqlite);
      await initializeDatabase(db);
      expect(await readSession(db, owner)).toEqual(session);
      expect(
        (await readSelected(db, owner, identity.projectId, identity.siteId))?.identity
          .packageVersion,
      ).toBe(8);
      expect(await readSession(db, otherOwner)).toBeNull();
      expect((await removePackage(db, owner, identity)).reasons.sessions).toBe(1);
      await clearSession(db, owner);
      expect((await removePackage(db, owner, identity)).removed).toBe(true);
    } finally {
      sqlite.close();
      rmSync(directory, { recursive: true });
    }
  });

  it("serializes a simultaneous pin and removal so no durable session points to a removed grant", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      const [pin, removal] = await Promise.all([
        saveSession(db, owner, session),
        removePackage(db, owner, identity),
      ]);
      expect(pin).toBeUndefined();
      expect(removal.removed).toBe(false);
      await clearSession(db, owner);
      const [removed, invalidPin] = await Promise.allSettled([
        removePackage(db, owner, identity),
        saveSession(db, owner, session),
      ]);
      expect(removed).toMatchObject({ status: "fulfilled", value: { removed: true } });
      expect(invalidPin.status).toBe("rejected");
      expect(await readSession(db, owner)).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});
