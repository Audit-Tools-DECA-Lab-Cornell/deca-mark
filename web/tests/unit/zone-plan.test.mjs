import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { load } from "./support.mjs";

const plan = await load("lib/plan.ts");
const { readZoneGeometry } = await load("lib/zones/geometry.ts");

const cases = JSON.parse(
	readFileSync(new URL("../../../contracts/zones/geometry.cases.json", import.meta.url), "utf8")
);

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

/** Each subpath of path data as points, and twice its signed area. */
function subpaths(d) {
	return d
		.split("Z")
		.filter(Boolean)
		.map(sub => {
			const points = sub
				.slice(1)
				.split("L")
				.map(pair => pair.split(" ").map(Number));
			let area = 0;
			points.forEach(([x1, y1], n) => {
				const [x2, y2] = points[(n + 1) % points.length];
				area += x1 * y2 - x2 * y1;
			});
			return { points, area };
		});
}

test("overlapping parts stay filled where they overlap, and holes stay empty whichever way they wind", () => {
	const frame = plan.fitFrame(plan.parseSite(siteWith(cases.geometries.outside_hole)).features);
	const project = position => plan.toPlan(position, frame);
	const zoneOf = geometry => plan.projectSite({ ...plan.parseSite(siteWith(geometry)), frame }).zones[0];

	// The contract's overlapping parts are a valid draft: the shared patch is in the zone, drawn and hit.
	const overlap = zoneOf(cases.geometries.multipart_overlap);
	assert.equal(plan.pointInParts(project([0.0075, 0.0075]), overlap.parts), true, "where the parts overlap");
	assert.equal(plan.pointInParts(project([0.0025, 0.0025]), overlap.parts), true, "first part only");
	assert.equal(plan.pointInParts(project([0.0125, 0.0125]), overlap.parts), true, "second part only");
	assert.equal(plan.pointInParts(project([0.0125, 0.0025]), overlap.parts), false, "in neither part");
	const [first, second] = subpaths(plan.zonePath(overlap.parts));
	assert.equal(Math.sign(first.area), Math.sign(second.area), "both parts wind the same way, so they add up");

	// A hole wound the same way as its outer edge is still drawn the other way, and is still not in the zone.
	const holed = cases.geometries.holed;
	const sameWay = { ...holed, coordinates: [holed.coordinates[0], [...holed.coordinates[1]].reverse()] };
	for (const geometry of [holed, sameWay]) {
		const zone = zoneOf(geometry);
		const [outer, hole] = subpaths(plan.zonePath(zone.parts));
		assert.equal(Math.sign(outer.area), -Math.sign(hole.area), "the hole winds against its outer edge");
		assert.equal(plan.pointInParts(project([0.005, 0.005]), zone.parts), false, "inside the hole");
		assert.equal(plan.pointInParts(project([0.0015, 0.0015]), zone.parts), true, "between edge and hole");
		// Only the drawing turns round: the zone's own numbers are as read.
		assert.equal(JSON.stringify(zone.geometry), JSON.stringify(geometry));
	}
	// A reversed outer edge draws the same region.
	const reversed = zoneOf(cases.geometries.reversed);
	assert.ok(subpaths(plan.zonePath(reversed.parts))[0].area > 0 === first.area > 0);
	assert.equal(plan.pointInParts(project([0.005, 0.005]), reversed.parts), true);
});

test("zone outlines keep enough decimals to meet their handles at every zoom", () => {
	assert.equal(plan.zonePathDecimals(1), 2, "a plan at its usual size draws at 0.01 unit");
	for (const pixelsPerUnit of [0.5, 1, 8, 140, 700, 5_000, 72_000]) {
		const decimals = plan.zonePathDecimals(pixelsPerUnit);
		// Rounding moves a point by at most half a step, in pixels.
		const error = 0.5 * 10 ** -decimals * pixelsPerUnit;
		assert.ok(error <= 0.05, `${pixelsPerUnit} px per unit: ${error} px`);
	}
	// A 5 km site at the editor's closest zoom (1 cm per pixel) is about 700 px per plan unit.
	const site = plan.projectSite(plan.parseSite(siteWith(cases.geometries.concave)));
	const exact = site.zones[0].parts[0][0][1];
	const decimals = plan.zonePathDecimals(700);
	const drawn = subpaths(plan.zonePath(site.zones[0].parts, decimals))[0].points;
	const nearest = Math.min(...drawn.map(([x, y]) => Math.hypot(x - exact[0], y - exact[1])));
	assert.ok(nearest * 700 <= 0.05, `drawn ${nearest * 700} px from the handle`);
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
