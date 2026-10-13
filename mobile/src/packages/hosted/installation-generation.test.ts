import { expect, it } from "vitest";
import { databaseWrite } from "../../storage/database-write";
import { readSelected } from "../../storage/package-catalog";
import { hasStoredPackage, setPackageAccessOwner } from "./access";
import { boundFixture, ids } from "./bound-fixture";
import { deferred, harness, otherOwner, owner } from "./lifecycle.test-helper";
import { PackageOperations } from "./operations";

it("rolls back a stale account install queued after immutable file publication", async () => {
  let epoch = 1;
  const h = await harness({ current: () => epoch === 1 });
  const release = deferred<void>();
  let published: string | null = null;
  try {
    const queued = deferred<void>();
    const operations = new PackageOperations({
      ...h.runtime,
      files: {
        ...h.files,
        publish(staged, destination) {
          h.files.publish(staged, destination);
          published = destination;
          void databaseWrite(h.database, async () => {
            await release.promise;
          });
          queued.resolve();
        },
      },
    });
    setPackageAccessOwner(owner);
    const pending = operations.download(ids.project, boundFixture().site, () => {});
    await queued.promise;
    epoch = 2;
    setPackageAccessOwner(otherOwner);
    epoch = 3;
    setPackageAccessOwner(owner);
    release.resolve();
    expect(await pending).toBe(false);
    expect(await readSelected(h.database, owner, ids.project, ids.site)).toBeNull();
    expect(hasStoredPackage(ids.package)).toBe(false);
    expect(h.files.staged()).toEqual([]);
    if (!published) throw new Error("File publication did not run");
    expect(h.files.read(published)).not.toBeNull();
  } finally {
    release.resolve();
    setPackageAccessOwner(null);
    h.close();
  }
});
