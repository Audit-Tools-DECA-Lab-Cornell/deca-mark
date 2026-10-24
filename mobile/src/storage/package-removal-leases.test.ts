import { describe, expect, it } from "vitest";
import { databaseWrite } from "./database-write";
import { installPackage, readCatalog, removePackage } from "./package-catalog";
import { entry, identity, memoryDatabase, owner } from "./package-store.fixture";

describe("Foreground package lease removal safety", () => {
  it("refuses a foreground collector lease, which is held in memory and never stored", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      expect(await removePackage(db, owner, identity, () => true)).toMatchObject({
        removed: false,
        reasons: { sessions: 1 },
      });
      expect(await readCatalog(db, owner, identity)).toEqual(entry);
    } finally {
      sqlite.close();
    }
  });

  it("restores the authorization when a lease appears after the removal statement", async () => {
    const { db, sqlite } = await memoryDatabase();
    let leased = false;
    try {
      await installPackage(db, owner, entry);
      const interrupted = {
        ...db,
        async runAsync(sql: string, ...parameters: (string | number)[]) {
          const result = await db.runAsync(sql, ...parameters);
          if (sql.startsWith("DELETE FROM package_authorizations")) leased = true;
          return result;
        },
      };
      expect(await removePackage(interrupted, owner, identity, () => leased)).toMatchObject({
        removed: false,
        reasons: { sessions: 1 },
      });
      expect(await readCatalog(db, owner, identity)).toEqual(entry);
    } finally {
      sqlite.close();
    }
  });

  it("rejects a removal cancelled while queued, retaining the authorization", async () => {
    const { db, sqlite } = await memoryDatabase();
    const gate = Promise.withResolvers<void>();
    let current = true;
    try {
      await installPackage(db, owner, entry);
      const queued = databaseWrite(db, () => gate.promise);
      const removing = removePackage(
        db,
        owner,
        identity,
        () => false,
        () => current,
      );
      current = false;
      gate.resolve();
      await queued;
      await expect(removing).rejects.toThrow(/cancelled/);
      expect(await readCatalog(db, owner, identity)).toEqual(entry);
    } finally {
      gate.resolve();
      sqlite.close();
    }
  });
});
