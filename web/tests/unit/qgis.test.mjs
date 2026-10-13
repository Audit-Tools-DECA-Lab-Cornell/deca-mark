import assert from "node:assert/strict";
import test from "node:test";

import { forms, pkg, site, siteZone, uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const { exportScope, mapRows } = await load("features/qgis/model.ts");

test("each site lists the package observers download, or none", () => {
	const rows = mapRows([
		site({
			zones: [siteZone({ zone_id: uuid(201) }), siteZone({ zone_id: uuid(202), zone_code: "B" })],
			package: pkg({ package_id: uuid(103), package_version: 3, archive_bytes: 13312, forms: forms("play-v1") })
		}),
		site({ code: "empty", name: "Empty", package: null })
	]);
	assert.deepEqual(rows[0], {
		code: "fall-creek",
		name: "Fall Creek",
		zoneCount: 2,
		package: {
			id: uuid(103),
			version: 3,
			bytes: 13312,
			preparedAt: "2026-10-07T18:05:00Z",
			formVersion: "play-v1"
		}
	});
	assert.deepEqual(rows[1], { code: "empty", name: "Empty", zoneCount: 0, package: null });
});

test("the export scope names the count, the site and the round", () => {
	assert.equal(exportScope({ count: 8, siteName: null, round: null }), "8 observations · All sites · All rounds");
	assert.equal(
		exportScope({ count: 1, siteName: "Fall Creek", round: "reliability" }),
		"1 observation · Fall Creek · Reliability round"
	);
	assert.equal(
		exportScope({ count: 0, siteName: null, round: "inventory" }),
		"0 observations · All sites · Inventory round"
	);
});
