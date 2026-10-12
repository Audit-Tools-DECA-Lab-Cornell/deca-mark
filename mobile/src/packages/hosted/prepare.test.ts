import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { pointInZone, zoneBounds, zoneFeature } from "../../maps/geometry";
import { readArchive } from "./archive";
import { boundFixture, boundLayers, boundManifest, ids } from "./bound-fixture";
import { hostedSitePackage } from "./build";
import { packageIdentity } from "./installation";
import { preparePackage, storedForms } from "./prepare";

const hash = (geometry: unknown) =>
  createHash("sha256").update(JSON.stringify(geometry)).digest("hex");
describe("Strict zone-aware archive", () => {
  it("reads the sole manifest and layer paths", () => {
    const f = boundFixture();
    const read = readArchive(f.bytes);
    expect(read.manifest).toEqual(boundManifest);
    expect(read.layers.zones.features).toHaveLength(1);
  });
  it("rejects missing zone layers and non-ZIP input", () => {
    const bytes = zipSync({
      "manifest.json": strToU8(JSON.stringify(boundManifest)),
      "layers/ground.json": strToU8(JSON.stringify(boundLayers.ground)),
    });
    expect(() => readArchive(bytes)).toThrow(/ground or zones/);
    expect(() => readArchive(strToU8("not zip"))).toThrow(/not a readable archive/);
  });
  it("refuses corrupt archive bytes and an unavailable package", async () => {
    const f = boundFixture();
    await expect(
      preparePackage(ids.project, f.site, {
        ...f.source,
        archive: async () => strToU8("tampered"),
      }),
    ).rejects.toThrow(/match/);
    await expect(
      preparePackage(ids.project, { ...f.site, package: null, current_package_id: null }, f.source),
    ).rejects.toThrow(/no map package/);
  });
  it("requires the exact published form snapshot and refuses drafts", async () => {
    const f = boundFixture();
    await expect(
      preparePackage(ids.project, f.site, {
        ...f.source,
        formVersion: async (code) => ({ ...(await f.source.formVersion(code)), state: "draft" }),
      }),
    ).rejects.toThrow(/form/);
  });
});
describe("Full package shape on the collector map", () => {
  it("uses the server zone UUID and display anchor without a bounding-box fallback", async () => {
    const f = boundFixture();
    const stored = await preparePackage(ids.project, f.site, f.source);
    const built = hostedSitePackage(
      stored,
      storedForms(stored),
      packageIdentity("https://auth.example.test", stored),
    );
    expect(built.siteId).toBe(ids.site);
    expect(built.projectId).toBe(ids.project);
    expect(built.zones[0]).toMatchObject({
      id: "A",
      zoneId: ids.zone,
      displayAnchor: [0.5, 0.5],
      centre: [0.5, 0.5],
    });
    expect(built.inventoryFormVersion).toBe("");
    expect(built.aerialAvailable).toBe(false);
    expect(built.layers.map((layer) => layer.id)).toEqual(["zones"]);
  });
  it("keeps multipart geometry and holes while copying the published anchor", async () => {
    const geometry = {
      coordinates: [
        [
          [
            [0, 0],
            [0.4, 0],
            [0.4, 1],
            [0, 1],
            [0, 0],
          ],
          [
            [0.1, 0.2],
            [0.3, 0.2],
            [0.3, 0.4],
            [0.1, 0.4],
            [0.1, 0.2],
          ],
        ],
        [
          [
            [0.6, 0],
            [1, 0],
            [1, 1],
            [0.6, 1],
            [0.6, 0],
          ],
        ],
      ],
      type: "MultiPolygon",
    };
    const digest = hash(geometry);
    const anchor = [0.2, 0.6];
    const manifest = {
      ...boundManifest,
      zones: boundManifest.zones.map((zone) => ({
        ...zone,
        display_anchor: anchor,
        geometry_sha256: digest,
      })),
    };
    const layers = {
      ...boundLayers,
      zones: {
        ...boundLayers.zones,
        features: boundLayers.zones.features.map((feature) => ({
          ...feature,
          geometry,
          properties: { ...feature.properties, display_anchor: anchor, geometry_sha256: digest },
        })),
      },
    };
    const f = boundFixture(manifest, layers);
    const stored = await preparePackage(ids.project, f.site, f.source);
    const zone = hostedSitePackage(stored, storedForms(stored)).zones[0];
    if (!zone) throw new Error("Zone missing");
    expect(pointInZone([0.05, 0.5], zone)).toBe(true);
    expect(pointInZone([0.8, 0.5], zone)).toBe(true);
    expect(pointInZone([0.5, 0.5], zone)).toBe(false);
    expect(pointInZone([0.2, 0.3], zone)).toBe(false);
    expect(zone.centre).toEqual(anchor);
    expect(zoneFeature(zone).geometry.type).toBe("MultiPolygon");
    expect(zoneBounds(zone)).toEqual([0, 0, 1, 1]);
  });
});
