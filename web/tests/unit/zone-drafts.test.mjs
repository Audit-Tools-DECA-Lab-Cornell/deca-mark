import assert from "node:assert/strict";
import test from "node:test";

import { uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const q = await load("features/zones/editor/save-queue.ts");
const { canCheck, checkIsCurrent, checkLine, checkProblems, checkUnavailable } = await load(
	"features/zones/editor/checks.ts"
);
const { differingZones, draftFileName, draftGeoJson, nameList } = await load("features/zones/editor/conflict.ts");
const { queueFailure } = await load("features/zones/editor/failure.ts");
const { historicalDraftZones, historicalZonesSchema, savedDraft, zoneDraftSchema, zoneValidationSchema } =
	await load("lib/zones/schemas.ts");
const { siteBoundaryOf } = await load("lib/sites/archive.ts");
const { ApiError, parseApiError } = await load("lib/api/errors.ts");
const { guardedPush, holdNavigation } = await load("features/shell/navigationGuard.ts");
const { CHORD_TIMEOUT, chordPending, endChord, startChord } = await load("lib/shortcuts.ts");
const { createPlanMemo } = await load("features/data/plans.ts");

const NM = uuid(301);
const SL = uuid(302);
const DRAFT = uuid(501);
const square = (size, at = 0) => ({
	type: "Polygon",
	coordinates: [
		[
			[at, 0],
			[at + size, 0],
			[at + size, size],
			[at, size],
			[at, 0]
		]
	]
});
const zone = (id, code, label, geometry) => ({ zone_id: id, zone_code: code, zone_label: label, geometry });
const meadow = zone(NM, "NM", "North meadow", square(0.01));
const slide = zone(SL, "SL", "Slide", square(0.01, 0.02));

/** A draft as the API sends it. */
function wire(overrides = {}) {
	return {
		draft_id: DRAFT,
		site_id: uuid(1),
		base_package_id: uuid(100),
		base_package_version: 1,
		current_package_id: uuid(100),
		current_package_version: 1,
		state: "draft",
		revision: 6,
		etag: `"zone-draft:${DRAFT}:6"`,
		change_note: "",
		forms: { play: { form_version_id: uuid(800), form_version: "play-v1" }, inventory: null },
		published_package_id: null,
		created_at: "2026-10-12T15:00:00Z",
		created_by: uuid(901),
		created_by_name: "JL",
		updated_at: "2026-10-12T15:32:00Z",
		updated_by: uuid(901),
		updated_by_name: "JL",
		zones: [meadow, slide],
		...overrides
	};
}

test("a draft is read strictly and becomes the queue's saved draft", () => {
	const parsed = zoneDraftSchema.parse(wire());
	assert.deepEqual(savedDraft(parsed), {
		zones: [meadow, slide],
		changeNote: "",
		revision: 6,
		etag: `"zone-draft:${DRAFT}:6"`,
		state: "draft",
		updatedAt: "2026-10-12T15:32:00Z",
		updatedBy: "JL",
		publishedPackageId: null
	});
	// A ring that does not close, or has fewer than three distinct points, is a failed read, never repaired.
	const open = {
		type: "Polygon",
		coordinates: [
			[
				[0, 0],
				[1, 0],
				[1, 1],
				[0, 1]
			]
		]
	};
	assert.equal(zoneDraftSchema.safeParse(wire({ zones: [zone(NM, "NM", "North meadow", open)] })).success, false);
	assert.equal(zoneDraftSchema.safeParse(wire({ state: "archived" })).success, false);
});

test("a check and a map version's zones are read before use", () => {
	const validation = zoneValidationSchema.parse({
		draft_id: DRAFT,
		revision: 6,
		ready: false,
		issues: [{ code: "interior_overlap", zone_ids: [NM, SL], path: "/zones/1/geometry" }],
		warnings: [{ code: "site_gap", message: "x" }],
		site_gap_area_m2: 12,
		zones: [
			{
				zone_id: NM,
				change: "unchanged",
				area_m2: 10,
				geometry_sha256: "a",
				display_anchor: [0, 0],
				extent: null
			}
		]
	});
	assert.deepEqual(validation.warnings[0], { code: "site_gap", message: "x", path: "", zone_ids: [] });
	const historical = historicalZonesSchema.parse({
		site_id: uuid(1),
		package_id: uuid(100),
		package_version: 1,
		zones: [{ ...meadow, geometry_sha256: "g", display_anchor: [0.005, 0.005] }]
	});
	assert.deepEqual(historicalDraftZones(historical), [meadow]);
});

test("DECA Mark's findings read as the editor's problems, for the revision they were made for", () => {
	const validation = zoneValidationSchema.parse({
		draft_id: DRAFT,
		revision: 6,
		ready: false,
		issues: [{ code: "interior_overlap", zone_ids: [NM, SL] }],
		warnings: [{ code: "small_zone", zone_ids: [SL] }],
		site_gap_area_m2: null,
		zones: []
	});
	const problems = checkProblems(validation, [meadow, slide]);
	assert.deepEqual(
		problems.map(problem => [problem.kind, problem.zoneId, problem.address]),
		[
			["checked", NM, null],
			["warning", SL, null]
		]
	);
	assert.match(problems[0].text, /^North meadow and Slide overlap\./);
	assert.match(problems[1].text, /^Slide is smaller than 1 m²/);

	const queue = q.createQueue(savedDraft(zoneDraftSchema.parse(wire())));
	const check = { revision: 6, checkedAt: "2026-10-12T15:33:00Z", validation };
	const time = iso => iso.slice(11, 16);
	assert.equal(
		checkLine(check, checkIsCurrent(check, queue), time),
		"Checked revision 6 at 15:33 · 1 problem · 1 warning"
	);
	const edited = q.queueReducer(queue, {
		type: "edited",
		local: { zones: [meadow], changeNote: "" },
		invalid: null
	}).queue;
	assert.equal(checkIsCurrent(check, edited), false);
	assert.match(checkLine(check, false, time), /the draft has changed since, so it is checked again once saved$/);
	assert.equal(
		checkLine({ ...check, validation: { ...validation, issues: [], warnings: [] } }, true, time),
		"Checked revision 6 at 15:33 · nothing found"
	);
});

test("a check waits until the draft in this tab is the one saved", () => {
	const queue = q.createQueue(savedDraft(zoneDraftSchema.parse(wire())));
	assert.equal(canCheck(queue), true);
	assert.equal(checkUnavailable(queue), null);
	const dirty = q.queueReducer(queue, {
		type: "edited",
		local: { zones: [meadow], changeNote: "" },
		invalid: null
	}).queue;
	assert.equal(canCheck(dirty), false);
	assert.equal(checkUnavailable(dirty), "Checking waits until your changes are saved.");
	const sending = q.queueReducer(dirty, { type: "flush" });
	assert.equal(sending.command.type, "put");
	assert.equal(canCheck(sending.queue), false);
	assert.equal(checkUnavailable(q.queueReducer(queue, { type: "offline" }).queue), "Checking needs a connection.");
});

test("a check refused as stale while nothing is saving reads the draft as a conflict", () => {
	const queue = q.createQueue(savedDraft(zoneDraftSchema.parse(wire())));
	const stale = q.queueReducer(queue, { type: "stale" });
	assert.deepEqual(stale.command, { type: "get", seq: 1, reason: "conflict" });
	assert.equal(stale.queue.pause.kind, "conflict");
	// The saved draft arrives: the conflict holds it, and the edits stay.
	const theirs = savedDraft(zoneDraftSchema.parse(wire({ revision: 7, etag: '"r7"', zones: [meadow] })));
	const read = q.queueReducer(stale.queue, { type: "get-ok", seq: 1, draft: theirs });
	assert.equal(read.queue.pause.kind, "conflict");
	assert.equal(read.queue.pause.server.revision, 7);
	// While something is saving, a stale check changes nothing.
	const sending = q.queueReducer(
		q.queueReducer(queue, { type: "edited", local: { zones: [meadow], changeNote: "" }, invalid: null }).queue,
		{ type: "flush" }
	).queue;
	assert.equal(q.queueReducer(sending, { type: "stale" }).queue, sending);
});

test("a failed request reads as an answer with its status, a signed-out session, or no answer", () => {
	const refused = parseApiError(
		412,
		{ error: { code: "revision_conflict", message: "x", details: { revision: 7 } } },
		new Headers({ "X-Request-Id": "req-1" })
	);
	assert.deepEqual(queueFailure(refused), {
		kind: "http",
		status: 412,
		code: "revision_conflict",
		issues: [],
		requestId: "req-1"
	});
	const throttled = parseApiError(
		429,
		{ error: { code: "rate_limited", message: "x" } },
		new Headers({ "Retry-After": "20" })
	);
	assert.equal(queueFailure(throttled).retryAfter, 20);
	assert.deepEqual(queueFailure(new ApiError("token_invalid", "sign-in")), {
		kind: "http",
		status: 401,
		code: "token_invalid"
	});
	assert.deepEqual(queueFailure(new ApiError("storage_unavailable", "retry")), { kind: "network" });
	assert.deepEqual(queueFailure(new TypeError("fetch failed")), { kind: "network" });
});

test("a conflict names the zones that differ, and the edits can be kept as a file", () => {
	const moved = zone(NM, "NM", "North meadow", square(0.02));
	assert.deepEqual(differingZones([meadow, slide], [meadow, slide]), []);
	assert.deepEqual(differingZones([moved, slide], [meadow]), ["North meadow", "Slide"]);
	assert.deepEqual(differingZones([meadow], [meadow, slide]), ["Slide"]);
	assert.deepEqual(differingZones([{ ...meadow, zone_label: " North meadow " }], [meadow]), []);
	assert.equal(nameList(["A", "B"]), "A and B");
	assert.equal(nameList(["A", "B", "C", "D", "E"]), "A, B, C and 2 more");
	const file = JSON.parse(draftGeoJson([meadow]));
	assert.equal(file.type, "FeatureCollection");
	assert.deepEqual(file.features[0].properties, { zone_id: NM, zone_code: "NM", zone_label: "North meadow" });
	assert.deepEqual(file.features[0].geometry, meadow.geometry);
	assert.equal(draftFileName("fall-creek", 6), "fall-creek-zones-draft-r6.geojson");
});

test("the site boundary is read from a package's site features exactly", () => {
	const rings = square(1).coordinates;
	const collection = {
		features: [
			{ properties: { kind: "site", id: "site-1" }, geometry: { type: "Polygon", coordinates: rings } },
			{
				properties: { kind: "site", id: "site-2" },
				geometry: { type: "MultiPolygon", coordinates: [rings, rings] }
			},
			{ properties: { kind: "zone", id: "z" }, geometry: { type: "Polygon", coordinates: rings } }
		]
	};
	const boundary = siteBoundaryOf(collection);
	assert.equal(boundary.length, 3);
	assert.equal(boundary[0], rings);
});

test("shell navigation asks a page with unsaved changes first, and a g chord owns its second key", () => {
	const pushed = [];
	const router = { push: href => pushed.push(href) };
	guardedPush(router, "/a");
	const asked = [];
	const release = holdNavigation(href => asked.push(href));
	guardedPush(router, "/b");
	release();
	guardedPush(router, "/c");
	assert.deepEqual(pushed, ["/a", "/c"]);
	assert.deepEqual(asked, ["/b"]);

	startChord(1000);
	assert.equal(chordPending(1000 + CHORD_TIMEOUT - 1), true);
	assert.equal(chordPending(1000 + CHORD_TIMEOUT), false);
	startChord(1000);
	endChord();
	assert.equal(chordPending(1001), false);
});

test("another account signing in forgets every kept plan", () => {
	const memo = createPlanMemo();
	memo.remember("u1:p:k", { name: "v1" });
	memo.clear();
	assert.equal(memo.recall("u1:p:k"), null);
});
