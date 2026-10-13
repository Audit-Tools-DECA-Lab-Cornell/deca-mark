import assert from "node:assert/strict";
import test from "node:test";

import { forms, group, pkg, site, siteZone, uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const { siteView, sortSites, thumbnailSites, zoneRows } = await load("features/sites/view.ts");
const { clock } = await load("lib/time.ts");

const ny = clock("America/New_York");

const fallCreek = site({
	name: "Fall Creek test site",
	description: "  The playground.  ",
	observation_count: 8,
	package: pkg({ package_id: uuid(103), package_version: 3, forms: forms("workspace-check-v1", "inventory-v2") }),
	zones: [siteZone({ zone_id: uuid(201), zone_code: "A", label: "Zone A · Whole playground" })]
});
const empty = site({ site_id: uuid(2), code: "empty-site", name: "Empty test site", package: null });

test("a site with a package reads its version, date in the project's timezone, size, forms and zones", () => {
	const view = siteView(fallCreek, ny);
	assert.equal(view.siteId, uuid(1));
	assert.equal(view.package.packageId, uuid(103));
	assert.equal(view.package.version, 3);
	assert.equal(view.package.prepared, "Oct 07, 2026 · 14:05");
	assert.equal(view.package.preparedDay, "Oct 07, 2026");
	assert.equal(view.package.sizeLabel, "13 KB");
	assert.equal(view.package.formVersion, "workspace-check-v1");
	assert.equal(view.package.inventoryFormVersion, "inventory-v2");
	assert.equal(view.zonesLabel, "1 zone");
	assert.equal(view.observationsLabel, "8 observations");
	assert.equal(view.description, "The playground.");
	assert.deepEqual(view.zones, [{ id: uuid(201), code: "A", label: "Zone A · Whole playground" }]);
});

test("a new site has no package, no zones yet and says so, with correct plurals", () => {
	const view = siteView(empty, ny);
	assert.equal(view.package, null);
	assert.equal(view.zonesLabel, "No zones yet");
	assert.equal(view.observationsLabel, "0 observations");
	assert.equal(view.description, null);
	assert.equal(siteView({ ...empty, observation_count: 1 }, ny).observationsLabel, "1 observation");
});

test("a map without Inventory has no inventory form", () => {
	assert.equal(siteView(site(), ny).package.inventoryFormVersion, null);
});

test("sites sort by name, and thumbnails go to the first six with a package", () => {
	const sorted = sortSites([siteView(fallCreek, ny), siteView(empty, ny)]);
	assert.deepEqual(
		sorted.map(entry => entry.code),
		["empty-site", "fall-creek"]
	);
	const many = Array.from({ length: 9 }, (_, index) => ({ code: `s${index}`, package: index === 1 ? null : {} }));
	assert.deepEqual(
		thumbnailSites(many).map(entry => entry.code),
		["s0", "s2", "s3", "s4", "s5", "s6"]
	);
});

test("zone rows count by zone identity: on the current version, and on earlier ones", () => {
	const zones = [
		{ id: uuid(201), code: "A", label: "Zone A" },
		{ id: uuid(202), code: "B", label: "Zone B" }
	];
	const groups = [
		group({ zone_id: uuid(201), zone_label: "Old name of A", package_version: 1, count: 2 }),
		group({ zone_id: uuid(201), zone_label: "Zone A", package_version: 2, round_type: "inventory", count: 1 }),
		group({ zone_id: uuid(202), zone_label: "Zone B", package_version: 2, count: 1 }),
		// A zone the current version no longer has: named as the newest version that had it named it.
		group({ zone_id: uuid(209), zone_label: "Pond", package_version: 1, count: 4 }),
		group({ zone_id: uuid(209), zone_label: "Pond edge", package_version: 1, round_type: "reliability", count: 1 })
	];
	assert.deepEqual(
		zoneRows(zones, groups, 2).map(row => [row.id, row.code, row.current, row.label, row.count, row.countLabel]),
		[
			[uuid(201), "A", true, "Zone A", 3, "1 observation on v2 · 2 on earlier versions"],
			[uuid(202), "B", true, "Zone B", 1, "1 observation on v2"],
			[uuid(209), null, false, "Pond", 5, "5 observations on earlier versions"]
		]
	);
	assert.equal(zoneRows([], [group({ count: 3 })], null)[0].countLabel, "3 observations");
	assert.deepEqual(zoneRows(zones, null), [
		{ id: uuid(201), code: "A", current: true, label: "Zone A", count: null, countLabel: null },
		{ id: uuid(202), code: "B", current: true, label: "Zone B", count: null, countLabel: null }
	]);
});
