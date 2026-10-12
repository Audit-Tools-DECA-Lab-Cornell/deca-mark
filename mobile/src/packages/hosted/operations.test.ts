import { expect, it } from "vitest";
import { readAvailableCurrent } from "../../storage/available-current";
import { readCatalog, readSelected } from "../../storage/package-catalog";
import { clearSession, saveSession } from "../../storage/session-store";
import { hasStoredPackage, setActivePackage, setPackageAccessOwner } from "./access";
import { boundFixture, ids } from "./bound-fixture";
import { packageIdentity, readInstalledPackage } from "./installation";
import {
  deferred,
  harness,
  hash,
  issuer,
  nextFixture,
  nextId,
  otherOwner,
  owner,
} from "./lifecycle.test-helper";
import { PackageOperations } from "./operations";

it("retains an active foreground package before its first draft is written", async () => {
  const h = await harness();
  try {
    setPackageAccessOwner(owner);
    await h.operations.download(ids.project, boundFixture().site, () => {});
    const installed = await readSelected(h.database, owner, ids.project, ids.site);
    if (!installed) throw new Error("Installation missing");
    setActivePackage(owner, installed.identity);
    expect(await h.operations.remove(installed.identity)).toMatchObject({
      removed: false,
      contentRetained: true,
    });
    expect(await readCatalog(h.database, owner, installed.identity)).not.toBeNull();
    setActivePackage(owner, null);
    expect(await h.operations.remove(installed.identity)).toMatchObject({
      removed: true,
      contentRetained: true,
    });
  } finally {
    setPackageAccessOwner(null);
    h.close();
  }
});

it("refreshes available v8 while keeping the verified v7 selection and offline cache", async () => {
  const h = await harness();
  try {
    setPackageAccessOwner(owner);
    const v7 = boundFixture();
    await h.operations.download(ids.project, v7.site, () => {});
    const v8 = nextFixture();
    if (!h.runtime.api) throw new Error("Missing test API");
    const refresh = new PackageOperations({
      ...h.runtime,
      api: { ...h.runtime.api, sites: async () => [v8.site] },
    });
    expect(await refresh.refresh(ids.project, [v7.site])).toEqual([v8.site]);
    expect(await readAvailableCurrent(h.database, owner, ids.project, ids.site)).toEqual({
      packageId: nextId,
      packageVersion: 8,
    });
    expect(
      (await readSelected(h.database, owner, ids.project, ids.site))?.identity.packageVersion,
    ).toBe(7);
    expect(hasStoredPackage(ids.package)).toBe(true);
  } finally {
    setPackageAccessOwner(null);
    h.close();
  }
});

it("cancels an in-flight v8 download without changing installed v7", async () => {
  const h = await harness();
  try {
    setPackageAccessOwner(owner);
    await h.operations.download(ids.project, boundFixture().site, () => {});
    const v8 = nextFixture();
    const started = deferred<void>();
    const archive = deferred<Uint8Array>();
    const operation = new PackageOperations({
      ...h.runtime,
      source: () => ({
        ...v8.source,
        archive: () => {
          started.resolve();
          return archive.promise;
        },
      }),
    });
    const pending = operation.download(ids.project, v8.site, () => {});
    await started.promise;
    operation.cancel(ids.site);
    archive.resolve(v8.bytes);
    expect(await pending).toBe(false);
    expect(
      (await readSelected(h.database, owner, ids.project, ids.site))?.identity.packageVersion,
    ).toBe(7);
    expect(
      await readCatalog(h.database, owner, {
        issuer,
        projectId: ids.project,
        siteId: ids.site,
        packageId: nextId,
        packageVersion: 8,
        packageSha256: v8.site.package.archive_sha256,
      }),
    ).toBeNull();
    expect(hasStoredPackage(nextId)).toBe(false);
    expect(h.files.staged()).toEqual([]);
  } finally {
    setPackageAccessOwner(null);
    h.close();
  }
});

it("rejects the old A request after A to B to A even when its archive ignores cancellation", async () => {
  let epoch = 1;
  const h = await harness({ current: () => epoch === 1 });
  try {
    const f = boundFixture();
    const started = deferred<void>();
    const archive = deferred<Uint8Array>();
    const stale = new PackageOperations({
      ...h.runtime,
      source: () => ({
        ...f.source,
        archive: () => {
          started.resolve();
          return archive.promise;
        },
      }),
    });
    setPackageAccessOwner(owner);
    const pending = stale.download(ids.project, f.site, () => {});
    await started.promise;
    epoch = 2;
    setPackageAccessOwner(otherOwner);
    epoch = 3;
    setPackageAccessOwner(owner);
    archive.resolve(f.bytes);
    expect(await pending).toBe(false);
    expect(await readSelected(h.database, owner, ids.project, ids.site)).toBeNull();
    expect(await readSelected(h.database, otherOwner, ids.project, ids.site)).toBeNull();
    expect(hasStoredPackage(ids.package)).toBe(false);
  } finally {
    setPackageAccessOwner(null);
    h.close();
  }
});

it("repairs an exact corrupt package while retaining a durable session reference", async () => {
  const h = await harness();
  try {
    setPackageAccessOwner(owner);
    const f = boundFixture();
    await h.operations.download(ids.project, f.site, () => {});
    const old = await readSelected(h.database, owner, ids.project, ids.site);
    if (!old) throw new Error("Installation missing");
    await saveSession(h.database, owner, {
      identity: old.identity,
      zoneCode: "A",
      zoneId: ids.zone,
      roundType: "standard",
      freshPeriod: false,
      playFormVersion: "play-v7",
      inventoryFormVersion: null,
      context: {
        packageId: ids.package,
        packageVersion: "v7",
        zoneId: "A",
        zoneLabel: "Old meadow",
        roundType: "standard",
        freshPeriod: false,
        inheritedFrom: "",
      },
    });
    h.files.stage(old.contentPath, "corrupt");
    expect(await h.operations.catalog()).toMatchObject([
      { status: "needs_redownload", references: { sessions: 1 } },
    ]);
    expect(hasStoredPackage(ids.package)).toBe(false);
    expect(await h.operations.remove(old.identity)).toMatchObject({
      removed: false,
      reasons: { sessions: 1 },
      contentRetained: true,
    });
    await h.operations.download(ids.project, f.site, () => {}, ids.package);
    const repaired = await readCatalog(h.database, owner, old.identity);
    expect(repaired?.contentPath).not.toBe(old.contentPath);
    expect(h.files.read(old.contentPath)).toBe("corrupt");
    const loaded = await readInstalledPackage(h.database, owner, old.identity, h.files, hash);
    if (!loaded) throw new Error("Repaired installation missing");
    expect(packageIdentity(issuer, loaded)).toEqual(old.identity);
    expect(await h.operations.catalog()).toMatchObject([
      { status: "verified", references: { sessions: 1 } },
    ]);
    await clearSession(h.database, owner);
    expect(await h.operations.remove(old.identity)).toMatchObject({
      removed: true,
      contentRetained: true,
    });
    if (!repaired) throw new Error("Repair catalog missing");
    expect(h.files.read(repaired.contentPath)).not.toBeNull();
  } finally {
    setPackageAccessOwner(null);
    h.close();
  }
});
