import { describe, expect, it } from "vitest";
import { readAvailableCurrent, setAvailableCurrent } from "./available-current";
import { databaseWrite } from "./database-write";
import { entry, identity, memoryDatabase, owner } from "./package-store.fixture";

describe("Available package refresh fencing", () => {
  it("rejects a cancelled refresh waiting behind queued SQLite work", async () => {
    const { db, sqlite } = await memoryDatabase();
    const gate = Promise.withResolvers<void>();
    let current = true;
    try {
      const original = { packageId: identity.packageId, packageVersion: identity.packageVersion };
      await setAvailableCurrent(db, owner, identity.projectId, identity.siteId, original);
      const blocking = databaseWrite(db, () => gate.promise);
      const refresh = setAvailableCurrent(
        db,
        owner,
        identity.projectId,
        identity.siteId,
        { packageId: "30000000-0000-4000-8000-000000000002", packageVersion: 8 },
        () => current,
      );
      current = false;
      gate.resolve();
      await blocking;
      await expect(refresh).rejects.toThrow(/cancelled/);
      expect(await readAvailableCurrent(db, owner, identity.projectId, identity.siteId)).toEqual(
        original,
      );
    } finally {
      gate.resolve();
      sqlite.close();
    }
  });

  it("rolls back metadata when cancellation arrives during its SQLite write", async () => {
    const { db, sqlite } = await memoryDatabase();
    let current = true;
    try {
      const original = { packageId: identity.packageId, packageVersion: identity.packageVersion };
      await setAvailableCurrent(db, owner, identity.projectId, identity.siteId, original);
      const interrupted = {
        ...db,
        async runAsync(sql: string, ...parameters: (string | number)[]) {
          const result = await db.runAsync(sql, ...parameters);
          current = false;
          return result;
        },
      };
      await expect(
        setAvailableCurrent(
          interrupted,
          owner,
          entry.identity.projectId,
          identity.siteId,
          null,
          () => current,
        ),
      ).rejects.toThrow(/cancelled/);
      expect(await readAvailableCurrent(db, owner, identity.projectId, identity.siteId)).toEqual(
        original,
      );
    } finally {
      sqlite.close();
    }
  });
});
