import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { load } from "./support.mjs";

const hints = await load("lib/zones/hints.ts");

const cases = JSON.parse(
	readFileSync(new URL("../../../contracts/zones/geometry.cases.json", import.meta.url), "utf8")
);
const shape = alias => structuredClone(cases.geometries[alias]);
const partsOf = geometry => (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates);
const draft = (alias, id = "30000000-0000-4000-8000-000000000001") => ({
	zone_id: id,
	zone_code: alias,
	zone_label: alias,
	geometry: shape(alias)
});

test("gate 9: hints flag bow_tie and outside_hole, and leave every valid fixture alone", () => {
	const codes = alias => hints.zoneHints(draft(alias)).map(hint => hint.code);
	assert.deepEqual(codes("bow_tie"), ["self_intersection"]);
	assert.deepEqual(codes("outside_hole"), ["hole_outside"]);
	for (const alias of ["square", "holed", "multipart", "duplicate_vertex", "reversed", "concave", "adjacent"])
		assert.deepEqual(codes(alias), [], alias);
	// Collinear and overlapping parts are the server's to judge, not the browser's.
	for (const alias of ["collinear", "multipart_overlap", "multipart_shared_edge"])
		assert.deepEqual(codes(alias), [], alias);
});

test("a crossing names the point where the second crossing edge starts", () => {
	const [hint] = hints.zoneHints(draft("bow_tie"));
	assert.deepEqual(hint.address, { part: 0, ring: 0, index: 2 });
	// A ring that touches itself at a point is reported too.
	const touching = [
		[0, 0],
		[0.01, 0],
		[0.005, 0.005],
		[0.01, 0.01],
		[0, 0.01],
		[0.005, 0.005],
		[0, 0]
	];
	assert.ok(hints.ringCrossings(touching).length > 0);
});

test("crossing checks stay fast on a 2,000-point edge", () => {
	const ring = [];
	for (let i = 0; i < 1999; i++) {
		const angle = (i / 1999) * Math.PI * 2;
		ring.push([0.001 * Math.cos(angle), 0.001 * Math.sin(angle)]);
	}
	ring.push(ring[0]);
	const started = performance.now();
	assert.deepEqual(hints.ringCrossings(ring), []);
	assert.ok(performance.now() - started < 200);
});

test("coverage agrees with every shared coverage case, edges and hole edges included", () => {
	for (const entry of cases.coverage_cases) {
		const covering = entry.zones.filter(alias =>
			partsOf(cases.geometries[alias]).some(rings => hints.polygonCovers(rings, entry.point))
		);
		assert.deepEqual(covering, entry.covering, entry.id);
	}
});

test("points outside the site are found against the site's real shape, not its box", () => {
	for (const entry of cases.containment_cases) {
		const site = partsOf(cases.geometries[entry.ground]);
		const outside = hints.zoneHints(draft(entry.zone), site).filter(hint => hint.code === "outside_site");
		assert.equal(outside.length === 0, entry.covered, entry.id);
	}
});

test("snapping returns the exact position of the nearest point, and the first one on a tie", () => {
	const zones = [draft("square"), draft("adjacent", "30000000-0000-4000-8000-000000000002")];
	const site = partsOf(shape("concave"));
	const project = ([lng, lat]) => [lng * 1000, -lat * 1000];
	const candidates = hints.snapCandidates(zones, site, project);
	assert.equal(candidates.length, 4 + 4 + 6);
	const index = hints.createSnapIndex(candidates, 2);
	// (10, 0) is shared by square, adjacent and the site: the square's own array wins.
	const found = hints.nearestCandidate(index, [10.4, -0.3], 2);
	assert.equal(found.position, zones[0].geometry.coordinates[0][1]);
	assert.deepEqual(found.source, { kind: "zone", zoneId: zones[0].zone_id, part: 0, ring: 0, index: 1 });
	// Skipping the moving zone finds the neighbour's identical point, as its own array.
	const neighbour = hints.nearestCandidate(
		index,
		[10.4, -0.3],
		2,
		candidate => candidate.source.zoneId === zones[0].zone_id
	);
	assert.equal(neighbour.position, zones[1].geometry.coordinates[0][0]);
	assert.equal(hints.nearestCandidate(index, [5, -5], 2), null);
	// The radius reaches across cells.
	assert.ok(hints.nearestCandidate(hints.createSnapIndex(candidates, 0.5), [11.5, -0.5], 2));
});

test("tracing copies a ring's own points, either way round, across its start", () => {
	const ring = shape("concave").coordinates[0];
	assert.deepEqual(hints.traceRing(ring, 1, 4, 1), [ring[2], ring[3]]);
	assert.equal(hints.traceRing(ring, 1, 4, 1)[0], ring[2], "the same array, so the same numbers");
	assert.deepEqual(hints.traceRing(ring, 1, 4, -1), [ring[0], ring[5]]);
	assert.deepEqual(hints.traceRing(ring, 4, 5, 1), []);
	assert.deepEqual(hints.traceRing(ring, 5, 1, 1), [ring[0]]);
});
