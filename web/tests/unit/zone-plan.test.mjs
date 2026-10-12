import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { load } from "./support.mjs";

const plan = await load("lib/plan.ts");
const { readZoneGeometry } = await load("lib/zones/geometry.ts");

const cases = JSON.parse(readFileSync(new URL("../../../contracts/zones/geometry.cases.json", import.meta.url), "utf8"));

/** A site of one zone around a fixture shape, as `parseSite` reads it. */
function siteWith(geometry, name = "Fixture") {
	return {
		type: "FeatureCollection",
		name,
		features: [{ type: "Feature", properties: { kind: "zone", id: "z", code: "Z", name: "Zone" }, geometry }]
	};
}

const validCases = cases.structure_cases.filter(entry => entry.draft_valid);

test("every structurally valid fixture shape is one zone with every part and hole, numbers untouched", () => {
	for (const { geometry: alias } of validCases) {
		const geometry = cases.geometries[alias];
		const site = plan.projectSite(plan.parseSite(siteWith(geometry)));
		assert.equal(site.zones.length, 1, alias);
		const [zone] = site.zones;
		const parts = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
		assert.deepEqual(
			zone.parts.map(rings => rings.map(ring => ring.length)),
			parts.map(rings => rings.map(ring => ring.length - 1)),
			`${alias}: each projected ring drops only its closing repeat`
		);
		// Parse then serialise: the same text, so the same numbers in the same places.
		assert.equal(JSON.stringify(zone.geometry), JSON.stringify(geometry), alias);
	}
});

test("a structurally invalid fixture is refused where it is read, never repaired", () => {
	for (const { geometry: alias } of cases.structure_cases.filter(entry => !entry.draft_valid)) {
		assert.throws(() => plan.parseSite(siteWith(cases.geometries[alias])), alias);
	}
});

test("the holed fixture keeps its hole out of the zone; the multipart fixture is one zone in two places", () => {
	const frame = plan.fitFrame(plan.parseSite(siteWith(cases.geometries.outside_hole)).features);
	const project = position => plan.toPlan(position, frame);
	const holed = plan.projectSite({ ...plan.parseSite(siteWith(cases.geometries.holed)), frame }).zones[0];
	assert.equal(plan.pointInParts(project([0.005, 0.005]), holed.parts), false, "inside the hole");
	assert.equal(plan.pointInParts(project([0.0015, 0.0015]), holed.parts), true, "between edge and hole");
	const multipart = plan.projectSite({ ...plan.parseSite(siteWith(cases.geometries.multipart)), frame }).zones[0];
	assert.equal(plan.pointInParts(project([0.025, 0.005]), multipart.parts), true, "second part");
	assert.equal(plan.pointInParts(project([0.015, 0.005]), multipart.parts), false, "between the parts");
	// The label sits inside the zone, never in its hole.
	assert.equal(plan.pointInParts(holed.labelAnchor, holed.parts), true);
});

test("a published zone's pill sits on the package's own anchor", () => {
	const collection = siteWith(cases.geometries.concave);
	collection.features[0].properties.display_anchor = [0.001, 0.008];
	const site = plan.projectSite(plan.parseSite(collection));
	assert.deepEqual(site.zones[0].labelAnchor, plan.toPlan([0.001, 0.008], site.frame));
});

test("full-precision coordinates, including one needing more than 20 decimals, come through exactly", () => {
	const ring = [
		[-76.49876543210987, 42.44567890123457],
		[-76.49776543210987, 42.445678901234574],
		[-76.49776543210988, 42.44667890123457],
		[-76.49876543210987, 42.44667890123457],
		[-76.49876543210987, 42.44567890123457]
	];
	const tiny = [
		[1.2345678901234567e-21, 0],
		[0.0001, 0],
		[0.0001, 0.0001],
		[1.2345678901234567e-21, 0]
	];
	for (const geometry of [
		{ type: "Polygon", coordinates: [ring] },
		{ type: "MultiPolygon", coordinates: [[tiny]] }
	]) {
		const zone = plan.projectSite(plan.parseSite(siteWith(geometry))).zones[0];
		assert.equal(JSON.stringify(zone.geometry), JSON.stringify(geometry));
	}
});

test("a site far larger than any package fits and bounds without overflowing the stack", () => {
	// 200,000 positions: Math.min(...spread) throws at about 125,000 arguments.
	const ring = [];
	for (let i = 0; i < 199_999; i++) {
		const angle = (i / 199_999) * Math.PI * 2;
		ring.push([0.01 * Math.cos(angle), 0.01 * Math.sin(angle)]);
	}
	ring.push(ring[0]);
	const geometry = { type: "Polygon", coordinates: [ring] };
	assert.ok(readZoneGeometry(geometry).ok);
	const collection = siteWith(geometry);
	// The package's anchor, so the test measures fitting and bounds rather than the label search.
	collection.features[0].properties.display_anchor = [0, 0];
	const site = plan.projectSite(plan.parseSite(collection));
	assert.equal(site.zones[0].parts[0][0].length, 199_999);
	assert.ok(site.bounds.maxX > site.bounds.minX);
});
