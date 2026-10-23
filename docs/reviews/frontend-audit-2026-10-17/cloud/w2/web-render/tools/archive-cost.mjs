// CPU cost of one getSitePlan() on the server: unzip + JSON.parse + zod + projection. Real modules, synthetic data.
import { readFileSync } from "node:fs";
import { strToU8, zipSync } from "fflate";
const REPO = "/home/user/deca-mark/";
const { load } = await import(REPO + "web/tests/unit/support.mjs");
const { readPackageArchive, packageSiteCollection } = await load("lib/sites/archive.ts");
const { projectSite } = await load("lib/plan.ts");
const readJson = p => JSON.parse(readFileSync(REPO + p, "utf8"));
const SITE_ID = "10000000-0000-4000-8000-000000000001", PACKAGE_ID = "20000000-0000-4000-8000-000000000001";
const zoneUuid = n => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const multi = g => (g.type === "MultiPolygon" ? g : { type: "MultiPolygon", coordinates: [g.coordinates] });
const walk = v => (typeof v[0] === "number" ? [v] : v.flatMap(walk));
function build(scale) {
  const outline = readJson("qgis/fall-creek/upload-sample/ground.geojson");
  const surfaces = readJson("mobile/src/maps/sites/fall-creek/surfaces.json");
  const equipment = readJson("mobile/src/maps/sites/fall-creek/equipment.json");
  const trees = readJson("mobile/src/maps/sites/fall-creek/trees.json");
  const zonesSrc = readJson("qgis/fall-creek/upload-sample/zones.geojson");
  const rep = (feats, n) => Array.from({ length: n }, () => feats).flat();
  const ground = [...outline.features, ...rep(surfaces.features, scale), ...rep(equipment.features.map(f => ({ ...f, properties: { ...f.properties, kind: "equipment", type: f.properties.kind } })), scale)];
  const layers = {
    ground: { type: "FeatureCollection", features: ground },
    trees: { type: "FeatureCollection", features: rep(trees.features, scale) },
    zones: { type: "FeatureCollection", features: zonesSrc.features.map((f, i) => ({ type: "Feature", geometry: multi(f.geometry), properties: { zone_id: zoneUuid(i + 1), zone_code: f.properties.id, name: f.properties.label ?? f.properties.id, display_anchor: multi(f.geometry).coordinates[0][0][0], geometry_sha256: String(i + 1).repeat(64).slice(0, 64) } })) }
  };
  const manifest = { format: 1, site_id: SITE_ID, site_code: "fall-creek", package_id: PACKAGE_ID, package_version: 1,
    forms: { play: { form_version_id: "40000000-0000-4000-8000-000000000001", form_version: "study-play-v1" }, inventory: null },
    zones: layers.zones.features.map(f => { const all = walk(f.geometry.coordinates); const xs = all.map(p => p[0]), ys = all.map(p => p[1]); return { zone_id: f.properties.zone_id, zone_code: f.properties.zone_code, label: f.properties.name, bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], display_anchor: f.properties.display_anchor, geometry_sha256: f.properties.geometry_sha256 }; }) };
  const files = { "manifest.json": strToU8(JSON.stringify(manifest)) };
  for (const n of ["ground", "trees", "zones"]) files[`layers/${n}.json`] = strToU8(JSON.stringify(layers[n]));
  return { bytes: zipSync(files), features: ground.length + layers.trees.features.length };
}
function once(bytes) {
  const t0 = performance.now();
  const { manifest, layers } = readPackageArchive(bytes);
  const t1 = performance.now();
  const plan = projectSite(packageSiteCollection("Fall Creek", manifest, layers));
  const t2 = performance.now();
  return { read: t1 - t0, project: t2 - t1, ok: !!plan };
}
const med = a => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const scale of [1, 10, 100, 500, 1500]) {
  const { bytes, features } = build(scale);
  const runs = Array.from({ length: scale >= 500 ? 5 : 15 }, () => once(bytes));
  console.log(`scale ${scale}: features(ground+trees) ${features}, archive ${(bytes.length / 1024).toFixed(1)} KiB, read(unzip+parse+zod) ${med(runs.map(r => r.read)).toFixed(1)} ms, project ${med(runs.map(r => r.project)).toFixed(1)} ms`);
}
