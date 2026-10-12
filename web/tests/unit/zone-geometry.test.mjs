import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { load } from "./support.mjs";

const geometry = await load("lib/zones/geometry.ts");
const plan = await load("lib/plan.ts");

const cases = JSON.parse(
	readFileSync(new URL("../../../contracts/zones/geometry.cases.json", import.meta.url), "utf8")
);
const fixture = alias => structuredClone(cases.geometries[alias]);

/** Every position of a geometry with its address, closing positions included. */
function* positions(shape) {
	const parts = shape.type === "Polygon" ? [shape.coordinates] : shape.coordinates;
	for (const [part, rings] of parts.entries())
		for (const [ring, points] of rings.entries())
			for (const [index, position] of points.entries()) yield { part, ring, index, position };
}

const UUID = n => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const zone = (n, shape, overrides = {}) => ({
	zone_id: UUID(n),
	zone_code: `Z${n}`,
	zone_label: `Zone ${n}`,
	geometry: shape,
	...overrides
});

test("the strict reader agrees with every structure case, and returns the shape it was given", () => {
	for (const entry of cases.structure_cases) {
		const read = geometry.readZoneGeometry(fixture(entry.geometry));
		assert.equal(read.ok, entry.draft_valid, entry.id);
		if (read.ok) assert.equal(JSON.stringify(read.geometry), JSON.stringify(cases.geometries[entry.geometry]));
		else assert.ok(read.issues.every(issue => issue.code === "invalid_structure" && issue.path.startsWith("/")));
	}
	// Each refusal names where it was found.
	assert.equal(geometry.readZoneGeometry(fixture("unclosed")).issues[0].path, "/coordinates/0");
	assert.equal(geometry.readZoneGeometry(fixture("z_dimension")).issues[0].path, "/coordinates/0/0");
	assert.equal(geometry.readZoneGeometry({ type: "Point", coordinates: [0, 0] }).issues[0].path, "/type");
});

test("the editor's bounds are the contract's limit cases", () => {
	const limit = Object.fromEntries(cases.limit_cases.map(entry => [entry.resource, entry.maximum]));
	assert.deepEqual(geometry.ZONE_LIMITS, {
		zones: limit.zones,
		zonePositions: limit.zone_positions,
		packagePositions: limit.package_positions,
		draftBytes: limit.draft_bytes
	});
});

/** A closed ring of `count` positions (count − 1 distinct points round a circle). */
function circle(count, [cx, cy] = [0, 0], radius = 0.001) {
	const ring = [];
	for (let i = 0; i < count - 1; i++) {
		const angle = (i / (count - 1)) * Math.PI * 2;
		ring.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
	}
	ring.push(ring[0]);
	return { type: "Polygon", coordinates: [ring] };
}

test("structure checks: positions per zone and per draft, and zones per draft, at and one over the limit", () => {
	const atZone = [zone(1, circle(2000))];
	assert.deepEqual(geometry.structureIssues(atZone), []);
	assert.deepEqual(
		geometry.structureIssues([zone(1, circle(2001))]).map(issue => issue.code),
		["too_complex"]
	);
	// 250 zones of 80 positions: 20,000 in all, both at their limits.
	const grid = Array.from({ length: 250 }, (_, n) => zone(n + 1, circle(80, [n * 0.01, 0])));
	assert.deepEqual(geometry.structureIssues(grid), []);
	const zonesOver = [...grid, zone(251, circle(4, [3, 0]))];
	assert.ok(
		geometry.structureIssues(zonesOver).some(issue => issue.code === "too_complex" && issue.path === "/zones")
	);
	const positionsOver = grid.map((entry, n) => (n === 0 ? { ...entry, geometry: circle(81) } : entry));
	assert.deepEqual(
		geometry.structureIssues(positionsOver).map(issue => [issue.code, issue.path]),
		[["too_complex", "/zones"]]
	);
	// The largest draft the bounds allow is far under the 4 MiB body limit.
	assert.ok(geometry.draftBodyBytes(grid, "") < geometry.ZONE_LIMITS.draftBytes);
});

test("structure checks: names, codes, identities and the change note", () => {
	const square = fixture("square");
	const issues = drafts => geometry.structureIssues(drafts).map(issue => issue.code);
	assert.deepEqual(issues([zone(1, square, { zone_label: "   " })]), ["empty_label"]);
	assert.deepEqual(issues([zone(1, square, { zone_label: "é".repeat(200) })]), []);
	assert.deepEqual(issues([zone(1, square, { zone_label: "é".repeat(201) })]), ["long_label"]);
	for (const code of ["", "-A", "A B", "Ä", "A".repeat(101)])
		assert.deepEqual(issues([zone(1, square, { zone_code: code })]), ["invalid_code"], code);
	for (const code of ["A", "a.b_c-1", "9", "A".repeat(100)]) assert.ok(geometry.validCode(code), code);
	assert.deepEqual(issues([zone(1, square), zone(2, square, { zone_code: "Z1" })]), ["duplicate_code"]);
	assert.deepEqual(issues([zone(1, square), zone(1, square, { zone_code: "Z2" })]), ["duplicate_zone_id"]);
	assert.deepEqual(issues([zone(1, square, { zone_id: "3000000A-0000-4000-8000-00000000000B" })]), ["invalid_zone_id"]);
	assert.deepEqual(issues([zone(1, fixture("unclosed"))]), ["invalid_structure"]);
	assert.deepEqual(
		geometry.structureIssues([zone(1, square)], "x".repeat(2001)).map(issue => issue.code),
		["long_change_note"]
	);
	assert.deepEqual(geometry.structureIssues([zone(1, square)], `  ${"x".repeat(2000)}  `), []);
	// An empty draft is structurally fine; publication needs a zone, which the server decides.
	assert.deepEqual(geometry.structureIssues([]), []);
});

test("unchanged draft: load and serialise every fixture with no edit, and every number is identical", () => {
	for (const { geometry: alias } of cases.structure_cases.filter(entry => entry.draft_valid)) {
		const text = JSON.stringify({ zones: [zone(1, cases.geometries[alias])], change_note: "" });
		const read = geometry.readZoneGeometry(JSON.parse(text).zones[0].geometry);
		assert.ok(read.ok, alias);
		assert.equal(JSON.stringify({ zones: [zone(1, read.geometry)], change_note: "" }), text, alias);
	}
});

test("moving one point leaves every other position the same array at the same address, ring closed", () => {
	for (const { geometry: alias } of cases.structure_cases.filter(entry => entry.draft_valid)) {
		const shape = fixture(alias);
		const parts = shape.type === "Polygon" ? [shape.coordinates] : shape.coordinates;
		for (const [part, rings] of parts.entries()) {
			for (const [ring, points] of rings.entries()) {
				for (const index of [0, 1, points.length - 2]) {
					const moved = geometry.moveVertex(
						shape,
						{ part, ring, index },
						[0.123456789012345, 0.0987654321098765]
					);
					const before = [...positions(shape)];
					const after = [...positions(moved)];
					assert.equal(after.length, before.length, alias);
					const last = points.length - 1;
					for (const [n, entry] of after.entries()) {
						const target =
							entry.part === part &&
							entry.ring === ring &&
							(entry.index === index || (index === 0 && entry.index === last));
						if (target) assert.deepEqual(entry.position, [0.123456789012345, 0.0987654321098765]);
						else assert.equal(entry.position, before[n].position, `${alias} ${JSON.stringify(entry)}`);
					}
					// The ring stays closed on the identical pair, and part and ring counts are unchanged.
					const movedRing = geometry.ringAt(moved, { part, ring });
					assert.deepEqual(movedRing[0], movedRing[movedRing.length - 1]);
					assert.equal(moved.type, shape.type);
				}
			}
		}
	}
});

test("edits share every untouched ring and part", () => {
	const shape = fixture("multipart");
	const moved = geometry.moveVertex(shape, { part: 1, ring: 0, index: 2 }, [0.031, 0.011]);
	assert.equal(moved.coordinates[0], shape.coordinates[0], "the other part is the same object");
	const holed = fixture("holed");
	const nudged = geometry.moveVertex(holed, { part: 0, ring: 1, index: 0 }, [0.0031, 0.0031]);
	assert.equal(nudged.coordinates[0], holed.coordinates[0], "the outer edge is the same object");
	assert.equal(nudged.coordinates[1][1], holed.coordinates[1][1]);
});

test("inserting and removing points keeps rings closed and refuses below three different points", () => {
	const square = fixture("square");
	const inserted = geometry.insertVertex(square, { part: 0, ring: 0, index: 3 }, [0, 0.005]);
	assert.deepEqual(inserted.coordinates[0], [
		[0, 0],
		[0.01, 0],
		[0.01, 0.01],
		[0, 0.01],
		[0, 0.005],
		[0, 0]
	]);
	const removedFirst = geometry.removeVertex(square, { part: 0, ring: 0, index: 0 });
	assert.ok(removedFirst.ok);
	assert.deepEqual(removedFirst.geometry.coordinates[0], [
		[0.01, 0],
		[0.01, 0.01],
		[0, 0.01],
		[0.01, 0]
	]);
	// A triangle keeps its three points.
	const refused = geometry.removeVertex(removedFirst.geometry, { part: 0, ring: 0, index: 1 });
	assert.deepEqual(refused, { ok: false, reason: "too_few_points" });
	// Four positions but only two different points left would not be a ring either.
	const doubled = geometry.removeVertex(fixture("duplicate_vertex"), { part: 0, ring: 0, index: 3 });
	assert.ok(doubled.ok);
	assert.deepEqual(geometry.removeVertex(doubled.geometry, { part: 0, ring: 0, index: 0 }), {
		ok: false,
		reason: "too_few_points"
	});
	assert.deepEqual(geometry.removeVertex(square, { part: 0, ring: 0, index: 4 }), { ok: false, reason: "not_found" });
});

test("holes and parts come off whole, and a zone keeps its type and at least one part", () => {
	const holed = geometry.removeHole(fixture("holed"), { part: 0, ring: 1 });
	assert.deepEqual(holed.geometry, fixture("square"));
	assert.deepEqual(geometry.removeHole(fixture("holed"), { part: 0, ring: 0 }), { ok: false, reason: "not_found" });
	const multipart = geometry.removePart(fixture("multipart"), 0);
	assert.equal(multipart.geometry.type, "MultiPolygon");
	assert.deepEqual(multipart.geometry.coordinates, [fixture("multipart").coordinates[1]]);
	assert.deepEqual(geometry.removePart(multipart.geometry, 0), { ok: false, reason: "too_few_points" });
	assert.deepEqual(geometry.removePart(fixture("square"), 0), { ok: false, reason: "not_found" });
});

/** Ground distance between two positions, in metres (haversine on a 6,371,008.8 m sphere). */
function metres([lng1, lat1], [lng2, lat2]) {
	const rad = Math.PI / 180;
	const a =
		Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
		Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
	return 2 * 6_371_008.8 * Math.asin(Math.sqrt(a));
}

test("nudges move a fixed ground distance from the point's own latitude", () => {
	for (const start of [
		[-76.4987654321, 42.4456789],
		[0, 0],
		[151.2, -33.87]
	]) {
		for (const [east, north] of [
			[0.1, 0],
			[0, 0.1],
			[-1, 0],
			[0, -1]
		]) {
			const moved = geometry.nudge(start, east, north);
			const distance = metres(start, moved);
			assert.ok(
				Math.abs(distance - Math.hypot(east, north)) < 0.005 * Math.hypot(east, north),
				`${start} ${east},${north}: ${distance}`
			);
		}
	}
});

test("a rectangle takes its corners' numbers exactly from the two given corners", () => {
	const a = [-76.49876543210987, 42.44567890123457];
	const b = [-76.49776543210988, 42.445678901234574];
	const ring = geometry.rectangleRing(b, a);
	assert.deepEqual(ring, [
		[a[0], a[1]],
		[b[0], a[1]],
		[b[0], b[1]],
		[a[0], b[1]],
		[a[0], a[1]]
	]);
	assert.ok(
		geometry.readZoneGeometry({ type: "Polygon", coordinates: [geometry.rectangleRing([0, 0], [0.01, 0.02])] }).ok
	);
});

test("the server's normalisation is matched before comparing drafts", () => {
	const square = fixture("square");
	const sent = [zone(1, square, { zone_id: "3000000A-0000-4000-8000-00000000000B", zone_label: "  North meadow " })];
	const stored = geometry.normalizeDraftZones(sent);
	assert.equal(stored[0].zone_id, "3000000a-0000-4000-8000-00000000000b");
	assert.equal(stored[0].zone_label, "North meadow");
	assert.equal(stored[0].geometry, square);
	assert.ok(geometry.sameZones(sent, stored));
	assert.ok(!geometry.sameZones(stored, [{ ...stored[0], geometry: fixture("reversed") }]));
	// A Polygon and the same rings as a MultiPolygon are different drafts: geometry is echoed as sent.
	assert.ok(!geometry.sameGeometry(square, { type: "MultiPolygon", coordinates: [square.coordinates] }));
});

test("the plan projection is never the source of a coordinate: a round trip is not exact near 0°, 0°", () => {
	// Why WUI-2 keeps longitude and latitude as the truth: fromPlan(toPlan(p)) can differ in the last bit.
	const frame = plan.fitFrame([
		{ type: "Feature", properties: { kind: "zone", id: "z" }, geometry: cases.geometries.outside_hole }
	]);
	let differing = 0;
	for (let i = 1; i <= 1000; i++) {
		const p = [i * 1.234567e-5, i * 2.345678e-5];
		const back = plan.fromPlan(plan.toPlan(p, frame), frame);
		if (back[0] !== p[0] || back[1] !== p[1]) differing++;
	}
	assert.ok(differing > 0, "the projection is display-only");
});
