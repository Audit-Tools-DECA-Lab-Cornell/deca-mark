import { expect, it } from "vitest";
import { installedFor } from "../../storage/package-store.fixture";
import { boundFixture, boundManifest, ids } from "./bound-fixture";
import { deferred, harness, nextFixture } from "./lifecycle.test-helper";
import { PackageOperations } from "./operations";

it("queues exact recovery behind a newer download and keeps the newest installed", async () => {
  const h = await harness();
  try {
    const newest = nextFixture();
    const older = boundFixture();
    const entered = deferred<void>();
    const release = deferred<void>();
    let downloads = 0;
    if (!h.runtime.api) throw new Error("API missing");
    const ops = new PackageOperations({
      ...h.runtime,
      api: {
        ...h.runtime.api,
        packageDetail: async () => ({ ...older.site.package, manifest: boundManifest }),
      },
      source: () => ({
        ...older.source,
        archive: async (id) => {
          downloads += 1;
          if (id === newest.site.package.package_id) {
            entered.resolve();
            await release.promise;
            return newest.bytes;
          }
          return older.bytes;
        },
      }),
    });
    const installing = ops.download(ids.project, newest.site, () => {});
    await entered.promise;
    const recovering = ops.download(ids.project, newest.site, () => {}, ids.package);
    expect(downloads).toBe(1);
    release.resolve();
    expect(await installing).toBe(true);
    expect(await recovering).toBe(true);
    expect(
      (await installedFor(h.database, h.runtime.owner, ids.project, ids.site))?.identity
        .packageVersion,
    ).toBe(8);
    expect((await ops.catalog()).map((entry) => entry.identity.packageVersion).sort()).toEqual([
      7, 8,
    ]);
  } finally {
    h.close();
  }
});

it("queues recovery of the still-current package behind its running download", async () => {
  const h = await harness();
  try {
    const f = boundFixture();
    const entered = deferred<void>();
    const release = deferred<void>();
    let calls = 0;
    const ops = new PackageOperations({
      ...h.runtime,
      source: () => ({
        ...f.source,
        archive: async () => {
          calls += 1;
          if (calls === 1) {
            entered.resolve();
            await release.promise;
          }
          return f.bytes;
        },
      }),
    });
    const installing = ops.download(ids.project, f.site, () => {});
    await entered.promise;
    const recovering = ops.download(ids.project, f.site, () => {}, ids.package);
    expect(calls).toBe(1);
    release.resolve();
    expect(await installing).toBe(true);
    expect(await recovering).toBe(true);
    expect(calls).toBe(2);
  } finally {
    h.close();
  }
});

it("does not start a queued recovery after its package runtime is disposed", async () => {
  const h = await harness();
  try {
    const f = boundFixture();
    const entered = deferred<void>();
    const release = deferred<void>();
    let calls = 0;
    const ops = new PackageOperations({
      ...h.runtime,
      source: () => ({
        ...f.source,
        archive: async () => {
          calls += 1;
          entered.resolve();
          await release.promise;
          return f.bytes;
        },
      }),
    });
    const running = ops.download(ids.project, f.site, () => {});
    await entered.promise;
    const queued = ops.download(ids.project, f.site, () => {}, ids.package);
    ops.dispose();
    release.resolve();
    expect(await running).toBe(false);
    expect(await queued).toBe(false);
    expect(calls).toBe(1);
  } finally {
    h.close();
  }
});
