import { describe, expect, it } from "vitest";
import { identityKey } from "../domain/package-binding";
import { readAvailableCurrent, setAvailableCurrent } from "./available-current";
import { databaseWrite } from "./database-write";
import { installPackage, listCatalog, readCatalog, removePackage } from "./package-catalog";
import { entry, identity, memoryDatabase, otherOwner, owner } from "./package-store.fixture";

const versions = async (db: Parameters<typeof listCatalog>[0]) =>
  (await listCatalog(db, owner)).map((value) => value.identity.packageVersion);

describe("Verified package catalog and authorization", () => {
  it("keeps an installed v7 when discovery announces v8 and a v8 install fails", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      const available = { packageId: "30000000-0000-4000-8000-000000000002", packageVersion: 8 };
      await setAvailableCurrent(db, owner, identity.projectId, identity.siteId, available);
      expect(await readAvailableCurrent(db, owner, identity.projectId, identity.siteId)).toEqual(
        available,
      );
      expect(await versions(db)).toEqual([7]);
      sqlite.exec(
        "CREATE TRIGGER fail_grant BEFORE INSERT ON package_authorizations BEGIN SELECT RAISE(ABORT, 'quota failure'); END;",
      );
      await expect(
        installPackage(db, owner, {
          ...entry,
          identity: { ...identity, ...available, packageSha256: "b".repeat(64) },
        }),
      ).rejects.toThrow("quota failure");
      expect(await versions(db)).toEqual([7]);
      expect(await listCatalog(db, owner)).toHaveLength(1);
      expect(sqlite.prepare("SELECT COUNT(*) total FROM package_contents").get()).toEqual({
        total: 1,
      });
    } finally {
      sqlite.close();
    }
  });

  it("does not treat shared content or its UUID as another account's authorization", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      expect(await readCatalog(db, otherOwner, identity)).toBeNull();
      await installPackage(db, otherOwner, entry);
      expect(sqlite.prepare("SELECT COUNT(*) total FROM package_contents").get()).toEqual({
        total: 1,
      });
      expect((await removePackage(db, owner, identity)).removed).toBe(true);
      expect(await readCatalog(db, owner, identity)).toBeNull();
      expect(await readCatalog(db, otherOwner, identity)).toEqual(entry);
      expect(sqlite.prepare("SELECT content_key FROM package_contents").get()).toEqual({
        content_key: identityKey(identity),
      });
    } finally {
      sqlite.close();
    }
  });

  it("rejects changes to an immutable archive identity while allowing a verified file repair", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await expect(
        installPackage(db, owner, {
          ...entry,
          identity: { ...identity, packageSha256: "b".repeat(64) },
        }),
      ).rejects.toThrow(/different content/);
      await expect(
        installPackage(db, owner, { ...entry, identity: { ...identity, packageVersion: 9 } }),
      ).rejects.toThrow(/different content/);
      const repaired = {
        ...entry,
        contentPath: "repaired/verified.json",
        metadata: { ...entry.metadata, repaired: true },
      };
      await installPackage(db, owner, repaired);
      expect(await readCatalog(db, owner, identity)).toEqual(repaired);
      expect(await versions(db)).toEqual([7]);
    } finally {
      sqlite.close();
    }
  });

  it("rejects an issuer mismatch before authorizing package content", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      const wrongIssuer = {
        ...entry,
        identity: { ...identity, issuer: "https://other.synthetic.invalid/auth/v1" },
      };
      expect(() => installPackage(db, owner, wrongIssuer)).toThrow(/not installed/);
      expect(await listCatalog(db, owner)).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("rejects a stale account completion waiting behind another SQLite operation", async () => {
    const { db, sqlite } = await memoryDatabase();
    const gate = Promise.withResolvers<void>();
    let current = true;
    try {
      await installPackage(db, owner, entry);
      const queued = databaseWrite(db, () => gate.promise);
      const next = {
        ...entry,
        identity: {
          ...identity,
          packageId: "30000000-0000-4000-8000-000000000002",
          packageVersion: 8,
          packageSha256: "b".repeat(64),
        },
      };
      const install = installPackage(db, owner, next, () => current);
      current = false;
      gate.resolve();
      await queued;
      await expect(install).rejects.toThrow(/cancelled/);
      expect(await listCatalog(db, owner)).toEqual([entry]);
    } finally {
      gate.resolve();
      sqlite.close();
    }
  });

  it("keeps v8 installed when the exact historical v7 is re-downloaded for recovery", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
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
      await installPackage(db, owner, entry);
      expect(await versions(db)).toEqual([7, 8]);
      expect(await readCatalog(db, owner, identity)).toEqual(entry);
    } finally {
      sqlite.close();
    }
  });
});
