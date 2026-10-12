import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";

const editor = await load("features/zones/editor/state.ts");
const hints = await load("lib/zones/hints.ts");
const { readZoneGeometry, structureIssues } = await load("lib/zones/geometry.ts");

const ID = n => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const run = (state, ...actions) => actions.reduce(editor.editorReducer, state);
const point = (position, n, snap = null) => ({ type: "draw-point", position, snap, zoneId: ID(n), at: n });

/** Draws a shape from free points and returns the state with it finished as zone `n`. */
function drawShape(state, n, positions) {
	state = run(state, { type: "set-tool", tool: "shape" }, ...positions.map(position => point(position, n)));
	return run(state, { type: "draw-finish", zoneId: ID(n), at: n });
}

test("a drawn rectangle becomes a new zone: a client identity, a suggested code, a name to fill in", () => {
	let state = run(editor.createEditorState([]), { type: "set-tool", tool: "rectangle" });
	assert.equal(state.tool, "rectangle");
	state = run(state, point([0, 0], 1));
	assert.equal(state.announcement.text, "First corner set.");
	assert.deepEqual(state.zones, []);
	state = run(state, point([0.01, 0.02], 1));
	assert.equal(state.zones.length, 1);
	const [zone] = state.zones;
	assert.deepEqual(zone, {
		zone_id: ID(1),
		zone_code: "Z1",
		zone_label: "",
		geometry: {
			type: "Polygon",
			coordinates: [
				[
					[0, 0],
					[0.01, 0],
					[0.01, 0.02],
					[0, 0.02],
					[0, 0]
				]
			]
		}
	});
	assert.equal(state.tool, "select");
	assert.equal(state.drawing, null);
	assert.deepEqual(state.selection, { zoneId: ID(1), ring: { part: 0, ring: 0 }, index: null });
	assert.equal(state.announcement.text, "Drew zone Z1 with 4 points. Give it a name.");
	// The empty name is the one thing that stops it saving.
	assert.deepEqual(
		structureIssues(state.zones).map(issue => issue.code),
		["empty_label"]
	);
	// A rectangle with no width is refused, and nothing is added.
	const flat = run(
		editor.createEditorState([]),
		{ type: "set-tool", tool: "rectangle" },
		point([0, 0], 2),
		point([0, 0.02], 2)
	);
	assert.deepEqual(flat.zones, []);
	assert.match(flat.announcement.text, /must differ from the first in both directions/);
});

test("an unfinished shape never enters the zones, so it can never be saved", () => {
	const start = editor.createEditorState([]);
	let state = run(start, { type: "set-tool", tool: "shape" }, point([0, 0], 1), point([0.01, 0], 1));
	assert.equal(state.zones, start.zones, "the zones are the very same list");
	assert.equal(state.drawing.points.length, 2);
	assert.equal(state.history.past.length, 0);
	// Finishing with fewer than three different points is refused and says why.
	state = run(state, { type: "draw-finish", zoneId: ID(1), at: 1 });
	assert.equal(state.zones, start.zones);
	assert.equal(state.announcement.text, "Not finished. A shape needs at least three different points; it has 2.");
	// A double click adds its point once; Backspace takes the last one off.
	state = run(state, point([0.01, 0], 1));
	assert.equal(state.drawing.points.length, 2);
	state = run(state, { type: "draw-back" });
	assert.deepEqual(state.drawing.points, [[0, 0]]);
	// Escape clears the drawing; a second Escape leaves the tool. The zones never changed.
	state = run(state, { type: "draw-cancel" });
	assert.deepEqual([state.tool, state.drawing.points], ["shape", []]);
	state = run(state, { type: "draw-cancel" });
	assert.deepEqual([state.tool, state.drawing], ["select", null]);
	assert.equal(state.zones, start.zones);
	// Switching tools mid-drawing drops it too.
	state = run(start, { type: "set-tool", tool: "shape" }, point([0, 0], 2), { type: "set-tool", tool: "select" });
	assert.equal(state.drawing, null);
	assert.equal(state.zones, start.zones);
});

test("two adjacent zones drawn with a traced shared edge share exactly the same vertex pairs", () => {
	// Zone A, drawn freely, with a point partway along its east edge.
	let state = drawShape(editor.createEditorState([]), 1, [
		[0, 0],
		[0.01, 0],
		[0.01, 0.005],
		[0.01, 0.01],
		[0, 0.01]
	]);
	state = run(state, { type: "set-label", zoneId: ID(1), label: "West", focus: 1, at: 1 });
	const ringA = state.zones[0].geometry.coordinates[0];

	// Zone B snaps to A's south-east corner, then its north-east corner, and follows A's edge between them.
	const project = ([lng, lat]) => [lng * 1e5, -lat * 1e5];
	const index = hints.createSnapIndex(hints.snapCandidates(state.zones, [], project), 50);
	const snapAt = position => hints.nearestCandidate(index, project(position), 10);
	const first = snapAt([0.010000001, 0.0000001]);
	const second = snapAt([0.0100001, 0.0099999]);
	assert.equal(first.position, ringA[1]);
	assert.equal(second.position, ringA[3]);
	state = run(
		state,
		{ type: "set-tool", tool: "shape" },
		point(first.position, 2, first.source),
		point(second.position, 2, second.source)
	);

	// The wrong way round first (across the far side of A), then the right way: the trace is replaced.
	const across = hints.traceRing(ringA, 1, 3, -1);
	state = run(state, { type: "draw-trace", between: across, direction: -1, edgeName: "West" });
	assert.equal(state.drawing.points.length, 4);
	const along = hints.traceRing(ringA, 1, 3, 1);
	state = run(state, { type: "draw-trace", between: along, direction: 1, edgeName: "West" });
	assert.deepEqual(state.drawing.trace, { count: 1, direction: 1 });
	assert.equal(state.announcement.text, "Following the edge of West: 1 point copied.");
	state = run(state, point([0.02, 0.01], 2), point([0.02, 0], 2), { type: "draw-finish", zoneId: ID(2), at: 2 });

	const ringB = state.zones[1].geometry.coordinates[0];
	assert.equal(ringB.length, 6);
	// The shared edge is A's own three points, the very same arrays, so the same numbers: no sliver.
	assert.equal(ringB[0], ringA[1]);
	assert.equal(ringB[1], ringA[2]);
	assert.equal(ringB[2], ringA[3]);
	assert.equal(ringB[5], ringA[1], "B closes on the identical pair");
	const shared = ringB.filter(position => ringA.some(other => other[0] === position[0] && other[1] === position[1]));
	assert.equal(shared.length, 4);
	assert.ok(readZoneGeometry(state.zones[1].geometry).ok);
	assert.deepEqual(hints.zoneHints(state.zones[1]), []);

	// Moving a shared point with "Move shared points together" keeps the edge shared.
	state = run(state, {
		type: "nudge",
		zoneId: ID(2),
		address: { part: 0, ring: 0, index: 1 },
		east: 0.5,
		north: 0,
		at: 9
	});
	const movedA = state.zones[0].geometry.coordinates[0][2];
	assert.equal(state.zones[1].geometry.coordinates[0][1], movedA);
	assert.notDeepEqual(movedA, [0.01, 0.005]);
});

test("drawing is undone as one step, and tracing needs two points", () => {
	let state = run(editor.createEditorState([]), { type: "set-tool", tool: "shape" }, point([0, 0], 1));
	assert.equal(run(state, { type: "draw-trace", between: [[1, 1]], direction: 1, edgeName: "X" }), state);
	state = run(state, point([0.01, 0], 1), point([0, 0.01], 1), { type: "draw-finish", zoneId: ID(1), at: 1 });
	assert.equal(state.history.past.length, 1);
	assert.equal(state.history.past[0].label, "drew zone Z1");
	state = run(state, { type: "undo" });
	assert.deepEqual(state.zones, []);
	assert.equal(state.announcement.text, "Undid: drew zone Z1.");
});
