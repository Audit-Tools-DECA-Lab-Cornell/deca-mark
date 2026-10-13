import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { load } from "./support.mjs";

const {
	analyzeLayer,
	canUpload,
	layerFromData,
	LayerReadError,
	matchSlot,
	MAX_UPLOAD_BYTES,
	repeatedZoneIds,
	runClientChecks,
	zoneIdProblems
} = await load("lib/packages.ts");
const { previewPlan } = await load("features/packages/upload-preview.ts");

const root = new URL("../../../", import.meta.url);
const sample = name => JSON.parse(readFileSync(new URL(`qgis/fall-creek/upload-sample/${name}.geojson`, root), "utf8"));

/** A layer slot as the Upload step holds it once a file is read. */
function ready(name, data, size = 1000) {
	const file = { name: `${name}.geojson`, size };
	const collection = layerFromData(data, file.name);
	return { kind: "ready", file, collection, analysis: analyzeLayer(collection) };
}

const EMPTY = { kind: "empty" };
const slotsFrom = (layers = {}) => ({ ground: EMPTY, paths: EMPTY, trees: EMPTY, zones: EMPTY, ...layers });

const polygon = (west = -76.5, south = 42.4, size = 0.001) => ({
	type: "Polygon",
	coordinates: [
		[
			[west, south],
			[west + size, south],
			[west + size, south + size],
			[west, south + size],
			[west, south]
		]
	]
});
const feature = (properties, geometry = polygon()) => ({ type: "Feature", properties, geometry });
const collection = (...features) => ({ type: "FeatureCollection", features });

const goodSlots = () =>
	slotsFrom({
		ground: ready("ground", collection(feature({ kind: "site" }, polygon(-76.501, 42.399, 0.003)))),
		zones: ready("zones", collection(feature({ id: "A", label: "Zone A" })))
	});

const byId = (checks, id) => checks.find(check => check.id === id);

test("the Fall Creek layers QGIS exports pass every check and can be uploaded", () => {
	const slots = slotsFrom({
		ground: ready("ground", sample("ground")),
		zones: ready("zones", sample("zones")),
		trees: ready("trees", sample("trees"))
	});
	const checks = runClientChecks(slots);
	assert.deepEqual(
		checks.filter(check => check.state !== "passed"),
		[]
	);
	assert.equal(canUpload(slots, checks), true);
	assert.equal(byId(checks, "zone-ids").label, "Every zone has an id");
	assert.ok(previewPlan("Fall Creek", slots), "the chosen layers draw a plan");
});

test("files are matched to their slot by name; the project file by extension", () => {
	assert.equal(matchSlot("Ground.GeoJSON"), "ground");
	assert.equal(matchSlot("zones_v2.geojson"), "zones");
	assert.equal(matchSlot("paths.geojson"), "paths");
	assert.equal(matchSlot("tree-crowns.geojson"), "trees");
	assert.equal(matchSlot("playground.qgz"), "project");
	assert.equal(matchSlot("notes.geojson"), null);
});

test("nothing chosen blocks the upload and names the two required layers", () => {
	const checks = runClientChecks(slotsFrom());
	assert.deepEqual(
		checks.map(check => [check.id, check.state]),
		[
			["present-ground", "blocked"],
			["present-zones", "blocked"]
		]
	);
	assert.equal(canUpload(slotsFrom(), checks), false);
});

test("every zone needs an id, and the check says which zones lack one", () => {
	const zones = ready(
		"zones",
		collection(feature({ id: "A" }), feature({ label: "No id" }), feature({ id: "  " }), feature({ id: 7 }))
	);
	assert.deepEqual(zoneIdProblems(zones.collection), { missing: [2, 3], numeric: [4] });
	const checks = runClientChecks({ ...goodSlots(), zones });
	const check = byId(checks, "zone-ids");
	assert.equal(check.state, "blocked");
	assert.equal(check.label, "Every zone has an id");
	assert.match(check.detail, /Zones 2 and 3 have no id/);
	assert.match(check.detail, /Zone 4 has a number for an id; an id must be text/);
	assert.equal(canUpload({ ...goodSlots(), zones }, checks), false);
});

test("an id in the id property is trimmed text, as the API reads it", () => {
	const zones = ready("zones", collection(feature({ id: " A " }), feature({ id: "B" })));
	assert.equal(byId(runClientChecks({ ...goodSlots(), zones }), "zone-ids").state, "passed");
});

test("two zones cannot share an id", () => {
	const zones = ready("zones", collection(feature({ id: "A" }), feature({ id: "A" }), feature({ id: "B" })));
	assert.deepEqual(repeatedZoneIds(zones.collection), ["A"]);
	const check = byId(runClientChecks({ ...goodSlots(), zones }), "zone-ids-distinct");
	assert.equal(check.state, "blocked");
	assert.match(check.detail, /"A"/);
});

test("a package takes between 1 and 64 zones", () => {
	const none = ready("zones", collection());
	assert.equal(byId(runClientChecks({ ...goodSlots(), zones: none }), "zones-count").state, "blocked");
	const many = ready("zones", collection(...Array.from({ length: 65 }, (_, index) => feature({ id: `z${index}` }))));
	assert.equal(byId(runClientChecks({ ...goodSlots(), zones: many }), "zones-count").state, "blocked");
});

test("the ground needs exactly one feature with kind = site", () => {
	const none = ready("ground", collection(feature({ kind: "grass" })));
	const twice = ready("ground", collection(feature({ kind: "site" }), feature({ kind: "site" })));
	assert.equal(byId(runClientChecks({ ...goodSlots(), ground: none }), "ground-outline").state, "blocked");
	assert.match(
		byId(runClientChecks({ ...goodSlots(), ground: twice }), "ground-outline").detail,
		/2 features have kind = site/
	);
	assert.equal(byId(runClientChecks(goodSlots()), "ground-outline").state, "passed");
});

test("projected coordinates and another declared coordinate system block", () => {
	const metres = ready("ground", collection(feature({ kind: "site" }, polygon(500000, 4700000, 100))));
	const check = byId(runClientChecks({ ...goodSlots(), ground: metres }), "coordinates-ground");
	assert.equal(check.state, "blocked");
	assert.match(check.detail, /EPSG:4326/);

	const declared = layerFromData(
		{ ...collection(feature({ id: "A" })), crs: { type: "name", properties: { name: "EPSG:3857" } } },
		"zones.geojson"
	);
	const slot = {
		kind: "ready",
		file: { name: "zones.geojson", size: 10 },
		collection: declared,
		analysis: analyzeLayer(declared)
	};
	assert.match(byId(runClientChecks({ ...goodSlots(), zones: slot }), "coordinates-zones").detail, /EPSG:3857/);

	const wgs84 = layerFromData(
		{
			...collection(feature({ id: "A" })),
			crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } }
		},
		"zones.geojson"
	);
	const fine = {
		kind: "ready",
		file: { name: "zones.geojson", size: 10 },
		collection: wgs84,
		analysis: analyzeLayer(wgs84)
	};
	assert.equal(byId(runClientChecks({ ...goodSlots(), zones: fine }), "coordinates-zones").state, "passed");
});

test("MultiPolygon zones and ground are accepted; points in the zones layer are not", () => {
	const multi = { type: "MultiPolygon", coordinates: [polygon().coordinates, polygon(-76.4).coordinates] };
	const zones = ready("zones", collection(feature({ id: "A" }, multi)));
	assert.equal(byId(runClientChecks({ ...goodSlots(), zones }), "geometry-zones").state, "passed");
	const points = ready("zones", collection(feature({ id: "A" }, { type: "Point", coordinates: [-76.5, 42.4] })));
	assert.equal(byId(runClientChecks({ ...goodSlots(), zones: points }), "geometry-zones").state, "blocked");
	const noShape = ready("zones", collection({ type: "Feature", properties: { id: "A" }, geometry: null }));
	assert.match(
		byId(runClientChecks({ ...goodSlots(), zones: noShape }), "geometry-zones").detail,
		/1 feature with no shape/
	);
});

test("a zone needs a name: its name field, or its label field when it has none", () => {
	const unnamed = ready("zones", collection(feature({ id: "A" })));
	const checks = runClientChecks({ ...goodSlots(), zones: unnamed });
	assert.equal(byId(checks, "zone-labels").state, "blocked");
	assert.match(byId(checks, "zone-labels").detail, /1 zone has no name or label field/);
	assert.equal(canUpload({ ...goodSlots(), zones: unnamed }, checks), false);
	for (const properties of [
		{ id: "A", name: "Meadow" },
		{ id: "A", label: "Meadow" }
	]) {
		const zones = ready("zones", collection(feature(properties)));
		assert.equal(byId(runClientChecks({ ...goodSlots(), zones }), "zone-labels").state, "passed");
	}
});

test("zones outside the ground are a warning", () => {
	const zones = ready("zones", collection(feature({ id: "A", label: "A" }, polygon(-70, 40))));
	assert.equal(byId(runClientChecks({ ...goodSlots(), zones }), "zones-in-ground").state, "warning");
});

test("the files must fit one upload, and the project file must be under 8 MB", () => {
	const big = {
		...goodSlots(),
		zones: ready("zones", collection(feature({ id: "A", label: "A" })), MAX_UPLOAD_BYTES)
	};
	assert.equal(byId(runClientChecks(big), "size").state, "blocked");
	const project = { kind: "ready", file: { name: "site.qgz", size: 9 * 1024 * 1024 } };
	assert.match(byId(runClientChecks(goodSlots(), project), "size").detail, /over 8 MB/);
	assert.equal(byId(runClientChecks(goodSlots()), "size").state, "passed");
});

test("a file that is not a GeoJSON layer says which file and what to do", () => {
	assert.throws(
		() => layerFromData({ type: "Feature" }, "ground.geojson"),
		error => {
			assert.ok(error instanceof LayerReadError);
			assert.match(error.message, /ground\.geojson is not a GeoJSON layer/);
			return true;
		}
	);
	assert.throws(
		() => layerFromData({ type: "FeatureCollection", features: [3] }, "zones.geojson"),
		/Item 1 in zones\.geojson/
	);
});

test("a layer still being read keeps the upload off", () => {
	const slots = { ...goodSlots(), trees: { kind: "reading", file: { name: "trees.geojson", size: 5 } } };
	assert.equal(canUpload(slots, runClientChecks(slots)), false);
});
