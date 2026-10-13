import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";

const q = await load("features/zones/editor/save-queue.ts");

const ID = "30000000-0000-4000-8000-000000000001";
const DRAFT = "50000000-0000-4000-8000-000000000001";
const square = size => ({
	type: "Polygon",
	coordinates: [
		[
			[0, 0],
			[size, 0],
			[size, size],
			[0, size],
			[0, 0]
		]
	]
});
const zones = (size, label = "North meadow") => [
	{ zone_id: ID, zone_code: "NM", zone_label: label, geometry: square(size) }
];
const etag = revision => `"zone-draft:${DRAFT}:${revision}"`;

/** A draft as the server returns it. */
const saved = (revision, zoneList, overrides = {}) => ({
	revision,
	etag: etag(revision),
	state: "draft",
	zones: zoneList,
	changeNote: "",
	updatedAt: "2026-10-12T15:32:00Z",
	updatedBy: "JL",
	publishedPackageId: null,
	...overrides
});

const time = iso => iso.slice(11, 16);

/** Applies events in order, collecting the commands. */
function play(queue, ...events) {
	const commands = [];
	for (const event of events) {
		const result = q.queueReducer(queue, event);
		queue = result.queue;
		if (result.command) commands.push(result.command);
	}
	return { queue, commands };
}

const edit = (zoneList, invalid = null) => ({ type: "edited", local: { zones: zoneList, changeNote: "" }, invalid });
const fresh = () => q.createQueue(saved(6, zones(0.01)));

test("an unchanged draft is never sent, and the status says where it is saved", () => {
	const { queue, commands } = play(fresh(), { type: "flush" });
	assert.deepEqual(commands, []);
	assert.deepEqual(q.saveStatus(queue, time), { text: "Saved to the draft · 15:32 · revision 6", live: null });
	// An edit undone back to the saved shape is no change either.
	assert.deepEqual(play(queue, edit(zones(0.02)), edit(zones(0.01)), { type: "flush" }).commands, []);
});

test("success: one PUT with If-Match, then the sent snapshot is acknowledged with the new revision", () => {
	const local = zones(0.02);
	let { queue, commands } = play(fresh(), edit(local));
	assert.equal(q.saveStatus(queue, time).text, "Unsaved changes");
	({ queue, commands } = play(queue, { type: "flush" }));
	assert.deepEqual(commands, [{ type: "put", seq: 1, snapshot: { zones: local, changeNote: "" }, etag: etag(6) }]);
	assert.equal(q.saveStatus(queue, time).text, "Saving…");
	({ queue, commands } = play(queue, { type: "put-ok", seq: 1, draft: saved(7, local) }));
	assert.deepEqual(commands, []);
	assert.equal(queue.acknowledged.revision, 7);
	assert.equal(queue.acknowledged.etag, etag(7));
	assert.equal(queue.acknowledged.zones, local);
	assert.equal(q.saveStatus(queue, time).text, "Saved to the draft · 15:32 · revision 7");
});

test("dirty after flight: edits during a save wait, then go with the new ETag", () => {
	const first = zones(0.02);
	const second = zones(0.03);
	const { queue, commands } = play(
		fresh(),
		edit(first),
		{ type: "flush" },
		edit(second),
		{ type: "flush" },
		{ type: "put-ok", seq: 1, draft: saved(7, first) }
	);
	assert.deepEqual(
		commands.map(command => [command.type, command.seq, command.etag]),
		[
			["put", 1, etag(6)],
			["put", 2, etag(7)]
		],
		"only one PUT in flight; the second follows the first"
	);
	assert.equal(queue.inFlight.snapshot.zones, second);
});

test("a late response for an earlier request never rolls the draft back", () => {
	const { queue } = play(
		fresh(),
		edit(zones(0.02)),
		{ type: "flush" },
		{ type: "put-ok", seq: 9, draft: saved(3, zones(0.5)) }
	);
	assert.equal(queue.acknowledged.revision, 6);
	assert.equal(queue.inFlight.seq, 1);
	const failed = play(queue, { type: "put-failed", seq: 8, failure: { kind: "http", status: 412 } }).queue;
	assert.equal(failed.pause, null);
});

test("a structurally invalid draft is not sent, and says why", () => {
	const { queue, commands } = play(fresh(), edit(zones(0.02, ""), "North meadow needs a name."), { type: "flush" });
	assert.deepEqual(commands, []);
	assert.deepEqual(q.saveStatus(queue, time), { text: "Not saved yet · North meadow needs a name.", live: "polite" });
});

const inFlight = () => play(fresh(), edit(zones(0.02)), { type: "flush" }).queue;
const fail = (queue, failure) => play(queue, { type: "put-failed", seq: 1, failure });

test("412: saving stops, the saved draft is read to show who saved, and both choices work", () => {
	let { queue, commands } = fail(inFlight(), { kind: "http", status: 412, code: "revision_conflict" });
	assert.deepEqual(commands, [{ type: "get", seq: 2, reason: "conflict" }]);
	assert.equal(queue.pause.kind, "conflict");
	const theirs = saved(8, zones(0.04), { updatedBy: "JL", updatedAt: "2026-10-12T15:40:00Z" });
	({ queue } = play(queue, { type: "get-ok", seq: 2, draft: theirs }, edit(zones(0.025)), { type: "flush" }));
	assert.deepEqual(q.saveStatus(queue, time), {
		text: "Not saved · JL saved this draft at 15:40",
		live: "assertive"
	});
	assert.equal(queue.inFlight, null, "nothing more is sent while the conflict stands");
	// "Replace the saved draft with my edits": an explicit PUT on their revision.
	const mine = play(queue, { type: "keep-mine" });
	assert.deepEqual(
		mine.commands.map(command => [command.type, command.etag]),
		[["put", etag(8)]]
	);
	// "Discard my edits and load the saved draft".
	const taken = play(queue, { type: "take-saved" }).queue;
	assert.equal(taken.local.zones, theirs.zones);
	assert.equal(taken.acknowledged.revision, 8);
	assert.equal(taken.pause, null);
});

test("409: the draft was published or discarded elsewhere; it is read back and closed", () => {
	let { queue, commands } = fail(inFlight(), { kind: "http", status: 409, code: "conflict" });
	assert.deepEqual(commands, [{ type: "get", seq: 2, reason: "closed" }]);
	({ queue } = play(queue, {
		type: "get-ok",
		seq: 2,
		draft: saved(9, zones(0.01), { state: "published", publishedPackageId: "20000000-0000-4000-8000-000000000002" })
	}));
	assert.equal(queue.pause.kind, "closed");
	assert.equal(queue.pause.server.publishedPackageId, "20000000-0000-4000-8000-000000000002");
	assert.equal(q.saveStatus(queue, time).text, "Not saved · this draft was published.");
	assert.deepEqual(play(queue, edit(zones(0.07)), { type: "flush" }).commands, []);
});

test("428: a client defect; the draft is reloaded with edits kept, and the request is named", () => {
	let { queue, commands } = fail(inFlight(), {
		kind: "http",
		status: 428,
		code: "precondition_required",
		requestId: "req-1"
	});
	assert.deepEqual(commands, [{ type: "get", seq: 2, reason: "reload" }]);
	({ queue } = play(queue, { type: "get-ok", seq: 2, draft: saved(6, zones(0.01)) }));
	assert.equal(queue.pause.kind, "precondition");
	assert.equal(queue.pause.requestId, "req-1");
	assert.equal(queue.local.zones[0].geometry.coordinates[0][1][0], 0.02, "edits kept");
	assert.equal(play(queue, { type: "keep-mine" }).commands[0].etag, etag(6));
});

test("413 and too_complex: too large; other 422s list their issues until the next edit", () => {
	for (const failure of [
		{ kind: "http", status: 413, code: "payload_too_large" },
		{
			kind: "http",
			status: 422,
			code: "validation_failed",
			issues: [{ code: "too_complex", zoneIds: [ID], path: "/zones/0" }]
		}
	]) {
		const { queue } = fail(inFlight(), failure);
		assert.equal(queue.pause.kind, "too-large");
		assert.match(q.saveStatus(queue, time).text, /larger than DECA Mark accepts/);
		assert.equal(play(queue, { type: "flush" }).queue.inFlight, null, "not resent unchanged");
		// An edit that is still over the limits stays held back by the structural check.
		const over = play(queue, edit(zones(0.03), "This draft has more than 2,000 points in one zone."), {
			type: "flush"
		});
		assert.deepEqual(over.commands, []);
		// A smaller draft saves again.
		const resumed = play(over.queue, edit(zones(0.03)), { type: "flush" });
		assert.deepEqual(
			resumed.commands.map(command => [command.type, command.etag]),
			[["put", etag(6)]]
		);
	}
	const issues = [{ code: "invalid_structure", zoneIds: [ID], path: "/zones/0/geometry" }];
	let { queue } = fail(inFlight(), { kind: "http", status: 422, code: "validation_failed", issues });
	assert.deepEqual(queue.pause, { kind: "rejected", issues });
	({ queue } = play(queue, { type: "flush" }));
	assert.equal(queue.inFlight, null, "not resent unchanged");
	const resumed = play(queue, edit(zones(0.03)), { type: "flush" });
	assert.equal(resumed.commands[0].type, "put");
});

test("401: paused until signed in again, then sent", () => {
	let { queue } = fail(inFlight(), { kind: "http", status: 401, code: "token_invalid" });
	assert.equal(
		q.saveStatus(queue, time).text,
		"Not saved · you were signed out. Sign in again in another tab, then come back to save."
	);
	assert.deepEqual(play(queue, { type: "flush" }).commands, []);
	const back = play(queue, { type: "signed-in" });
	assert.deepEqual(
		back.commands.map(command => command.type),
		["put"]
	);
});

test("403 and 404: no access; edits stay in memory and nothing more is sent", () => {
	for (const status of [403, 404]) {
		const { queue } = fail(inFlight(), { kind: "http", status });
		assert.equal(queue.pause.kind, "no-access");
		assert.equal(queue.local.zones[0].geometry.coordinates[0][1][0], 0.02);
		assert.deepEqual(play(queue, edit(zones(0.05)), { type: "flush" }).commands, []);
	}
});

test("unconfirmed then acknowledged: the read shows the save landed", () => {
	let { queue, commands } = fail(inFlight(), { kind: "network" });
	assert.deepEqual(commands, [{ type: "get", seq: 2, reason: "verify" }]);
	assert.equal(q.saveStatus(queue, time).text, "Checking whether your last change was saved…");
	({ queue, commands } = play(queue, { type: "get-ok", seq: 2, draft: saved(7, zones(0.02)) }));
	assert.deepEqual(commands, []);
	assert.equal(queue.pause, null);
	assert.equal(queue.acknowledged.revision, 7);
});

test("unconfirmed then not saved: same revision, so it is sent again", () => {
	const { commands } = play(fail(inFlight(), { kind: "http", status: 502 }).queue, {
		type: "get-ok",
		seq: 2,
		draft: saved(6, zones(0.01))
	});
	assert.deepEqual(
		commands.map(command => [command.type, command.etag]),
		[["put", etag(6)]]
	);
});

test("unconfirmed then conflict: another revision is someone else's save", () => {
	const { queue } = play(fail(inFlight(), { kind: "network" }).queue, {
		type: "get-ok",
		seq: 2,
		draft: saved(7, zones(0.09), { updatedBy: "AK" })
	});
	assert.equal(queue.pause.kind, "conflict");
	assert.equal(queue.pause.server.updatedBy, "AK");
});

test("a failed read keeps checking: the next flush reads again", () => {
	const { queue } = play(fail(inFlight(), { kind: "network" }).queue, {
		type: "get-failed",
		seq: 2,
		failure: { kind: "network" }
	});
	assert.equal(queue.pause.kind, "unconfirmed");
	assert.deepEqual(play(queue, { type: "flush" }).commands, [{ type: "get", seq: 3, reason: "verify" }]);
});

test("a failed read after a conflict, a refused precondition or a closed draft is read again", () => {
	for (const [status, reason, kind] of [
		[412, "conflict", "conflict"],
		[428, "reload", "precondition"],
		[409, "closed", "closed"]
	]) {
		let { queue, commands } = fail(inFlight(), { kind: "http", status });
		assert.deepEqual(commands, [{ type: "get", seq: 2, reason }]);
		// The read gets no answer: the pause stays, without the saved draft, and nothing is sent.
		({ queue, commands } = play(queue, { type: "get-failed", seq: 2, failure: { kind: "http", status: 503 } }));
		assert.equal(queue.pause.kind, kind);
		assert.equal(queue.pause.server, null);
		assert.deepEqual(commands, []);
		// The next flush reads again; the answer lets the manager choose.
		({ queue, commands } = play(queue, { type: "flush" }));
		assert.deepEqual(commands, [{ type: "get", seq: 3, reason }]);
		({ queue } = play(queue, { type: "get-ok", seq: 3, draft: saved(8, zones(0.04)) }));
		assert.ok(queue.pause.server, `${kind}: the saved draft is read`);
		// Reconnecting reads again too, after a read lost to the connection.
		({ queue } = play(
			fail(inFlight(), { kind: "http", status }).queue,
			{ type: "get-failed", seq: 2, failure: { kind: "network" } },
			{ type: "offline" }
		));
		assert.deepEqual(play(queue, { type: "flush" }).commands, [], "no read while offline");
		assert.deepEqual(play(queue, { type: "online" }).commands, [{ type: "get", seq: 3, reason }]);
	}
	// Once the saved draft is in hand, a flush reads nothing more.
	const { queue } = play(
		fail(inFlight(), { kind: "http", status: 412 }).queue,
		{ type: "get-ok", seq: 2, draft: saved(8, zones(0.04)) },
		edit(zones(0.05))
	);
	assert.deepEqual(play(queue, { type: "flush" }).commands, []);
});

test("offline: nothing is sent; a save lost to the connection is checked on reconnecting", () => {
	let { queue, commands } = play(fresh(), { type: "offline" }, edit(zones(0.02)), { type: "flush" });
	assert.deepEqual(commands, []);
	assert.match(q.saveStatus(queue, time).text, /^You are offline\. Your changes stay in this tab/);
	({ commands } = play(queue, { type: "online" }));
	assert.deepEqual(
		commands.map(command => command.type),
		["put"]
	);
	// The connection drops with a save in flight: no read while offline, then a check on reconnecting.
	({ queue } = play(inFlight(), { type: "offline" }, { type: "put-failed", seq: 1, failure: { kind: "network" } }));
	assert.equal(queue.pause.kind, "unconfirmed");
	assert.equal(queue.reading, null);
	({ commands } = play(queue, { type: "online" }));
	assert.deepEqual(commands, [{ type: "get", seq: 2, reason: "verify" }]);
});

test("429: saving waits for Retry-After, then the next flush sends", () => {
	const { queue } = fail(inFlight(), { kind: "http", status: 429, retryAfter: 20 });
	assert.equal(q.saveStatus(queue, time).text, "Saving paused for 20 s.");
	assert.deepEqual(
		play(queue, { type: "flush" }).commands.map(command => command.type),
		["put"]
	);
});

test("the server's echo is compared after its normalisation; a mismatch keeps local and names the request", () => {
	const sent = [{ ...zones(0.02)[0], zone_label: "  North meadow  " }];
	let { queue } = play(
		fresh(),
		edit(sent),
		{ type: "flush" },
		{ type: "put-ok", seq: 1, draft: saved(7, zones(0.02)), requestId: "req-a" }
	);
	assert.equal(queue.echoMismatch, null);
	({ queue } = play(
		queue,
		edit(zones(0.03)),
		{ type: "flush" },
		{ type: "put-ok", seq: 2, draft: saved(8, zones(0.99)), requestId: "req-b" }
	));
	assert.equal(queue.echoMismatch, "req-b");
	assert.equal(queue.local.zones[0].geometry.coordinates[0][1][0], 0.03);
});

test("on mount, a newer server draft is adopted; a published one opens closed", () => {
	const newer = play(fresh(), { type: "mounted", draft: saved(9, zones(0.05)) }).queue;
	assert.equal(newer.acknowledged.revision, 9);
	assert.equal(newer.local.zones[0].geometry.coordinates[0][1][0], 0.05);
	const older = play(fresh(), { type: "mounted", draft: saved(5, zones(0.05)) }).queue;
	assert.equal(older.acknowledged.revision, 6);
	const published = play(fresh(), { type: "mounted", draft: saved(9, zones(0.05), { state: "published" }) }).queue;
	assert.equal(published.pause.kind, "closed");
	assert.equal(q.createQueue(saved(3, zones(0.01), { state: "discarded" })).pause.kind, "closed");
});
