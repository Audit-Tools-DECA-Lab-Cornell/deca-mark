import assert from "node:assert/strict";
import test from "node:test";

import { uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const {
	choiceWords,
	choose,
	identityMap,
	initialMapping,
	mappingProblems,
	namedZonesLayer,
	removedZones,
	sourceZones,
	ZONE_CODE_PATTERN,
	zoneName
} = await load("features/packages/identity.ts");
const { issueText } = await load("lib/zones/issues.ts");

const meadow = { zoneId: uuid(201), code: "MEADOW", label: "North meadow" };
const swings = { zoneId: uuid(202), code: "SWINGS", label: "Swings" };
const current = [meadow, swings];

/** New identities in order, so a test can name them. */
function ids(start = 300) {
	let next = start;
	return () => uuid(next++);
}

const feature = properties => ({ type: "Feature", properties, geometry: null });

test("a feature is a source zone by its id; its name is its name field, or its label field", () => {
	const sources = sourceZones([
		feature({ id: "MEADOW", name: " North meadow ", zone_id: uuid(201).toUpperCase() }),
		feature({ id: "B", label: "Garden" }),
		feature({ id: "C", zone_id: "not an identity" }),
		feature({ name: "No id" }),
		feature({ id: "" })
	]);
	assert.deepEqual(sources, [
		{ sourceId: "MEADOW", name: "North meadow", carriedZoneId: uuid(201) },
		{ sourceId: "B", name: "Garden", carriedZoneId: null },
		{ sourceId: "C", name: null, carriedZoneId: null }
	]);
	assert.equal(zoneName({ name: "Name", label: "Label" }), "Name");
	assert.equal(zoneName({ name: "  ", label: "Label" }), "Label");
	assert.equal(zoneName({}), null);
});

test("only a carried identity is chosen; a matching code or name is suggested and left undecided", () => {
	const rows = initialMapping(
		[
			{ sourceId: "X1", name: "Anything", carriedZoneId: uuid(201) },
			{ sourceId: "SWINGS", name: "Play area", carriedZoneId: null },
			{ sourceId: "Z9", name: "Swings", carriedZoneId: null },
			{ sourceId: "POND", name: "Pond", carriedZoneId: null },
			// A carried identity the current version does not have proves nothing.
			{ sourceId: "MEADOW", name: "Meadow", carriedZoneId: uuid(999) },
			{ sourceId: "bad code!", name: "Odd", carriedZoneId: null }
		],
		current,
		ids()
	);
	assert.deepEqual(
		rows.map(row => [row.source.sourceId, row.choice, row.suggestion?.code ?? null]),
		[
			["X1", { kind: "same", zoneId: uuid(201) }, null],
			["SWINGS", { kind: "undecided" }, "SWINGS"],
			["Z9", { kind: "undecided" }, "SWINGS"],
			["POND", { kind: "new", zoneId: uuid(300), code: "POND" }, null],
			["MEADOW", { kind: "undecided" }, "MEADOW"],
			// Not a valid code, so the new zone waits for one.
			["bad code!", { kind: "new", zoneId: uuid(301), code: "" }, null]
		]
	);
});

test("on a site's first upload every zone is new, coded by its source id", () => {
	const rows = initialMapping([{ sourceId: "A", name: "Zone A", carriedZoneId: null }], [], ids());
	assert.deepEqual(rows[0].choice, { kind: "new", zoneId: uuid(300), code: "A" });
	assert.deepEqual(mappingProblems(rows, []), new Map());
	assert.deepEqual(identityMap(rows, []), [{ source_feature_id: "A", zone_id: uuid(300), zone_code: "A" }]);
});

test("a new zone keeps the identity it was first given, so a retry sends the same identities", () => {
	const next = ids();
	let rows = initialMapping([{ sourceId: "POND", name: "Pond", carriedZoneId: null }], current, next);
	rows = choose(rows, "POND", { kind: "new", code: "POND-2" }, next);
	assert.deepEqual(rows[0].choice, { kind: "new", zoneId: uuid(300), code: "POND-2" });
	rows = choose(rows, "POND", { kind: "same", zoneId: swings.zoneId }, next);
	rows = choose(rows, "POND", { kind: "new", code: "POND" }, next);
	assert.deepEqual(rows[0].choice, { kind: "new", zoneId: uuid(301), code: "POND" }, "a fresh one after Same zone");
});

test("what stops a mapping: no name, undecided, a zone chosen twice, a missing, taken or repeated code", () => {
	const rows = [
		{
			source: { sourceId: "N", name: null, carriedZoneId: null },
			choice: { kind: "new", zoneId: uuid(300), code: "N" },
			suggestion: null
		},
		{
			source: { sourceId: "U", name: "U", carriedZoneId: null },
			choice: { kind: "undecided" },
			suggestion: swings
		},
		{
			source: { sourceId: "S1", name: "S1", carriedZoneId: null },
			choice: { kind: "same", zoneId: meadow.zoneId },
			suggestion: null
		},
		{
			source: { sourceId: "S2", name: "S2", carriedZoneId: null },
			choice: { kind: "same", zoneId: meadow.zoneId },
			suggestion: null
		},
		{
			source: { sourceId: "E", name: "E", carriedZoneId: null },
			choice: { kind: "new", zoneId: uuid(301), code: "" },
			suggestion: null
		},
		{
			source: { sourceId: "T", name: "T", carriedZoneId: null },
			choice: { kind: "new", zoneId: uuid(302), code: "SWINGS" },
			suggestion: null
		},
		{
			source: { sourceId: "D1", name: "D1", carriedZoneId: null },
			choice: { kind: "new", zoneId: uuid(303), code: "DUP" },
			suggestion: null
		},
		{
			source: { sourceId: "D2", name: "D2", carriedZoneId: null },
			choice: { kind: "new", zoneId: uuid(304), code: "DUP" },
			suggestion: null
		},
		{
			source: { sourceId: "G", name: "G", carriedZoneId: null },
			choice: { kind: "same", zoneId: uuid(999) },
			suggestion: null
		}
	];
	const problems = mappingProblems(rows, current);
	assert.deepEqual(Object.fromEntries(problems), {
		N: "Zone N has no name. In QGIS, give it a name, then export again.",
		U: "Choose whether U is the same zone as Swings or a new zone.",
		S1: "More than one zone is North meadow. Each current zone can be one zone of the file at most.",
		S2: "More than one zone is North meadow. Each current zone can be one zone of the file at most.",
		E: "Give the new zone E a code. Use 1 to 100 letters, digits, dots, dashes or underscores, starting with a letter or a digit.",
		T: "SWINGS is the code of Swings. A new zone needs a code of its own.",
		D1: "More than one new zone has the code DUP.",
		D2: "More than one new zone has the code DUP.",
		G: "Choose which zone G is."
	});
});

test("zone codes are ASCII, 1 to 100 characters, a letter or digit first", () => {
	for (const good of ["A", "9", "north-meadow_2.b", "x".repeat(100)]) assert.ok(ZONE_CODE_PATTERN.test(good), good);
	for (const bad of ["", "-a", ".a", "a b", "é", "x".repeat(101)]) assert.ok(!ZONE_CODE_PATTERN.test(bad), bad);
});

test("the identity map sends each feature once; current zones no feature keeps are removed", () => {
	const rows = [
		{
			source: { sourceId: "A", name: "Meadow", carriedZoneId: null },
			choice: { kind: "same", zoneId: meadow.zoneId },
			suggestion: null
		},
		{
			source: { sourceId: "P", name: "Pond", carriedZoneId: null },
			choice: { kind: "new", zoneId: uuid(300), code: "POND" },
			suggestion: null
		}
	];
	assert.deepEqual(identityMap(rows, current), [
		{ source_feature_id: "A", zone_id: meadow.zoneId, zone_code: "MEADOW" },
		{ source_feature_id: "P", zone_id: uuid(300), zone_code: "POND" }
	]);
	assert.deepEqual(removedZones(rows, current), [swings]);
	assert.equal(choiceWords(rows[0], current), "Same zone as North meadow (MEADOW)");
	assert.equal(choiceWords(rows[1], current), "New zone, code POND");
	assert.equal(choiceWords({ ...rows[1], choice: { kind: "undecided" } }, current), "Not chosen yet");
});

test("the zones layer is sent named: a label fills a missing name, and nothing else changes", () => {
	const geometry = {
		type: "Polygon",
		coordinates: [
			[
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 0]
			]
		]
	};
	const layer = {
		type: "FeatureCollection",
		name: "zones",
		features: [
			{ type: "Feature", properties: { id: "A", label: "Meadow" }, geometry },
			{ type: "Feature", properties: { id: "B", name: "Swings", label: "Old" }, geometry },
			{ type: "Feature", properties: { id: "C" }, geometry }
		]
	};
	const sent = namedZonesLayer(layer);
	assert.deepEqual(
		sent.features.map(entry => entry.properties),
		[{ id: "A", label: "Meadow", name: "Meadow" }, { id: "B", name: "Swings", label: "Old" }, { id: "C" }]
	);
	assert.equal(sent.features[0].geometry, geometry);
	assert.equal(sent.features[1], layer.features[1], "a named feature is the same object");
	assert.equal(sent.name, "zones");
	assert.deepEqual(layer.features[0].properties, { id: "A", label: "Meadow" }, "the file read is not changed");
});

test("a zone problem DECA Mark found reads as what to do, with the zones by name", () => {
	assert.equal(
		issueText("interior_overlap", ["North meadow", "Swings"]),
		"North meadow and Swings overlap. Zones may share an edge but not area. Move the shared edge so they only touch."
	);
	assert.equal(issueText("interior_overlap", ["A", "B", "C"]).startsWith("A, B and C overlap."), true);
	assert.equal(
		issueText("self_intersection", ["Pond"]),
		"Pond's edge crosses itself. Move a point so the edge no longer crosses."
	);
	assert.equal(issueText("zero_area"), "A zone has no area. Move its points apart.");
	assert.equal(issueText("empty_zone_set"), "Add at least one zone.");
	assert.match(issueText("something_new", ["Pond"]), /^Pond: DECA Mark found a problem/);
	for (const code of [
		"self_intersection",
		"invalid_topology",
		"zero_area",
		"outside_site",
		"interior_overlap",
		"duplicate_code",
		"identity_conflict",
		"invalid_structure",
		"small_zone"
	])
		assert.doesNotMatch(issueText(code, ["Pond"]), /polygon/i, code);
});
