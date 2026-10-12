import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import playDefinition from "../../../../contracts/forms/janet-test-v1.json";
import type { BoundManifest } from "./bound-manifest";
import type { PackageSource } from "./prepare";
import type { HostedSite } from "./schemas";

export const ids = {
  project: "10000000-0000-4000-8000-000000000011",
  site: "20000000-0000-4000-8000-000000000022",
  package: "30000000-0000-4000-8000-000000000033",
  zone: "40000000-0000-4000-8000-000000000044",
  form: "50000000-0000-4000-8000-000000000055",
} as const;
const geometry = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  ],
};
const geometryDigest = createHash("sha256")
  .update(JSON.stringify({ coordinates: geometry.coordinates, type: geometry.type }))
  .digest("hex");
export const boundManifest = {
  format: 1,
  site_code: "synthetic",
  site_id: ids.site,
  package_id: ids.package,
  package_version: 7,
  forms: { play: { form_version_id: ids.form, form_version: "play-v7" }, inventory: null },
  zones: [
    {
      zone_id: ids.zone,
      zone_code: "A",
      label: "Old meadow",
      bbox: [0, 0, 1, 1],
      display_anchor: [0.5, 0.5],
      geometry_sha256: geometryDigest,
    },
  ],
} satisfies BoundManifest;
export const boundLayers = {
  ground: {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { kind: "site" }, geometry }],
  },
  zones: {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          zone_id: ids.zone,
          zone_code: "A",
          name: "Old meadow",
          display_anchor: [0.5, 0.5],
          geometry_sha256: geometryDigest,
        },
        geometry,
      },
    ],
  },
};
export function boundFixture(manifest: unknown = boundManifest, layers = boundLayers) {
  const bytes = zipSync(
    Object.fromEntries(
      Object.entries({
        "manifest.json": manifest,
        "layers/ground.json": layers.ground,
        "layers/zones.json": layers.zones,
      }).map(([name, value]) => [name, strToU8(JSON.stringify(value))]),
    ),
  );
  const sha256 = async (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
  const site = {
    site_id: ids.site,
    code: "synthetic",
    name: "Synthetic playground",
    description: null,
    created_at: "2026-10-11T10:00:00Z",
    current_package_id: ids.package,
    extent: { west: 0, south: 0, east: 1, north: 1 },
    centre: [0.5, 0.5],
    zone_editing_available: false,
    package: {
      package_id: ids.package,
      site_id: ids.site,
      package_version: 7,
      state: "ready",
      forms: boundManifest.forms,
      zone_count: 1,
      change_note: "Synthetic",
      published_by: ids.form,
      source: "draft",
      archive_bytes: bytes.byteLength,
      archive_sha256: createHash("sha256").update(bytes).digest("hex"),
      prepared_at: "2026-10-11T10:00:00Z",
    },
    zones: boundManifest.zones,
    observation_count: 0,
  } satisfies HostedSite;
  const source: PackageSource = {
    archive: async () => bytes,
    sha256,
    formVersion: async (code) => ({
      code,
      version_id: ids.form,
      state: "retired",
      form_code: "play",
      definition: { ...playDefinition, version: code, status: "published" },
    }),
  };
  return { bytes, site, source };
}
