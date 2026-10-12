import { expect, it, vi } from "vitest";
import { createApiClient } from "../../data/api/client";
import { readAvailableCurrent } from "../../storage/available-current";
import { databaseWrite } from "../../storage/database-write";
import { readSelected } from "../../storage/package-catalog";
import { boundFixture, ids } from "./bound-fixture";
import { deferred, harness, nextFixture, owner } from "./lifecycle.test-helper";
import { PackageOperations } from "./operations";

it("discovers the strict site snapshot through the sole v1 route", async () => {
  const h = await harness();
  try {
    const site = boundFixture().site;
    const fetch = vi.fn(async (request: Request) => {
      expect(new URL(request.url).pathname).toBe(`/v1/projects/${ids.project}/sites`);
      return new Response(JSON.stringify([site]), {
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetch);
    const api = createApiClient("https://api.example.test", async () => "synthetic-token");
    const operations = new PackageOperations({ ...h.runtime, api });
    expect(await operations.refresh(ids.project, [])).toEqual([site]);
    expect(fetch).toHaveBeenCalledOnce();
    expect(await readAvailableCurrent(h.database, owner, ids.project, ids.site)).toEqual({
      packageId: ids.package,
      packageVersion: 7,
    });
  } finally {
    vi.unstubAllGlobals();
    h.close();
  }
});

it("keeps v7 selected after a failed v8 archive request", async () => {
  const h = await harness();
  try {
    await h.operations.download(ids.project, boundFixture().site, () => {});
    const v8 = nextFixture();
    const failed = new PackageOperations({
      ...h.runtime,
      source: () => ({
        ...v8.source,
        archive: async () => {
          throw new Error("connection interrupted");
        },
      }),
    });
    await expect(failed.download(ids.project, v8.site, () => {})).rejects.toThrow(
      "connection interrupted",
    );
    expect(
      (await readSelected(h.database, owner, ids.project, ids.site))?.identity.packageVersion,
    ).toBe(7);
  } finally {
    h.close();
  }
});

it("does not persist queued current metadata after its request generation expires", async () => {
  let current = true;
  const h = await harness({ current: () => current });
  try {
    if (!h.runtime.api) throw new Error("Missing test API");
    const blockerStarted = deferred<void>();
    const release = deferred<void>();
    const blocking = databaseWrite(h.database, async () => {
      blockerStarted.resolve();
      await release.promise;
    });
    await blockerStarted.promise;
    const responded = deferred<void>();
    const operations = new PackageOperations({
      ...h.runtime,
      api: {
        ...h.runtime.api,
        sites: async () => {
          responded.resolve();
          return [nextFixture().site];
        },
      },
    });
    const refresh = operations.refresh(ids.project, []);
    await responded.promise;
    await Promise.resolve();
    current = false;
    release.resolve();
    await blocking;
    expect(await refresh).toBeNull();
    expect(await readAvailableCurrent(h.database, owner, ids.project, ids.site)).toBeNull();
  } finally {
    h.close();
  }
});

it.each([
  404,
  405,
  503,
  "network",
])("reports failed sole-path site discovery after %s", async (failure) => {
  const h = await harness();
  try {
    const fetch = vi.fn(async () => {
      if (failure === "network") throw new TypeError("network failed");
      if (typeof failure !== "number") throw new Error("Unexpected test response");
      return new Response(JSON.stringify({ detail: "Synthetic site discovery failure" }), {
        status: failure,
      });
    });
    vi.stubGlobal("fetch", fetch);
    const api = createApiClient("https://api.example.test", async () => "synthetic-token");
    const operations = new PackageOperations({ ...h.runtime, api });
    await expect(operations.refresh(ids.project, [])).rejects.toBeInstanceOf(Error);
    expect(fetch).toHaveBeenCalledOnce();
    expect(await readAvailableCurrent(h.database, owner, ids.project, ids.site)).toBeNull();
  } finally {
    vi.unstubAllGlobals();
    h.close();
  }
});
