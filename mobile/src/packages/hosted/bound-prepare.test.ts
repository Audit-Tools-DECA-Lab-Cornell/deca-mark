import { describe, expect, it, vi } from "vitest";
import inventoryDefinition from "../../../../contracts/forms/janet-inventory-v1.json";
import { boundFixture, boundLayers, boundManifest, ids } from "./bound-fixture";
import { preparePackage } from "./prepare";

describe("Exact bound package preparation", () => {
  it("recovers a retired exact form without selecting current inventory", async () => {
    // Given a v7 archive whose frozen play definition is now retired.
    const { site, source } = boundFixture();
    // When preparing the exact historical package.
    const stored = await preparePackage(ids.project, site, source);
    // Then all exact bindings survive and inventory remains disabled.
    expect(stored.manifest).toMatchObject({ package_id: ids.package, forms: boundManifest.forms });
    expect(stored.forms.inventory).toBeNull();
  });
  it("rejects a manifest naming another package despite a valid archive digest", async () => {
    const { site, source } = boundFixture({ ...boundManifest, package_id: ids.site });
    await expect(preparePackage(ids.project, site, source)).rejects.toThrow(/identity|package/i);
  });
  it("refuses missing zone geometry rather than installing a bounding box", async () => {
    const { site, source } = boundFixture(boundManifest, {
      ...boundLayers,
      zones: { ...boundLayers.zones, features: [] },
    });
    await expect(preparePackage(ids.project, site, source)).rejects.toThrow(/zone/i);
  });
  it.each([
    { ...boundManifest, format: 2 },
    { ...boundManifest, zone_contract_version: 2 },
    { ...boundManifest, zones: boundManifest.zones.map((zone) => ({ ...zone, zone_code: "B" })) },
  ])("rejects unsupported versions or conflicting zone codes: %j", async (manifest) => {
    const { site, source } = boundFixture(manifest);
    await expect(preparePackage(ids.project, site, source)).rejects.toThrow();
  });
  it("rejects a changed zone polygon whose recorded digest still names the old geometry", async () => {
    const layers = {
      ...boundLayers,
      zones: {
        ...boundLayers.zones,
        features: boundLayers.zones.features.map((feature) => ({
          ...feature,
          geometry: {
            type: "MultiPolygon",
            coordinates: [
              [
                [
                  [0, 0],
                  [2, 0],
                  [2, 1],
                  [0, 1],
                  [0, 0],
                ],
              ],
            ],
          },
        })),
      },
    };
    const { site, source } = boundFixture(boundManifest, layers);
    await expect(preparePackage(ids.project, site, source)).rejects.toThrow(
      /digest|geometry|zone/i,
    );
  });
  it("rejects another form UUID even when its code and published definition look identical", async () => {
    const { site, source } = boundFixture();
    const wrongForm = {
      ...source,
      formVersion: async (code: string) => ({
        ...(await source.formVersion(code)),
        version_id: ids.zone,
      }),
    };
    await expect(preparePackage(ids.project, site, wrongForm)).rejects.toThrow(/form/i);
  });
  it("refuses a blocked package or incorrect archive length before readiness", async () => {
    const f = boundFixture();
    await expect(
      preparePackage(
        ids.project,
        { ...f.site, package: { ...f.site.package, state: "blocked" } },
        f.source,
      ),
    ).rejects.toThrow(/not ready/);
    await expect(
      preparePackage(
        ids.project,
        { ...f.site, package: { ...f.site.package, archive_bytes: f.bytes.byteLength + 1 } },
        f.source,
      ),
    ).rejects.toThrow(/match/);
  });
  it("loads only the exact bound inventory form and keeps its retired published snapshot", async () => {
    const inventory = { form_version_id: ids.zone, form_version: "inventory-v7" };
    const manifest = { ...boundManifest, forms: { ...boundManifest.forms, inventory } };
    const f = boundFixture(manifest);
    const site = { ...f.site, package: { ...f.site.package, forms: manifest.forms } };
    const formVersion = vi.fn(async (code: string) =>
      code === inventory.form_version
        ? {
            code,
            schema_version: 2,
            version_id: inventory.form_version_id,
            state: "retired" as const,
            form_code: "inventory",
            definition: { ...inventoryDefinition, version: code, status: "published" },
          }
        : f.source.formVersion(code),
    );
    const stored = await preparePackage(ids.project, site, { ...f.source, formVersion });
    expect(formVersion.mock.calls.map(([code]) => code)).toEqual([
      manifest.forms.play.form_version,
      inventory.form_version,
    ]);
    expect(stored.forms.inventory?.["version"]).toBe(inventory.form_version);
  });
  it("refuses a missing bound inventory definition instead of searching for another", async () => {
    const inventory = { form_version_id: ids.zone, form_version: "inventory-v7" };
    const manifest = { ...boundManifest, forms: { ...boundManifest.forms, inventory } };
    const f = boundFixture(manifest);
    const site = { ...f.site, package: { ...f.site.package, forms: manifest.forms } };
    const formVersion = vi.fn(async (code: string) => {
      if (code === inventory.form_version) throw new Error("Exact inventory unavailable");
      return f.source.formVersion(code);
    });
    await expect(preparePackage(ids.project, site, { ...f.source, formVersion })).rejects.toThrow(
      "Exact inventory unavailable",
    );
    expect(formVersion.mock.calls.map(([code]) => code)).toEqual([
      manifest.forms.play.form_version,
      inventory.form_version,
    ]);
  });
});
