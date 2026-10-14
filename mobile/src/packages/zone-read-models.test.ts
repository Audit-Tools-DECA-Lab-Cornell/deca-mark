import { expect, it } from "vitest";
import { ApiError, readApiError } from "../data/api/errors";
import { saveDraft } from "../storage/draft-store";
import { commitObservation } from "../storage/observation-store";
import { boundDraft, boundRecord } from "../storage/package-store.fixture";
import { parkDraft } from "../storage/parked-drafts";
import { boundFixture, ids } from "./hosted/bound-fixture";
import { discoveryProblem } from "./hosted/discovery-state";
import { harness, nextFixture, owner } from "./hosted/lifecycle.test-helper";
import { emptyReferences, siteVersionSnapshot } from "./site-version-snapshot";
import { createZoneReadModelFake } from "./zone-read-model-fake";

it.each([
  404, 401, 503,
])("classifies HTTP %s without replacing the cached map list", async (status) => {
  const error = await readApiError(
    new Response(
      JSON.stringify({
        error: {
          code:
            status === 404 ? "not_found" : status === 401 ? "token_invalid" : "storage_unavailable",
          message: "Synthetic",
          details: {},
        },
      }),
      { status },
    ),
  );
  expect(discoveryProblem(error)).toBe(
    status === 404 ? "no_access" : status === 401 ? "signed_out" : "server",
  );
});
it("classifies a transport failure as offline", () => {
  expect(discoveryProblem(new ApiError("unknown", "retry"))).toBe("offline");
});
it("reports newest installed separately from available using the real catalog", async () => {
  const h = await harness();
  try {
    const fixture = boundFixture();
    await h.operations.download(ids.project, fixture.site, () => {});
    const installed = await h.operations.catalog();
    const value = {
      ...defaultHosted(),
      sites: { [ids.project]: [nextFixture().site] },
      installed,
      signedIn: true,
      allowedProjects: null,
      checked: { [ids.project]: "2026-10-13T12:00:00.000Z" },
    };
    const model = siteVersionSnapshot(value, ids.site);
    expect(model.available?.version).toBe(8);
    expect(model.nextSessionPackageId).toBe(ids.package);
    expect(model.installed[0]).toMatchObject({
      version: 7,
      status: "verified",
      bytes: fixture.bytes.byteLength,
    });
    expect(model.lastCheckedAt).toBe("2026-10-13T12:00:00.000Z");
    const fake = createZoneReadModelFake({ owner, sites: { [ids.site]: model } });
    fake.setOwner("another-account");
    expect(fake.getSiteVersions(ids.site)).toBeNull();
  } finally {
    h.close();
  }
});
function defaultHosted() {
  // The context's public shape supplies only inert actions for this pure projection test.
  return {
    sites: {},
    errors: {},
    downloads: {},
    installed: [],
    revision: 0,
    signedIn: false,
    allowedProjects: null,
    checked: {},
    problems: {},
    refresh: async () => {},
    download: async () => {},
    cancel: () => {},
    remove: () => {},
    removeVersion: async () => ({
      removed: false,
      reasons: { sessions: 0, drafts: 0, records: 0 },
      contentRetained: true as const,
    }),
  };
}
it("retains saved and parked references in the version read model", async () => {
  const h = await harness();
  try {
    await h.operations.download(ids.project, boundFixture().site, () => {});
    const installed = (await h.operations.catalog())[0];
    if (!installed) throw new Error("Catalog missing");
    const binding = {
      ...installed.identity,
      zoneId: ids.zone,
      zoneCode: "A",
      zoneLabel: "Old meadow",
    };
    const context = {
      ...boundDraft.context,
      packageId: ids.package,
      packageVersion: "v7",
      zoneLabel: "Old meadow",
    };
    const draft = {
      ...boundDraft,
      owner,
      packageId: ids.package,
      siteId: ids.site,
      binding,
      context,
    };
    await saveDraft(h.database, owner, draft);
    await parkDraft(h.database, owner, draft.id);
    await commitObservation(
      h.database,
      { ...boundRecord, projectId: ids.project, siteId: ids.site, binding, context },
      owner,
    );
    expect((await h.operations.catalog())[0]?.counts).toEqual({
      ...emptyReferences,
      unfinished: 1,
      unsent: 1,
    });
    expect(await h.operations.remove(installed.identity)).toMatchObject({
      removed: false,
      reasons: { drafts: 1, records: 1 },
    });
  } finally {
    h.close();
  }
});
