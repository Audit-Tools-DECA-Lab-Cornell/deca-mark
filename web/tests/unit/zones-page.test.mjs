import assert from "node:assert/strict";
import test from "node:test";

import { uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const { draftRows, othersNote, ownDraft, restoreNote, versionRows, zoneEntry, zoneTableRows } =
	await load("features/zones/model.ts");
const { clock } = await load("lib/time.ts");

const ny = clock("America/New_York");
const ME = uuid(901);
const JL = uuid(902);
const V1 = uuid(100);
const V2 = uuid(101);

function summary(overrides = {}) {
	return {
		draft_id: uuid(501),
		site_id: uuid(1),
		base_package_id: V2,
		base_package_version: 2,
		current_package_id: V2,
		current_package_version: 2,
		state: "draft",
		revision: 4,
		etag: '"e"',
		change_note: "",
		forms: { play: { form_version_id: uuid(800), form_version: "play-v1" }, inventory: null },
		published_package_id: null,
		created_at: "2026-10-13T14:00:00Z",
		created_by: ME,
		created_by_name: "Me",
		updated_at: "2026-10-13T15:32:00Z",
		updated_by: ME,
		updated_by_name: "Me",
		...overrides
	};
}

const context = { userId: ME, currentPackageId: V2, clock: ny };

test("a site's zone entry follows its package and whether the web can edit it", () => {
	assert.equal(zoneEntry({ current_package_id: null, zone_editing_available: false }), "no-package");
	assert.equal(zoneEntry({ current_package_id: V1, zone_editing_available: false }), "unavailable");
	assert.equal(zoneEntry({ current_package_id: V1, zone_editing_available: true }), "editable");
});

test("open drafts: newest edit first, whose they are, and whether their base is still current", () => {
	const rows = draftRows(
		[
			summary({ draft_id: uuid(501), updated_at: "2026-10-13T15:00:00Z" }),
			summary({
				draft_id: uuid(502),
				created_by: JL,
				created_by_name: "JL",
				updated_by: JL,
				updated_by_name: "JL",
				updated_at: "2026-10-13T15:40:00Z"
			}),
			summary({ draft_id: uuid(503), base_package_id: V1, base_package_version: 1 }),
			summary({ draft_id: uuid(504), state: "published" })
		],
		context
	);
	assert.deepEqual(
		rows.map(row => [row.draftId, row.owner, row.basedOn, row.stale]),
		[
			[uuid(502), "JL’s draft", "Based on v2", false],
			[uuid(503), "Your draft", "Based on v1 · v2 is current", true],
			[uuid(501), "Your draft", "Based on v2", false]
		]
	);
	assert.match(rows[0].edited, /^Edited .* by JL$/);
	assert.match(rows[2].edited, /by you$/);
	// The manager's own draft on the current version is the one to open; a stale one is not.
	assert.equal(ownDraft(rows).draftId, uuid(501));
	assert.equal(ownDraft(rows.filter(row => row.draftId !== uuid(501))), null);
});

test("starting a draft says who else has one on the same version", () => {
	assert.equal(othersNote([summary()], context), null);
	const jl = summary({ created_by: JL, created_by_name: "JL" });
	assert.match(
		othersNote([jl], context),
		/^JL has a draft based on v2, edited .*\. Both can be edited, but only the first one published becomes v3\.$/
	);
	assert.match(
		othersNote([jl, summary({ draft_id: uuid(509), created_by: uuid(903), created_by_name: null })], context),
		/^2 other managers have drafts based on v2\. All can be edited/
	);
	// A draft on an older version, or one already published, is not in the way.
	assert.equal(othersNote([summary({ created_by: JL, base_package_id: V1 })], context), null);
	assert.equal(othersNote([summary({ created_by: JL, state: "discarded" })], context), null);
});

test("each zone's shape is counted in parts and holes", () => {
	const ring = [
		[0, 0],
		[1, 0],
		[1, 1],
		[0, 0]
	];
	const rows = zoneTableRows([
		{ zone_id: "a", zone_code: "A", zone_label: "Lawn", geometry: { type: "Polygon", coordinates: [ring] } },
		{
			zone_id: "b",
			zone_code: "B",
			zone_label: "Beds",
			geometry: { type: "MultiPolygon", coordinates: [[ring, ring], [ring]] }
		}
	]);
	assert.deepEqual(
		rows.map(row => row.shape),
		["1 part", "2 parts · 1 hole"]
	);
});

test("versions: ready ones newest first, each replaced by the next, and how each was made", () => {
	const rows = versionRows([
		{ packageId: V1, version: 1, state: "archived", prepared: "Oct 10", source: "upload", changeNote: "" },
		{ packageId: uuid(102), version: 3, state: "blocked", prepared: "Oct 12", source: "upload", changeNote: "" },
		{ packageId: V2, version: 2, state: "current", prepared: "Oct 11", source: "draft", changeNote: "Smaller lawn" }
	]);
	assert.deepEqual(
		rows.map(row => [row.version, row.current, row.replacedBy, row.madeBy, row.changeNote]),
		[
			[2, true, null, "Drawn on the web", "Smaller lawn"],
			[1, false, "Replaced by v2", "Imported from QGIS", ""]
		]
	);
	assert.equal(restoreNote(1), "Restores v1 boundaries");
});
