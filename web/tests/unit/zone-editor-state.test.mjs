import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { load } from "./support.mjs";

const editor = await load("features/zones/editor/state.ts");
const history = await load("features/zones/editor/history.ts");
const plan = await load("lib/plan.ts");

const cases = JSON.parse(
	readFileSync(new URL("../../../contracts/zones/geometry.cases.json", import.meta.url), "utf8")
);
const shape = alias => structuredClone(cases.geometries[alias]);
const ID = n => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const zone = (n, alias, label = `Zone ${n}`) => ({
	zone_id: ID(n),
	zone_code: `Z${n}`,
	zone_label: label,
	geometry: shape(alias)
});

/** Runs actions through the reducer from a start state. */
const run = (state, ...actions) => actions.reduce(editor.editorReducer, state);
const point = (state, n, address) => {
	const geometry = state.zones.find(entry => entry.zone_id === ID(n)).geometry;
	const parts = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
	return parts[address.part][address.ring][address.index];
};

const start = () => editor.createEditorState([zone(1, "square", "North meadow"), zone(2, "adjacent", "Slide")]);
const corner = { part: 0, ring: 0, index: 1 };

test("a drag is one step; the shared point of the neighbour moves to the very same position", () => {
	const initial = start();
	let state = run(initial, { type: "begin-move", zoneId: ID(1), address: corner });
	assert.deepEqual(state.selection, { zoneId: ID(1), ring: { part: 0, ring: 0 }, index: 1 });
	for (const lng of [0.0101, 0.0102, 0.0103]) state = run(state, { type: "drag-move", position: [lng, 0.0001] });
	assert.equal(state.history.past.length, 0, "no step until the drag ends");
	state = run(state, { type: "end-move", at: 1 });
	assert.equal(state.history.past.length, 1);
	assert.equal(state.history.past[0].label, "moved point 2 of North meadow and 1 shared point");
	assert.equal(state.announcement.text, "Moved point 2 of North meadow and 1 shared point.");
	const mine = point(state, 1, corner);
	assert.deepEqual(mine, [0.0103, 0.0001]);
	assert.equal(point(state, 2, { part: 0, ring: 0, index: 0 }), mine, "same array, same numbers");
	// The neighbour's ring stays closed on the same pair.
	assert.equal(state.zones[1].geometry.coordinates[0][4], mine);
	// Every other point is the array it was.
	assert.equal(point(state, 1, { part: 0, ring: 0, index: 2 }), point(initial, 1, { part: 0, ring: 0, index: 2 }));
	assert.equal(point(state, 2, { part: 0, ring: 0, index: 1 }), point(initial, 2, { part: 0, ring: 0, index: 1 }));
});

test("with shared points off, only the dragged point moves; cancelling restores everything", () => {
	const off = run(start(), { type: "set-setting", key: "moveShared", value: false });
	let state = run(
		off,
		{ type: "begin-move", zoneId: ID(1), address: corner },
		{ type: "drag-move", position: [0.02, 0.02] }
	);
	assert.deepEqual(point(state, 2, { part: 0, ring: 0, index: 0 }), [0.01, 0]);
	state = run(state, { type: "cancel-move" });
	assert.equal(state.zones, off.zones);
	assert.equal(state.history.past.length, 0);
	// A press without movement records nothing.
	state = run(off, { type: "begin-move", zoneId: ID(1), address: corner }, { type: "end-move", at: 1 });
	assert.equal(state.history.past.length, 0);
});

test("nudges within a second merge into one step; a pause starts a new one", () => {
	const initial = start();
	let state = initial;
	const nudge = at => ({
		type: "nudge",
		zoneId: ID(1),
		address: { part: 0, ring: 0, index: 2 },
		east: 0.1,
		north: 0,
		at
	});
	state = run(state, nudge(0), nudge(400), nudge(900));
	assert.equal(state.history.past.length, 1);
	state = run(state, nudge(2500));
	assert.equal(state.history.past.length, 2);
	state = run(state, { type: "undo" }, { type: "undo" });
	assert.equal(state.zones, initial.zones);
	assert.deepEqual(point(state, 1, { part: 0, ring: 0, index: 2 }), [0.01, 0.01]);
	assert.equal(state.announcement.text, "Undid: moved point 3 of North meadow and 1 shared point.");
	state = run(state, { type: "redo" });
	assert.equal(state.announcement.text, "Redid: moved point 3 of North meadow and 1 shared point.");
	assert.ok(point(state, 1, { part: 0, ring: 0, index: 2 })[0] > 0.01);
});

test("a typed position replaces the point exactly", () => {
	const typed = [0.010000000000000002, 0.009999999999999998];
	const state = run(start(), {
		type: "set-point",
		zoneId: ID(1),
		address: { part: 0, ring: 0, index: 0 },
		position: typed,
		at: 1
	});
	assert.equal(point(state, 1, { part: 0, ring: 0, index: 0 }), typed);
	assert.equal(state.zones[0].geometry.coordinates[0][4], typed, "the closing position follows the first");
});

test("inserting at an edge's drawn midpoint adds one point and leaves its neighbours untouched", () => {
	const site = plan.projectSite(
		plan.parseSite({
			type: "FeatureCollection",
			name: "Fixture",
			features: [{ type: "Feature", properties: { kind: "site", id: "s" }, geometry: shape("gap_neighbor") }]
		})
	);
	const before = start();
	const ring = before.zones[0].geometry.coordinates[0];
	const middle = editor.planMidpoint(ring[0], ring[1], site.frame);
	const state = run(before, {
		type: "insert-point",
		zoneId: ID(1),
		address: { part: 0, ring: 0, index: 0 },
		position: middle,
		at: 1
	});
	const after = state.zones[0].geometry.coordinates[0];
	assert.equal(after.length, 6);
	assert.equal(after[0], ring[0]);
	assert.equal(after[2], ring[1]);
	assert.equal(after[1], middle);
	assert.ok(Math.abs(middle[0] - 0.005) < 1e-12 && Math.abs(middle[1]) < 1e-12);
	assert.deepEqual(state.selection, { zoneId: ID(1), ring: { part: 0, ring: 0 }, index: 1 });
	assert.equal(state.announcement.text, "Added point 2 to North meadow, outer edge.");
});

test("removing a point is refused below three points, with the reason announced", () => {
	let state = run(start(), { type: "remove-point", zoneId: ID(1), address: { part: 0, ring: 0, index: 3 }, at: 1 });
	assert.equal(state.announcement.text, "Removed point 4 from North meadow. 3 points remain.");
	state = run(state, { type: "remove-point", zoneId: ID(1), address: { part: 0, ring: 0, index: 0 }, at: 2 });
	assert.equal(state.announcement.text, "Not removed. The outer edge of North meadow keeps at least three points.");
	assert.equal(state.history.past.length, 1);
});

test("zones, holes and parts are added and removed as steps, with identity kept", () => {
	const holed = editor.createEditorState([zone(1, "holed", "Pond"), zone(2, "multipart", "Beds")]);
	let state = run(holed, { type: "remove-hole", zoneId: ID(1), ring: { part: 0, ring: 1 }, at: 1 });
	assert.equal(state.zones[0].zone_id, ID(1));
	assert.equal(state.zones[0].geometry.coordinates.length, 1);
	assert.equal(state.announcement.text, "Removed hole 1 of Pond.");
	state = run(state, { type: "remove-part", zoneId: ID(2), part: 1, at: 2 });
	assert.equal(state.zones[1].geometry.coordinates.length, 1);
	state = run(state, { type: "remove-part", zoneId: ID(2), part: 0, at: 3 });
	assert.equal(state.announcement.text, "Not removed. Beds keeps at least one part.");
	const added = zone(3, "gap_neighbor", "");
	state = run(state, { type: "add-zone", zone: added, label: "drew zone Z3", at: 4 });
	assert.deepEqual(state.selection, { zoneId: ID(3), ring: { part: 0, ring: 0 }, index: null });
	assert.equal(editor.zoneChange(added, state.base), "new");
	state = run(state, { type: "remove-zone", zoneId: ID(1), at: 5 });
	assert.equal(state.selection, null);
	assert.equal(state.zones.length, 2);
	assert.equal(state.history.past.length, 4);
	state = run(state, { type: "undo" }, { type: "undo" }, { type: "undo" }, { type: "undo" });
	assert.equal(state.zones, holed.zones);
});

test("typing a name is one step per focus of the field; codes change only on new zones", () => {
	let state = start();
	for (const [text, at] of [
		["N", 1],
		["No", 2],
		["Nor", 3]
	])
		state = run(state, { type: "set-label", zoneId: ID(1), label: text, focus: 1, at });
	assert.equal(state.history.past.length, 1);
	state = run(state, { type: "set-label", zoneId: ID(1), label: "North", focus: 2, at: 4 });
	assert.equal(state.history.past.length, 2);
	assert.equal(editor.zoneChange(state.zones[0], state.base), "changed");
	state = run(state, { type: "undo" }, { type: "undo" });
	assert.equal(editor.zoneChange(state.zones[0], state.base), "unchanged");
	state = run(state, { type: "set-code", zoneId: ID(1), code: "NM", focus: 3, at: 5 });
	assert.equal(state.zones[0].zone_code, "Z1");
	assert.equal(state.announcement.text, "Codes never change. A new code makes a new zone.");
	state = run(state, { type: "add-zone", zone: zone(9, "gap_neighbor"), at: 6 });
	state = run(state, { type: "set-code", zoneId: ID(9), code: "GN", focus: 4, at: 7 });
	assert.equal(state.zones[2].zone_code, "GN");
	assert.ok(editor.codeEditable(state, ID(9)) && !editor.codeEditable(state, ID(1)));
});

test("names and suggestions read as the UI plan writes them", () => {
	const state = editor.createEditorState([zone(1, "multipart", "Beds"), zone(2, "holed", "")]);
	assert.equal(
		editor.pointName(state.zones[0], { part: 1, ring: 0, index: 2 }),
		"Point 3 of 4, Beds, part 2 outer edge"
	);
	assert.equal(editor.pointName(state.zones[1], { part: 0, ring: 1, index: 0 }), "Point 1 of 4, zone Z2, hole 1");
	assert.equal(editor.suggestCode(state.zones, state.base), "Z3");
});

test("undo and redo say when there is nothing to do; a gesture holds them off", () => {
	let state = run(start(), { type: "undo" });
	assert.equal(state.announcement.text, "Nothing to undo.");
	state = run(state, { type: "redo" });
	assert.equal(state.announcement.text, "Nothing to redo.");
	state = run(
		state,
		{ type: "begin-move", zoneId: ID(1), address: corner },
		{ type: "drag-move", position: [0.02, 0] }
	);
	assert.equal(run(state, { type: "undo" }), state);
	// A new edit clears what could be redone.
	state = run(state, { type: "end-move", at: 1 }, { type: "undo" });
	assert.equal(state.history.future.length, 1);
	state = run(state, { type: "nudge", zoneId: ID(1), address: corner, east: 0.1, north: 0, at: 5 });
	assert.equal(state.history.future.length, 0);
	// Loading a saved draft clears the history.
	state = run(state, { type: "replace-zones", zones: start().zones });
	assert.equal(state.history.past.length, 0);
});

test("history keeps at most 200 steps", () => {
	let steps = history.emptyHistory();
	for (let i = 0; i < 250; i++) steps = history.record(steps, { label: `step ${i}`, before: i, after: i + 1, at: i });
	assert.equal(steps.past.length, history.HISTORY_LIMIT);
	assert.equal(steps.past[0].label, "step 50");
	// Merging keeps the earliest "before".
	let merged = history.record(history.emptyHistory(), {
		label: "a",
		before: 0,
		after: 1,
		at: 0,
		mergeKey: "k",
		mergeWindow: 10
	});
	merged = history.record(merged, { label: "a", before: 1, after: 2, at: 5, mergeKey: "k", mergeWindow: 10 });
	assert.deepEqual([merged.past.length, merged.past[0].before, merged.past[0].after], [1, 0, 2]);
});

test("selection follows what exists after an undo removes its zone", () => {
	let state = run(start(), { type: "add-zone", zone: zone(3, "gap_neighbor"), at: 1 });
	assert.equal(state.selection.zoneId, ID(3));
	state = run(state, { type: "undo" });
	assert.equal(state.selection, null);
});
