import assert from "node:assert/strict";
import test from "node:test";

import { forms, group, observation, pkg, site, uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const { boundFormVersions, packageHistorySchema, publicationSchema, siteByCode, siteListSchema } =
	await load("lib/api/sites.ts");
const { appendPage, filterQuery, observationPageSchema, observationSummarySchema, pointOf } =
	await load("lib/api/observations.ts");

test("sites, histories and publications are read in the shapes the API serves", () => {
	const sites = siteListSchema.parse([site(), site({ site_id: uuid(2), code: "empty", package: null })]);
	assert.equal(sites[0].current_package_id, uuid(100));
	assert.equal(sites[1].current_package_id, null);
	assert.equal(siteByCode(sites, "empty").site_id, uuid(2));
	assert.equal(siteByCode(sites, "missing"), undefined);
	// A site is addressed by its identity; a code in place of one is refused.
	assert.equal(siteListSchema.safeParse([site({ site_id: "fall-creek" })]).success, false);
	// The package a site's collection uses is always ready.
	assert.equal(siteListSchema.safeParse([site({ package: pkg({ state: "blocked" }) })]).success, false);

	const history = packageHistorySchema.parse({
		current_package_id: uuid(101),
		packages: [pkg({ package_id: uuid(101) })]
	});
	assert.equal(history.packages[0].forms.inventory, null);
	assert.equal(packageHistorySchema.safeParse({ packages: [] }).success, false, "which one is current is required");

	const publication = publicationSchema.parse({
		site_id: uuid(1),
		draft_id: null,
		package: pkg({ package_id: uuid(102), package_version: 2 }),
		current_package_id: uuid(102),
		replayed: true
	});
	assert.equal(publication.replayed, true);
});

test("a package binds its play form and, when Inventory is on, its inventory form", () => {
	assert.deepEqual(boundFormVersions(forms("play-v2")), ["play-v2"]);
	assert.deepEqual(boundFormVersions(forms("play-v2", "inventory-v1")), ["play-v2", "inventory-v1"]);
});

test("observation pages and summaries are read with each record's recorded binding", () => {
	const point = observation();
	const inventory = observation({ observation_id: uuid(501), round_type: "inventory", placement: "zone" });
	const page = observationPageSchema.parse({
		items: [{ ...point, geometry: { coordinates: [-76.5, 42.4] } }, inventory],
		next_cursor: "c2",
		total_matching: 812,
		generated_at: "2026-10-08T15:00:00Z"
	});
	assert.deepEqual(page.items[0].geometry, { type: "Point", coordinates: [-76.5, 42.4] });
	assert.deepEqual(pointOf(page.items[0]), [-76.5, 42.4]);
	assert.equal(pointOf(page.items[1]), null, "an inventory is the whole zone");
	assert.equal(observationPageSchema.safeParse({ ...page, items: [{ ...point, zone_id: null }] }).success, false);

	const summary = observationSummarySchema.parse({
		groups: [group({ count: 3 })],
		total_matching: 3,
		generated_at: "x"
	});
	assert.equal(summary.groups[0].count, 3);
});

test("the filters become the API's query: only what is set, zone identities sorted and once each", () => {
	assert.deepEqual(filterQuery({}), {});
	assert.deepEqual(
		filterQuery({
			siteId: uuid(1),
			packageId: uuid(102),
			zoneIds: [uuid(202), uuid(201), uuid(202)],
			roundType: "inventory",
			observer: "OB",
			observedFrom: "2026-10-01T04:00:00.000Z",
			observedBefore: "2026-10-08T04:00:00.000Z"
		}),
		{
			site_id: uuid(1),
			package_id: uuid(102),
			zone_id: [uuid(201), uuid(202)],
			round_type: "inventory",
			observer: "OB",
			observed_from: "2026-10-01T04:00:00.000Z",
			observed_before: "2026-10-08T04:00:00.000Z"
		}
	);
	assert.deepEqual(filterQuery({ zoneIds: [] }), {});
});

test("a later page adds only observations not loaded yet", () => {
	const a = { observation_id: "a" };
	const b = { observation_id: "b" };
	const c = { observation_id: "c" };
	assert.deepEqual(appendPage([a, b], [b, c]), [a, b, c]);
	assert.deepEqual(appendPage([], [a]), [a]);
});
