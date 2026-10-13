import assert from "node:assert/strict";
import test from "node:test";

import { uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const { changeRows, changeSummary, hatchedZones, publishedLine, publishRequestKey, publishUnavailable } = await load(
	"features/zones/publish/model.ts"
);

const A = uuid(301);
const B = uuid(302);
const C = uuid(303);
const D = uuid(304);
const zone = (id, code, label) => ({ zone_id: id, zone_code: code, zone_label: label, geometry: null });
const check = changes => ({
	draft_id: uuid(501),
	revision: 6,
	ready: true,
	issues: [],
	warnings: [],
	site_gap_area_m2: null,
	zones: changes.map(([zone_id, change]) => ({
		zone_id,
		change,
		area_m2: 10,
		geometry_sha256: "g",
		display_anchor: null,
		extent: null
	}))
});

test("changes are DECA Mark's classification of this revision, changed zones first", () => {
	const rows = changeRows(
		check([
			[A, "unchanged"],
			[B, "geometry_changed"],
			[C, "removed"],
			[D, "added"]
		]),
		[zone(A, "A", "Lawn"), zone(B, "B", "Slide"), zone(D, "D", "")],
		[zone(A, "A", "Lawn"), zone(B, "B", "Slide"), zone(C, "C", "Swings")]
	);
	assert.deepEqual(
		rows.map(row => [row.name, row.change]),
		[
			["Slide", "geometry_changed"],
			["D", "added"],
			["Swings", "removed"],
			["Lawn", "unchanged"]
		]
	);
	assert.equal(changeSummary(rows, 1), "1 boundary changed · 1 new zone · 1 removed");
	assert.deepEqual([...hatchedZones(rows)].sort(), [B, D].sort());
	assert.equal(changeSummary([], 1), "No changes from v1");
	// A zone the check did not classify is left out rather than guessed.
	assert.deepEqual(changeRows(check([[A, null]]), [zone(A, "A", "Lawn")], []), []);
});

test("publishing waits for a saved, checked, ready, current and confirmed revision", () => {
	const ready = {
		ready: true,
		checkedRevision: 6,
		revision: 6,
		unsaved: false,
		stale: false,
		confirmed: true,
		blocking: 0
	};
	assert.equal(publishUnavailable(ready), null);
	assert.match(publishUnavailable({ ...ready, stale: true }), /not based on the current version/);
	assert.match(publishUnavailable({ ...ready, unsaved: true }), /until your changes are saved/);
	assert.match(publishUnavailable({ ...ready, checkedRevision: 5 }), /checked this revision/);
	assert.match(publishUnavailable({ ...ready, ready: false, blocking: 2 }), /Fix the problems/);
	assert.match(publishUnavailable({ ...ready, confirmed: false }), /Confirm/);
	assert.equal(publishRequestKey(uuid(501), 6), `zone-publish:${uuid(501)}:6`);
});

test("a publication's answer never claims a replay is current when it is not", () => {
	const publication = (replayed, current) => ({
		site_id: uuid(1),
		draft_id: uuid(501),
		package: { package_id: uuid(102), package_version: 2 },
		current_package_id: current,
		replayed
	});
	assert.deepEqual(publishedLine(publication(false, uuid(102))), {
		title: "v2 is published.",
		body: "Observers use it after they download it in the DECA Mark app."
	});
	assert.equal(publishedLine(publication(true, uuid(102))).body, "v2 is the current version.");
	assert.deepEqual(publishedLine(publication(true, uuid(103))), {
		title: "This draft was already published as v2.",
		body: "A later version is current now."
	});
});
