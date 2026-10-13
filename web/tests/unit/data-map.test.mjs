import assert from "node:assert/strict";
import test from "node:test";

import { group, observation, uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const {
	choiceLabel,
	defaultMapVersion,
	dimmedNote,
	drawnNote,
	loadedGroups,
	mapVersionChoices,
	subsetNote,
	versionList,
	zoneInventories
} = await load("features/data/map.ts");
const { createPlanMemo, PLAN_MEMO_LIMIT, planKey } = await load("features/data/plans.ts");

const SITE = uuid(1);
const OTHER_SITE = uuid(2);
const V1 = uuid(100);
const V2 = uuid(101);
const V3 = uuid(102);
const A = uuid(200);
const B = uuid(201);

/** The 520-row zone review fixture's shape: v1 and v2 of one site, points and inventories on each. */
const review = [
	group({ package_id: V1, package_version: 1, zone_id: A, zone_label: "=Synthetic lawn v1", count: 250 }),
	group({
		package_id: V1,
		package_version: 1,
		zone_id: A,
		zone_label: "=Synthetic lawn v1",
		round_type: "inventory",
		spatial_support: "zone",
		count: 10
	}),
	group({ package_id: V2, package_version: 2, zone_id: A, zone_label: "Synthetic smaller lawn v2", count: 250 }),
	group({
		package_id: V2,
		package_version: 2,
		zone_id: A,
		zone_label: "Synthetic smaller lawn v2",
		round_type: "inventory",
		spatial_support: "zone",
		count: 10
	}),
	group({ site_id: OTHER_SITE, package_id: uuid(110), package_version: 4, count: 99 })
];

test("map version choices: every version the matches were recorded on at the site, newest first", () => {
	assert.deepEqual(mapVersionChoices(review, SITE, V2), [
		{ packageId: V2, version: 2, count: 260, current: true },
		{ packageId: V1, version: 1, count: 260, current: false }
	]);
	// Another site's versions and empty groups are not offered.
	assert.deepEqual(
		mapVersionChoices([group({ package_id: V3, package_version: 3, count: 0 }), ...review], SITE, null).map(
			choice => choice.version
		),
		[2, 1]
	);
	assert.deepEqual(mapVersionChoices([], SITE, V2), []);
});

test("the plan draws the filter's version, else the current one with matches, else the newest", () => {
	const both = mapVersionChoices(review, SITE, V2);
	assert.equal(defaultMapVersion(both, V1)?.version, 1);
	assert.equal(defaultMapVersion(both, null)?.version, 2);
	// No match was recorded on the current v3, so the newest version a match has is drawn: never today's
	// boundaries under v1 and v2 points.
	const notCurrent = mapVersionChoices(review, SITE, V3);
	assert.equal(defaultMapVersion(notCurrent, null)?.version, 2);
	const onlyOld = mapVersionChoices(review.slice(0, 2), SITE, V2);
	assert.equal(defaultMapVersion(onlyOld, null)?.version, 1);
	assert.equal(defaultMapVersion([], null), null);
});

test("a choice reads its version, whether it is current, and its count", () => {
	assert.equal(
		choiceLabel({ packageId: V2, version: 2, count: 260, current: true }),
		"v2 (current) · 260 observations"
	);
	assert.equal(choiceLabel({ packageId: V1, version: 1, count: 1, current: false }), "v1 · 1 observation");
});

test("zone inventories: one row per zone and version, with its name on that version", () => {
	assert.deepEqual(zoneInventories(review, SITE), [
		{
			zoneId: A,
			zoneLabel: "Synthetic smaller lawn v2",
			zoneCode: "A",
			packageId: V2,
			version: 2,
			count: 10
		},
		{ zoneId: A, zoneLabel: "=Synthetic lawn v1", zoneCode: "A", packageId: V1, version: 1, count: 10 }
	]);
	// Points are never inventories, and another site's inventories are not this one's.
	assert.deepEqual(
		zoneInventories(
			review.filter(item => item.spatial_support === "point"),
			SITE
		),
		[]
	);
	assert.deepEqual(zoneInventories(review, OTHER_SITE), []);
	// Inventories of one zone and version in several groups add up.
	const split = zoneInventories(
		[
			group({ zone_id: B, zone_label: "Swings", round_type: "inventory", spatial_support: "zone", count: 2 }),
			group({ zone_id: B, zone_label: "Swings", round_type: "inventory", spatial_support: "zone", count: 3 })
		],
		SITE
	);
	assert.equal(split.length, 1);
	assert.equal(split[0].count, 5);
});

test("without DECA Mark's counts, the loaded observations are counted the same way", () => {
	const rows = [
		observation({ observation_id: uuid(501) }),
		observation({ observation_id: uuid(502) }),
		observation({ observation_id: uuid(503), package_id: V2, package_version: 2 }),
		observation({ observation_id: uuid(504), round_type: "inventory" })
	];
	const groups = loadedGroups(rows);
	assert.deepEqual(
		mapVersionChoices(groups, SITE, V2).map(choice => [choice.version, choice.count]),
		[
			[2, 1],
			[1, 3]
		]
	);
	assert.deepEqual(
		zoneInventories(groups, SITE).map(row => [row.version, row.count]),
		[[1, 1]]
	);
});

test("the notes say which version is drawn, which points are dimmed and what loaded", () => {
	assert.equal(drawnNote(2, 2), "Drawn on map v2, the site's current version.");
	assert.equal(drawnNote(1, 2), "Drawn on map v1. v2 is current.");
	assert.equal(drawnNote(1, null), "Drawn on map v1.");
	assert.equal(dimmedNote([]), null);
	assert.equal(dimmedNote([1]), "Points recorded on v1 are dimmed. Their zones may differ from these boundaries.");
	assert.equal(versionList([3, 1, 1]), "v1 and v3");
	assert.equal(versionList([4, 1, 2]), "v1, v2 and v4");
	assert.equal(subsetNote({ loaded: 520, total: 520, searched: null }), null);
	assert.equal(
		subsetNote({ loaded: 500, total: 1284, searched: null }),
		"The map shows the 500 loaded of 1,284 matching observations."
	);
	assert.equal(
		subsetNote({ loaded: 500, total: 1284, searched: 12 }),
		"The map shows the 12 of 500 loaded observations the search finds."
	);
});

test("plans are kept per account, project and package, and the oldest goes first", () => {
	assert.equal(planKey("u1", "p1", V1), `u1:p1:${V1}`);
	assert.equal(planKey(null, "p1", V1), null);
	assert.notEqual(planKey("u1", "p1", V1), planKey("u2", "p1", V1));

	const memo = createPlanMemo(2);
	const plan = name => ({ name });
	memo.remember(planKey("u1", "p1", V1), plan("v1"));
	memo.remember(planKey("u1", "p1", V2), plan("v2"));
	// Another account never sees a plan read for this one.
	assert.equal(memo.recall(planKey("u2", "p1", V1)), null);
	// Recalling v1 makes it the newest, so v2 goes when a third is kept.
	assert.equal(memo.recall(planKey("u1", "p1", V1))?.name, "v1");
	memo.remember(planKey("u1", "p1", V3), plan("v3"));
	assert.equal(memo.recall(planKey("u1", "p1", V2)), null);
	assert.equal(memo.recall(planKey("u1", "p1", V1))?.name, "v1");
	assert.equal(memo.recall(planKey("u1", "p1", V3))?.name, "v3");
	// Nobody signed in: nothing is kept.
	memo.remember(null, plan("x"));
	assert.equal(memo.recall(null), null);
	assert.ok(PLAN_MEMO_LIMIT >= 2);
});
