// Public synthetic fixture definitions; these are not research observations.
export const password = "FieldMaps-local-only-42!";
export const roles = ["owner", "manager", "manager2", "observer", "viewer"];
export const zoneId = "72000000-0000-4000-8000-000000000001";
export const secondZoneId = "72000000-0000-4000-8000-000000000002";
export const labels = ["=Synthetic lawn v1", "Synthetic smaller lawn v2"];
export const uuid = index => `72000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

export function definition(kind) {
  return {
    version: `zone-review-${kind}-v1`, title: `Synthetic ${kind} acceptance form`, status: "draft",
    summary: "Synthetic local acceptance only.", source: "Local acceptance fixture",
    inclusion: "Not a research instrument.", questions: [{
      id: "note", code: "Note", exportColumn: "Note", act: "Record", kind: "text",
      label: "Synthetic test note", source: "Local acceptance fixture", required: true,
    }],
  };
}

const ring = (west, south, east, north) => [
  [west, south], [east, south], [east, north], [west, north], [west, south],
];
const feature = (geometry, properties) => ({ type: "Feature", geometry, properties });
const collection = features => ({ type: "FeatureCollection", features });

export function packageRequest(siteId) {
  return {
    site_id: siteId, request_id: uuid(10), expected_current_package_id: null,
    form_version: "zone-review-play-v1", inventory_form_version: "zone-review-inventory-v1",
    change_note: "Synthetic initial map; local acceptance only",
    zone_identity_map: [
      { source_feature_id: "A", zone_id: zoneId, zone_code: "A" },
      { source_feature_id: "B", zone_id: secondZoneId, zone_code: "B" },
    ],
    layers: {
      ground: collection([feature({ type: "Polygon", coordinates: [ring(-76.4865, 42.447, -76.4835, 42.449)] }, { kind: "site" })]),
      zones: collection([
        feature({ type: "Polygon", coordinates: [ring(-76.4864, 42.4478, -76.485, 42.4489),
          ring(-76.4863, 42.4479, -76.4862, 42.448)] }, { id: "A", name: labels[0] }),
        feature({ type: "MultiPolygon", coordinates: [
          [ring(-76.4849, 42.4477, -76.4845, 42.448)],
          [ring(-76.4844, 42.4482, -76.484, 42.4485)],
        ] }, { id: "B", name: "Synthetic two-part zone" }),
      ]),
    },
  };
}

export function successorZones(zones) {
  return zones.map(zone => zone.zone_id === zoneId ? {
    ...zone, zone_label: labels[1], geometry: { type: "Polygon", coordinates: [
      ring(-76.4858, 42.448, -76.4851, 42.4487),
    ] },
  } : zone);
}

export function observations(siteId, packageIds) {
  return packageIds.flatMap((packageId, versionIndex) => Array.from({ length: 260 }, (_, index) => {
    const inventory = index >= 240;
    return {
      id: uuid(1000 + versionIndex * 260 + index),
      body: {
        site_id: siteId, package_id: packageId, zone_id: zoneId,
        form_version: `zone-review-${inventory ? "inventory" : "play"}-v1`,
        round_type: inventory ? "inventory" : index >= 200 ? "reliability" : "standard",
        placement: inventory ? "zone" : "hand", observer: "ZR",
        observed_at: `2026-10-${versionIndex === 0 ? "10" : "11"}T12:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}Z`,
        answers: { note: `Synthetic map-v${versionIndex + 1} ${inventory ? "inventory" : "point"} ${index + 1}; local acceptance only` },
        ...(inventory ? {} : { first_round: index % 2 === 0,
          coordinates: [versionIndex === 0 ? -76.4860 : -76.4855, 42.4482] }),
      },
    };
  }));
}
