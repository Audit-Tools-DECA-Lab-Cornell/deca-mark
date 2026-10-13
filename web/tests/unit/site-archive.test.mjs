import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { strToU8, zipSync } from "fflate";

import { load } from "./support.mjs";

const { layersPlan, PackageArchiveError, packagePlan, packageSiteCollection, readPackageArchive } =
	await load("lib/sites/archive.ts");

const root = new URL("../../../", import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));

/** Fall Creek's layers exactly as `scripts/bootstrap-study.mjs` sends them for the real study. */
function fallCreekLayers() {
	const outline = readJson("qgis/fall-creek/upload-sample/ground.geojson");
	const surfaces = readJson("mobile/src/maps/sites/fall-creek/surfaces.json");
	const equipment = readJson("mobile/src/maps/sites/fall-creek/equipment.json");
	return {
		ground: {
			type: "FeatureCollection",
			features: [
				...outline.features,
				...surfaces.features,
				...equipment.features.map(feature => ({
					...feature,
					properties: { ...feature.properties, kind: "equipment", type: feature.properties.kind }
				}))
			]
		},
		trees: readJson("mobile/src/maps/sites/fall-creek/trees.json"),
		zones: readJson("qgis/fall-creek/upload-sample/zones.geojson")
	};
}

function positions(geometry) {
	const walk = value => (typeof value[0] === "number" ? [value] : value.flatMap(walk));
	return walk(geometry.coordinates);
}

function bounds(features) {
	const all = features.flatMap(feature => positions(feature.geometry));
	return {
		west: Math.min(...all.map(([x]) => x)),
		south: Math.min(...all.map(([, y]) => y)),
		east: Math.max(...all.map(([x]) => x)),
		north: Math.max(...all.map(([, y]) => y))
	};
}

const SITE_ID = "10000000-0000-4000-8000-000000000001";
const PACKAGE_ID = "20000000-0000-4000-8000-000000000001";
const zoneUuid = n => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DIGEST = n => String(n).repeat(64).slice(0, 64);

/** A source zone's parts as the canonical MultiPolygon a package carries. */
function multi(geometry) {
	return geometry.type === "MultiPolygon" ? geometry : { type: "MultiPolygon", coordinates: [geometry.coordinates] };
}

/**
 * Turns QGIS layers into the layers of a prepared package (contract "Archive"): every zone the canonical
 * MultiPolygon with `{zone_id, zone_code, name, display_anchor, geometry_sha256}`. The anchor here is the
 * first vertex; the server's own anchor is never computed by a client.
 */
function packageLayers(layers) {
	return {
		...layers,
		zones: {
			type: "FeatureCollection",
			features: layers.zones.features.map((feature, index) => ({
				type: "Feature",
				geometry: multi(feature.geometry),
				properties: {
					zone_id: zoneUuid(index + 1),
					zone_code: feature.properties.id,
					name: feature.properties.label ?? feature.properties.id,
					display_anchor: multi(feature.geometry).coordinates[0][0][0],
					geometry_sha256: DIGEST(index + 1)
				}
			}))
		}
	};
}

/** The contract's `format: 1` manifest for prepared layers. */
function manifestFor(siteCode, layers) {
	return {
		format: 1,
		site_id: SITE_ID,
		site_code: siteCode,
		package_id: PACKAGE_ID,
		package_version: 1,
		forms: {
			play: { form_version_id: "40000000-0000-4000-8000-000000000001", form_version: "study-play-v1" },
			inventory: null
		},
		zones: layers.zones.features.map(feature => {
			const box = bounds([feature]);
			return {
				zone_id: feature.properties.zone_id,
				zone_code: feature.properties.zone_code,
				label: feature.properties.name,
				bbox: [box.west, box.south, box.east, box.north],
				display_anchor: feature.properties.display_anchor,
				geometry_sha256: feature.properties.geometry_sha256
			};
		})
	};
}

/** A zip laid out as `_build_archive` lays it out. */
function archive(manifest, layers) {
	const files = { "manifest.json": strToU8(JSON.stringify(manifest, null, 2)) };
	for (const name of ["ground", "paths", "trees", "zones"])
		if (layers[name]) files[`layers/${name}.json`] = strToU8(JSON.stringify(layers[name]));
	return zipSync(files);
}

test("reads Fall Creek's real package: ground kinds, equipment types, tree crowns and Zone A", () => {
	const layers = packageLayers(fallCreekLayers());
	const manifest = manifestFor("fall-creek", layers);
	const read = readPackageArchive(archive(manifest, layers));
	assert.equal(read.manifest.site_code, "fall-creek");
	assert.equal(read.manifest.package_version, 1);
	assert.equal(read.layers.ground.features.length, layers.ground.features.length);
	assert.equal(read.layers.paths, undefined);

	const collection = packageSiteCollection("Fall Creek", read.manifest, read.layers);
	const kinds = {};
	for (const feature of collection.features)
		kinds[feature.properties.kind] = (kinds[feature.properties.kind] ?? 0) + 1;
	assert.deepEqual(kinds, {
		site: 1,
		dirt: 1,
		path: 2,
		blacktop: 1,
		mulch: 1,
		grass: 2,
		equipment: 21,
		tree: 12,
		zone: 1
	});

	const swings = collection.features.find(feature => feature.properties.source_kind === "swings");
	assert.equal(swings.properties.kind, "equipment");
	assert.ok(collection.features.every(feature => feature.properties.id));

	const plan = packagePlan("Fall Creek", archive(manifest, layers));
	assert.equal(plan.name, "Fall Creek");
	assert.deepEqual(
		plan.zones.map(zone => [zone.id, zone.zoneId, zone.code, zone.name]),
		[[zoneUuid(1), zoneUuid(1), "A", "Zone A · Whole playground"]]
	);
	// Longitude and latitude come through untouched, and the pill sits on the package's own anchor.
	assert.equal(JSON.stringify(plan.zones[0].geometry), JSON.stringify(layers.zones.features[0].geometry));
	assert.equal(plan.features.filter(shape => shape.kind === "tree" && shape.type === "polygon").length, 12);
	assert.equal(plan.features.length, 1 + 7 + 21 + 12);
});

/** A small square ring at (x, y), closed, counter-clockwise. */
const square = (x, y, size = 0.0002) => [
	[x, y],
	[x + size, y],
	[x + size, y + size],
	[x, y + size],
	[x, y]
];

function gardenLayers() {
	return {
		ground: {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: { kind: "Sandpit", name: "Sand" },
					geometry: { type: "Polygon", coordinates: [square(-76.5, 42.45)] }
				},
				{
					type: "Feature",
					properties: { kind: "mulch" },
					geometry: {
						type: "MultiPolygon",
						coordinates: [[square(-76.4996, 42.45)], [square(-76.4993, 42.45)]]
					}
				}
			]
		},
		paths: {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: { width_m: 1.5 },
					geometry: {
						type: "LineString",
						coordinates: [
							[-76.5, 42.4505],
							[-76.499, 42.4505]
						]
					}
				}
			]
		},
		trees: {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: { radius_m: 4 },
					geometry: { type: "Point", coordinates: [-76.4995, 42.4504] }
				}
			]
		},
		zones: {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: { id: "N", label: "North beds" },
					geometry: {
						type: "MultiPolygon",
						// Two parts; the first has a hole. Full precision, 17 significant digits.
						coordinates: [
							[
								square(-76.50000000000001, 42.450600000000006, 0.0004),
								[
									[-76.49990000000001, 42.45070000000001],
									[-76.49990000000001, 42.45080000000001],
									[-76.49980000000001, 42.45080000000001],
									[-76.49980000000001, 42.45070000000001],
									[-76.49990000000001, 42.45070000000001]
								]
							],
							[square(-76.499, 42.4506)]
						]
					}
				},
				{
					type: "Feature",
					properties: { id: "S" },
					geometry: { type: "Polygon", coordinates: [square(-76.5, 42.4502)] }
				}
			]
		}
	};
}

test("a zone with parts and holes stays one zone, every ring kept, every number untouched", () => {
	const source = gardenLayers();
	const layers = packageLayers(source);
	const manifest = manifestFor("garden", layers);
	const plan = packagePlan("Garden", archive(manifest, layers));
	assert.deepEqual(
		plan.zones.map(zone => [zone.code, zone.name, zone.parts.map(rings => rings.length)]),
		[
			["N", "North beds", [2, 1]],
			["S", "S", [1]]
		]
	);
	// Projected rings drop only the closing repeat, by count.
	assert.deepEqual(
		plan.zones[0].parts.map(rings => rings.map(ring => ring.length)),
		[[4, 4], [4]]
	);
	plan.zones.forEach((zone, index) =>
		assert.equal(JSON.stringify(zone.geometry), JSON.stringify(layers.zones.features[index].geometry))
	);
	const collection = packageSiteCollection("Garden", manifest, readPackageArchive(archive(manifest, layers)).layers);
	const sand = collection.features.find(feature => feature.properties.name === "Sand");
	assert.deepEqual([sand.properties.kind, sand.properties.source_kind], ["grass", "Sandpit"]);
	assert.deepEqual(
		collection.features
			.filter(feature => feature.properties.kind === "mulch")
			.map(feature => feature.properties.id),
		["ground-2", "ground-2-2"]
	);
	const path = plan.features.find(shape => shape.type === "line");
	assert.ok(path.width > 0);
	assert.equal(plan.features.filter(shape => shape.type === "circle").length, 1);
});

test("a package whose zones disagree with its manifest is refused, never drawn as a guess", () => {
	const layers = packageLayers(gardenLayers());
	const manifest = manifestFor("garden", layers);
	const withZones = features => ({ ...layers, zones: { type: "FeatureCollection", features } });
	const [north, south] = layers.zones.features;
	const edit = (feature, change) => ({ ...feature, properties: { ...feature.properties, ...change } });
	const refused = [
		// A zone without its feature: no bounding box stands in.
		withZones([north]),
		withZones([north, edit(south, { name: "Renamed" })]),
		withZones([north, edit(south, { zone_code: "T" })]),
		withZones([north, edit(south, { geometry_sha256: DIGEST(9) })]),
		withZones([north, edit(south, { display_anchor: [south.properties.display_anchor[0], 0] })]),
		withZones([north, edit(south, { zone_id: north.properties.zone_id })]),
		// The canonical shape is a MultiPolygon; a Polygon is not quietly accepted.
		withZones([north, { ...south, geometry: { type: "Polygon", coordinates: south.geometry.coordinates[0] } }]),
		// An unclosed ring is refused, not closed.
		withZones([
			north,
			{ ...south, geometry: { type: "MultiPolygon", coordinates: [[square(-76.5, 42.4502).slice(0, 4)]] } }
		])
	];
	for (const bad of refused) assert.throws(() => packagePlan("Garden", archive(manifest, bad)), PackageArchiveError);
});

test("unreadable archives say why", () => {
	assert.throws(() => readPackageArchive(new Uint8Array([1, 2, 3])), PackageArchiveError);
	const layers = packageLayers(fallCreekLayers());
	assert.throws(
		() => readPackageArchive(zipSync({ "layers/ground.json": strToU8(JSON.stringify(layers.ground)) })),
		/no readable manifest/
	);
	assert.throws(
		() => readPackageArchive(zipSync({ "manifest.json": strToU8(JSON.stringify(manifestFor("x", layers))) })),
		/missing its ground or zones layer/
	);
	assert.throws(() => readPackageArchive(zipSync({ "manifest.json": strToU8("{") })), /could not be read/);
	// One format only: anything but the contract's format 1 manifest is not read.
	const manifest = manifestFor("fall-creek", layers);
	assert.throws(() => readPackageArchive(archive({ ...manifest, format: 2 }, layers)), /no readable manifest/);
	const { zones, ...withoutZones } = manifest;
	assert.throws(
		() =>
			readPackageArchive(
				archive({ ...withoutZones, zones: zones.map(({ zone_id, label }) => ({ id: zone_id, label })) }, layers)
			),
		/no readable manifest/
	);
});

test("chosen layers draw the plan a package would, before anything is sent", () => {
	const source = gardenLayers();
	const preview = layersPlan("Garden", source);
	const prepared = packagePlan(
		"Garden",
		archive(manifestFor("garden", packageLayers(source)), packageLayers(source))
	);
	assert.deepEqual(
		preview.zones.map(zone => [zone.id, zone.code, zone.name]),
		[
			["N", "N", "North beds"],
			["S", "S", "S"]
		]
	);
	assert.deepEqual(
		preview.zones.map(zone => zone.parts),
		prepared.zones.map(zone => zone.parts)
	);
	assert.equal(preview.features.length, prepared.features.length);
	assert.equal(layersPlan("Nothing yet", {}), null);
	// A zone without an id, or whose shape is not a readable area, is not drawn: never repaired or boxed.
	const unreadable = {
		type: "FeatureCollection",
		features: [
			{ ...source.zones.features[1], properties: { label: "No id" } },
			{
				type: "Feature",
				properties: { id: "U" },
				geometry: { type: "Polygon", coordinates: [square(-76.5, 42.4502).slice(0, 4)] }
			}
		]
	};
	assert.deepEqual(layersPlan("Garden", { ...source, zones: unreadable }).zones, []);
	assert.equal(layersPlan("Ground only", { ground: source.ground }).zones.length, 0);
});
