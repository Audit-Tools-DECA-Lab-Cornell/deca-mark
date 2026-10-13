import assert from "node:assert/strict";
import test from "node:test";

import { uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const {
	EXPORT_LIMIT,
	EXPORT_TOO_LARGE,
	exportAction,
	exportBlocked,
	exportFileName,
	scopeLines,
	zonesFileName,
	zonesGeoJson
} = await load("lib/export/files.ts");
const { clock } = await load("lib/time.ts");

const ny = clock("America/New_York");
const all = { site: null, zones: [], version: null, round: null, observer: null, from: null, to: null };

test("an export holds up to 10,000 observations, and says why when it cannot be made", () => {
	assert.equal(EXPORT_LIMIT, 10_000);
	assert.equal(exportBlocked(1), null);
	assert.equal(exportBlocked(10_000), null);
	assert.equal(exportBlocked(10_001), EXPORT_TOO_LARGE);
	assert.match(exportBlocked(0), /No observations match these filters/);
	assert.equal(exportAction(1284), "Export 1,284 matching observations");
	assert.equal(exportAction(1), "Export 1 matching observation");
});

test("files are named by the site or project, what they hold, and the day", () => {
	assert.equal(exportFileName("fall-creek", "2026-10-08"), "fall-creek-observations-2026-10-08.zip");
	assert.equal(zonesFileName("fall-creek", 3), "fall-creek-zones-v3.geojson");
});

test("the scope reads as lines: each filter, how zones match, and days with their exact bounds", () => {
	assert.deepEqual(scopeLines(all, ny), ["All sites", "All rounds", "All days"]);
	assert.deepEqual(
		scopeLines(
			{
				site: "Fall Creek",
				zones: ["North meadow", "Swings"],
				version: null,
				round: "inventory",
				observer: "OB",
				from: "2026-11-01",
				to: "2026-11-01"
			},
			ny
		),
		[
			"Site: Fall Creek",
			"Zones: North meadow, Swings · every map version, by the zone's identity",
			"Inventory round",
			"Observer: OB",
			// The 25-hour day: from 04:00 UTC to 05:00 UTC the next day.
			"Days: Nov 01, 2026 to Nov 01, 2026 in America/New_York (from 2026-11-01T04:00:00.000Z before 2026-11-02T05:00:00.000Z, UTC)"
		]
	);
	assert.equal(
		scopeLines({ ...all, site: "Fall Creek", zones: ["North meadow"], version: 2 }, ny)[1],
		"Zone: North meadow · only what was recorded on map v2"
	);
	assert.equal(
		scopeLines({ ...all, from: "2026-10-01" }, ny).at(-1),
		"Days: Oct 01, 2026 to the newest observation in America/New_York (from 2026-10-01T04:00:00.000Z, UTC)"
	);
});

test("one map version's zone boundaries are GeoJSON features joined by identity and version", () => {
	const geometry = {
		type: "MultiPolygon",
		coordinates: [
			[
				[
					[0, 0],
					[2, 0],
					[2, 2],
					[0, 0]
				],
				[
					[0.5, 0.2],
					[1, 0.2],
					[1, 0.5],
					[0.5, 0.2]
				]
			]
		]
	};
	const collection = JSON.parse(
		zonesGeoJson(
			{
				site_id: uuid(1),
				package_id: uuid(102),
				package_version: 2,
				zones: [{ zone_id: uuid(201), zone_code: "A", zone_label: "Meadow", geometry, display_anchor: [1, 1] }]
			},
			"fall-creek"
		)
	);
	assert.equal(collection.type, "FeatureCollection");
	const [feature] = collection.features;
	assert.equal(feature.id, uuid(201));
	assert.deepEqual(feature.geometry, geometry, "holes and parts are kept exactly");
	assert.deepEqual(feature.properties, {
		zone_id: uuid(201),
		zone_code: "A",
		zone_label: "Meadow",
		site_id: uuid(1),
		site_code: "fall-creek",
		package_id: uuid(102),
		map_version: 2
	});
});
