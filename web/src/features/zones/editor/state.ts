import { plural } from "@/lib/labels";
import { fromPlan, type PlanFrame, toPlan } from "@/lib/plan";
import {
	distinctCount,
	type DraftZone,
	insertVertex,
	moveVertices,
	nudge,
	openLength,
	partsOf,
	type Position,
	rectangleRing,
	removeHole,
	removePart,
	removeVertex,
	type RingAddress,
	ringAt,
	sameGeometry,
	type VertexAddress,
	vertexAt
} from "@/lib/zones/geometry";
import type { SnapSource } from "@/lib/zones/hints";

import { emptyHistory, type History, NUDGE_MERGE_MS, record, redo, undo } from "./history";

/**
 * The zone editor's state as a pure reducer (UI plan 5.4–5.6, 6.3). It holds the draft's zones exactly as
 * received, the selection, the history and the last announcement. Longitude and latitude are the only
 * coordinates here: a point moves only when the manager moves it, and every other number keeps its value
 * and its array.
 */

export type Zones = readonly DraftZone[];

export type EditorSelection = {
	readonly zoneId: string;
	/** The ring whose points show as handles and in the points table. */
	readonly ring: RingAddress;
	/** The point in focus, or null when only the ring is selected. */
	readonly index: number | null;
} | null;

/** A message for the polite live region. `id` changes with every message, so a repeat is read again. */
export type Announcement = { readonly id: number; readonly text: string };

export type EditorSettings = {
	/** Snap a dragged or drawn point to an exact point of another zone or of the site boundary. */
	readonly snap: boolean;
	/** Dragging a point moves the points of other zones at the identical position with it. */
	readonly moveShared: boolean;
};

type Shared = { readonly zoneId: string; readonly address: VertexAddress };

/**
 * A drag under way: the zones for the history step, the zones the drag moves from (the same, unless the drag
 * began by inserting a point at an edge's middle), the point dragged and the points that move with it.
 */
type Gesture = {
	readonly before: Zones;
	readonly base: Zones;
	readonly inserted: boolean;
	readonly zoneId: string;
	readonly address: VertexAddress;
	readonly shared: readonly Shared[];
	readonly moved: boolean;
};

export type EditorState = {
	readonly zones: Zones;
	/** The base map version's zones by identity: what "New", "Changed" and "Unchanged" compare against. */
	readonly base: ReadonlyMap<string, DraftZone>;
	readonly selection: EditorSelection;
	readonly history: History<Zones>;
	readonly gesture: Gesture | null;
	readonly settings: EditorSettings;
	readonly announcement: Announcement | null;
	readonly tool: Tool;
	/** A shape or rectangle being drawn. It is never part of `zones`, so it can never be saved. */
	readonly drawing: Drawing | null;
};

/** Select (the default), Draw shape and Draw rectangle (UI plan 5.4). */
export type Tool = "select" | "shape" | "rectangle";

/** Where a drawn point came from: the exact point it snapped to, or nowhere (placed freely). */
export type DrawSnap = SnapSource | null;

export type Drawing = {
	readonly tool: "shape" | "rectangle";
	readonly points: readonly Position[];
	readonly snaps: readonly DrawSnap[];
	/** Points copied by following an edge, just before the last point, and which way round. */
	readonly trace: { readonly count: number; readonly direction: 1 | -1 } | null;
};

export type EditorAction =
	| { type: "select-zone"; zoneId: string | null }
	| { type: "select-ring"; zoneId: string; ring: RingAddress }
	| { type: "select-point"; zoneId: string; address: VertexAddress }
	| { type: "begin-move"; zoneId: string; address: VertexAddress }
	/** Inserts a point after `address.index` and starts dragging it: one step, whether or not it moves. */
	| { type: "begin-insert"; zoneId: string; address: VertexAddress; position: Position }
	| { type: "drag-move"; position: Position }
	| { type: "end-move"; at: number }
	| { type: "cancel-move" }
	| { type: "nudge"; zoneId: string; address: VertexAddress; east: number; north: number; at: number }
	| { type: "set-point"; zoneId: string; address: VertexAddress; position: Position; at: number }
	| { type: "insert-point"; zoneId: string; address: VertexAddress; position: Position; at: number }
	| { type: "remove-point"; zoneId: string; address: VertexAddress; at: number }
	| { type: "add-zone"; zone: DraftZone; label?: string; at: number }
	| { type: "remove-zone"; zoneId: string; at: number }
	| { type: "remove-hole"; zoneId: string; ring: RingAddress; at: number }
	| { type: "remove-part"; zoneId: string; part: number; at: number }
	| { type: "set-label"; zoneId: string; label: string; focus: number; at: number }
	| { type: "set-code"; zoneId: string; code: string; focus: number; at: number }
	| { type: "undo" }
	| { type: "redo" }
	| { type: "set-setting"; key: keyof EditorSettings; value: boolean }
	| { type: "replace-zones"; zones: Zones }
	| { type: "announce"; text: string }
	| { type: "set-tool"; tool: Tool }
	/** A point for the drawing. A rectangle's second corner finishes it, as a new zone with `zoneId`. */
	| { type: "draw-point"; position: Position; snap: DrawSnap; zoneId: string; at: number }
	| { type: "draw-back" }
	/** Copies a neighbour's edge between the last two points: `between` are that ring's own positions. */
	| { type: "draw-trace"; between: readonly Position[]; direction: 1 | -1; edgeName: string }
	| { type: "draw-finish"; zoneId: string; at: number }
	| { type: "draw-cancel" };

export function createEditorState(
	zones: Zones,
	base: Zones = zones,
	settings: EditorSettings = { snap: true, moveShared: true }
): EditorState {
	return {
		zones,
		base: new Map(base.map(zone => [zone.zone_id, zone])),
		selection: null,
		history: emptyHistory(),
		gesture: null,
		settings,
		announcement: null,
		tool: "select",
		drawing: null
	};
}

/* ── Names ────────────────────────────────────────────────────────────────── */

/** A zone's name in sentences: its label, or its code while it has none. */
export function zoneName(zone: DraftZone): string {
	const label = zone.zone_label.trim();
	return label !== "" ? label : `zone ${zone.zone_code}`;
}

/** "outer edge", "hole 1", and with several parts "part 2 outer edge". */
export function ringName(zone: DraftZone, { part, ring }: RingAddress): string {
	const edge = ring === 0 ? "outer edge" : `hole ${ring}`;
	return partsOf(zone.geometry).length > 1 ? `part ${part + 1} ${edge}` : edge;
}

/** A point's accessible name: "Point 12 of 214, North meadow, outer edge". */
export function pointName(zone: DraftZone, address: VertexAddress): string {
	const ring = ringAt(zone.geometry, address);
	const count = (ring ? openLength(ring) : 0).toLocaleString("en-US");
	return `Point ${(address.index + 1).toLocaleString("en-US")} of ${count}, ${zoneName(zone)}, ${ringName(zone, address)}`;
}

/** "1 part · 1 hole · 214 points": parts, holes and the points of every ring, without closing repeats. */
export function shapeFacts(zone: DraftZone): string {
	const parts = partsOf(zone.geometry);
	const holes = parts.reduce((sum, rings) => sum + rings.length - 1, 0);
	const points = parts.reduce((sum, rings) => sum + rings.reduce((inner, ring) => inner + openLength(ring), 0), 0);
	return [plural(parts.length, "part"), plural(holes, "hole"), plural(points, "point")].join(" · ");
}

export type ZoneChange = "new" | "changed" | "unchanged";

/** How a zone compares with the base version, in words for the Zones list (local; the server decides at review). */
export function zoneChange(zone: DraftZone, base: ReadonlyMap<string, DraftZone>): ZoneChange {
	const before = base.get(zone.zone_id);
	if (!before) return "new";
	return before.zone_label.trim() === zone.zone_label.trim() &&
		before.zone_code === zone.zone_code &&
		sameGeometry(before.geometry, zone.geometry)
		? "unchanged"
		: "changed";
}

/** The first of Z1, Z2, … that no zone in the draft or its base uses. */
export function suggestCode(zones: Zones, base: ReadonlyMap<string, DraftZone>): string {
	const taken = new Set([...zones.map(zone => zone.zone_code), ...[...base.values()].map(zone => zone.zone_code)]);
	for (let n = 1; ; n++) if (!taken.has(`Z${n}`)) return `Z${n}`;
}

/* ── Geometry through the plan ────────────────────────────────────────────── */

/**
 * The exact midpoint of an edge as drawn: the plan-space midpoint taken back through the projection at full
 * precision. Only the new point is computed; its neighbours are untouched (UI plan 5.4).
 */
export function planMidpoint(a: Position, b: Position, frame: PlanFrame): Position {
	const [ax, ay] = toPlan(a, frame);
	const [bx, by] = toPlan(b, frame);
	return fromPlan([(ax + bx) / 2, (ay + by) / 2], frame);
}

/**
 * When an edit happened, for merging steps: event handlers call this and pass the result in the action, so
 * the reducer itself stays pure.
 */
export function eventTime(): number {
	return Date.now();
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function announce(state: EditorState, text: string): Announcement {
	return { id: (state.announcement?.id ?? 0) + 1, text };
}

function findZone(zones: Zones, zoneId: string): DraftZone | undefined {
	return zones.find(zone => zone.zone_id === zoneId);
}

function withZone(zones: Zones, zoneId: string, change: (zone: DraftZone) => DraftZone): Zones {
	return zones.map(zone => (zone.zone_id === zoneId ? change(zone) : zone));
}

/** Points of other zones at exactly this pair: they move with a dragged point when moving shared points. */
function sharedPoints(zones: Zones, zoneId: string, position: Position): Shared[] {
	const shared: Shared[] = [];
	for (const zone of zones) {
		if (zone.zone_id === zoneId) continue;
		partsOf(zone.geometry).forEach((rings, part) =>
			rings.forEach((ring, ringIndex) => {
				for (let index = 0; index < openLength(ring); index++) {
					const point = ring[index]!;
					if (point[0] === position[0] && point[1] === position[1])
						shared.push({ zoneId: zone.zone_id, address: { part, ring: ringIndex, index } });
				}
			})
		);
	}
	return shared;
}

/** Moves one point, and the shared points with it, to the very same position. */
function movePoints(
	zones: Zones,
	zoneId: string,
	address: VertexAddress,
	shared: readonly Shared[],
	position: Position
) {
	const byRing = new Map<string, { zoneId: string; ring: RingAddress; moves: Map<number, Position> }>();
	for (const point of [{ zoneId, address }, ...shared]) {
		const key = `${point.zoneId}|${point.address.part}|${point.address.ring}`;
		const entry = byRing.get(key) ?? { zoneId: point.zoneId, ring: point.address, moves: new Map() };
		entry.moves.set(point.address.index, position);
		byRing.set(key, entry);
	}
	let next = zones;
	for (const { zoneId: id, ring, moves } of byRing.values())
		next = withZone(next, id, zone => ({ ...zone, geometry: moveVertices(zone.geometry, ring, moves) }));
	return next;
}

function sharedSuffix(shared: readonly Shared[]): string {
	if (shared.length === 0) return "";
	return shared.length === 1 ? " and 1 shared point" : ` and ${shared.length} shared points`;
}

/** Keeps the selection pointing at something that exists after the zones changed. */
function validSelection(zones: Zones, selection: EditorSelection): EditorSelection {
	if (!selection) return null;
	const zone = findZone(zones, selection.zoneId);
	if (!zone) return null;
	const ring = ringAt(zone.geometry, selection.ring) ? selection.ring : { part: 0, ring: 0 };
	const length = openLength(ringAt(zone.geometry, ring) ?? []);
	const index = selection.index === null ? null : Math.min(selection.index, length - 1);
	return { zoneId: zone.zone_id, ring, index: index !== null && index >= 0 ? index : null };
}

function commit(
	state: EditorState,
	zones: Zones,
	label: string,
	at: number,
	extra: Partial<EditorState> = {},
	merge?: { key: string; window: number }
): EditorState {
	if (zones === state.zones) return { ...state, ...extra };
	const history = record(state.history, {
		label,
		before: state.zones,
		after: zones,
		at,
		...(merge ? { mergeKey: merge.key, mergeWindow: merge.window } : {})
	});
	const selection = validSelection(zones, extra.selection === undefined ? state.selection : extra.selection);
	return { ...state, ...extra, zones, history, selection };
}

/* ── The reducer ──────────────────────────────────────────────────────────── */

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
	switch (action.type) {
		case "select-zone": {
			if (action.zoneId === null) return { ...state, selection: null };
			if (!findZone(state.zones, action.zoneId)) return state;
			return { ...state, selection: { zoneId: action.zoneId, ring: { part: 0, ring: 0 }, index: null } };
		}
		case "select-ring": {
			const zone = findZone(state.zones, action.zoneId);
			if (!zone || !ringAt(zone.geometry, action.ring)) return state;
			return { ...state, selection: { zoneId: zone.zone_id, ring: action.ring, index: null } };
		}
		case "select-point": {
			const zone = findZone(state.zones, action.zoneId);
			if (!zone || !vertexAt(zone.geometry, action.address)) return state;
			const { part, ring, index } = action.address;
			return { ...state, selection: { zoneId: zone.zone_id, ring: { part, ring }, index } };
		}

		case "begin-move": {
			const zone = findZone(state.zones, action.zoneId);
			const position = zone && vertexAt(zone.geometry, action.address);
			if (!zone || !position) return state;
			const { part, ring, index } = action.address;
			return {
				...state,
				selection: { zoneId: zone.zone_id, ring: { part, ring }, index },
				gesture: {
					before: state.zones,
					base: state.zones,
					inserted: false,
					zoneId: zone.zone_id,
					address: action.address,
					shared: state.settings.moveShared ? sharedPoints(state.zones, zone.zone_id, position) : [],
					moved: false
				}
			};
		}
		case "begin-insert": {
			const zone = findZone(state.zones, action.zoneId);
			if (!zone || !vertexAt(zone.geometry, action.address)) return state;
			const geometry = insertVertex(zone.geometry, action.address, action.position);
			const zones = withZone(state.zones, zone.zone_id, current => ({ ...current, geometry }));
			const { part, ring } = action.address;
			const address = { part, ring, index: action.address.index + 1 };
			return {
				...state,
				zones,
				selection: { zoneId: zone.zone_id, ring: { part, ring }, index: address.index },
				gesture: {
					before: state.zones,
					base: zones,
					inserted: true,
					zoneId: zone.zone_id,
					address,
					shared: [],
					moved: false
				}
			};
		}
		case "drag-move": {
			const { gesture } = state;
			if (!gesture) return state;
			const zones = movePoints(gesture.base, gesture.zoneId, gesture.address, gesture.shared, action.position);
			return { ...state, zones, gesture: { ...gesture, moved: true } };
		}
		case "end-move": {
			const { gesture } = state;
			if (!gesture) return state;
			const zone = findZone(gesture.before, gesture.zoneId)!;
			const done = { ...state, zones: gesture.before, gesture: null };
			if (gesture.inserted) {
				const added = gesture.address.index + 1;
				return commit(done, state.zones, `added point ${added} to ${zoneName(zone)}`, action.at, {
					announcement: announce(
						state,
						`Added point ${added} to ${zoneName(zone)}, ${ringName(zone, gesture.address)}.`
					)
				});
			}
			if (!gesture.moved) return done;
			const label = `moved point ${gesture.address.index + 1} of ${zoneName(zone)}${sharedSuffix(gesture.shared)}`;
			return commit(done, state.zones, label, action.at, {
				announcement: announce(state, `Moved ${label.slice(6)}.`)
			});
		}
		case "cancel-move": {
			const { gesture } = state;
			if (!gesture) return state;
			return { ...state, zones: gesture.before, gesture: null, announcement: announce(state, "Move cancelled.") };
		}

		case "nudge":
		case "set-point": {
			const zone = findZone(state.zones, action.zoneId);
			const position = zone && vertexAt(zone.geometry, action.address);
			if (!zone || !position) return state;
			const next = action.type === "nudge" ? nudge(position, action.east, action.north) : action.position;
			const shared = state.settings.moveShared ? sharedPoints(state.zones, zone.zone_id, position) : [];
			const zones = movePoints(state.zones, zone.zone_id, action.address, shared, next);
			const label = `moved point ${action.address.index + 1} of ${zoneName(zone)}${sharedSuffix(shared)}`;
			const { part, ring, index } = action.address;
			const key = `move:${zone.zone_id}:${part}:${ring}:${index}`;
			return commit(
				state,
				zones,
				label,
				action.at,
				{
					selection: { zoneId: zone.zone_id, ring: { part, ring }, index },
					announcement: announce(state, `Moved ${label.slice(6)}.`)
				},
				action.type === "nudge" ? { key, window: NUDGE_MERGE_MS } : undefined
			);
		}

		case "insert-point": {
			const zone = findZone(state.zones, action.zoneId);
			if (!zone || !vertexAt(zone.geometry, action.address)) return state;
			const geometry = insertVertex(zone.geometry, action.address, action.position);
			const zones = withZone(state.zones, zone.zone_id, current => ({ ...current, geometry }));
			const added = action.address.index + 2;
			const label = `added point ${added} to ${zoneName(zone)}`;
			const { part, ring } = action.address;
			return commit(state, zones, label, action.at, {
				selection: { zoneId: zone.zone_id, ring: { part, ring }, index: action.address.index + 1 },
				announcement: announce(
					state,
					`Added point ${added} to ${zoneName(zone)}, ${ringName(zone, action.address)}.`
				)
			});
		}
		case "remove-point": {
			const zone = findZone(state.zones, action.zoneId);
			if (!zone) return state;
			const result = removeVertex(zone.geometry, action.address);
			if (!result.ok) {
				const text =
					result.reason === "too_few_points"
						? `Not removed. The ${ringName(zone, action.address)} of ${zoneName(zone)} keeps at least three points.`
						: "There is no point there to remove.";
				return { ...state, announcement: announce(state, text) };
			}
			const zones = withZone(state.zones, zone.zone_id, current => ({ ...current, geometry: result.geometry }));
			const label = `removed point ${action.address.index + 1} from ${zoneName(zone)}`;
			const remaining = openLength(ringAt(result.geometry, action.address)!);
			const { part, ring, index } = action.address;
			return commit(state, zones, label, action.at, {
				selection: { zoneId: zone.zone_id, ring: { part, ring }, index },
				announcement: announce(
					state,
					`Removed point ${index + 1} from ${zoneName(zone)}. ${remaining} points remain.`
				)
			});
		}

		case "add-zone": {
			if (findZone(state.zones, action.zone.zone_id)) return state;
			const zones = [...state.zones, action.zone];
			const label = action.label ?? `added ${zoneName(action.zone)}`;
			return commit(state, zones, label, action.at, {
				selection: { zoneId: action.zone.zone_id, ring: { part: 0, ring: 0 }, index: null },
				announcement: announce(state, `${label[0]!.toUpperCase()}${label.slice(1)}.`)
			});
		}
		case "remove-zone": {
			const zone = findZone(state.zones, action.zoneId);
			if (!zone) return state;
			const zones = state.zones.filter(entry => entry.zone_id !== zone.zone_id);
			const label = `removed ${zoneName(zone)}`;
			return commit(state, zones, label, action.at, {
				selection: null,
				announcement: announce(state, `Removed ${zoneName(zone)} from this draft.`)
			});
		}
		case "remove-hole": {
			const zone = findZone(state.zones, action.zoneId);
			if (!zone) return state;
			const result = removeHole(zone.geometry, action.ring);
			if (!result.ok) return state;
			const zones = withZone(state.zones, zone.zone_id, current => ({ ...current, geometry: result.geometry }));
			const label = `removed ${ringName(zone, action.ring)} of ${zoneName(zone)}`;
			return commit(state, zones, label, action.at, {
				selection: { zoneId: zone.zone_id, ring: { part: action.ring.part, ring: 0 }, index: null },
				announcement: announce(state, `Removed ${ringName(zone, action.ring)} of ${zoneName(zone)}.`)
			});
		}
		case "remove-part": {
			const zone = findZone(state.zones, action.zoneId);
			if (!zone) return state;
			const result = removePart(zone.geometry, action.part);
			if (!result.ok) {
				if (result.reason !== "too_few_points") return state;
				return {
					...state,
					announcement: announce(state, `Not removed. ${zoneName(zone)} keeps at least one part.`)
				};
			}
			const zones = withZone(state.zones, zone.zone_id, current => ({ ...current, geometry: result.geometry }));
			const label = `removed part ${action.part + 1} of ${zoneName(zone)}`;
			return commit(state, zones, label, action.at, {
				selection: { zoneId: zone.zone_id, ring: { part: 0, ring: 0 }, index: null },
				announcement: announce(state, `Removed part ${action.part + 1} of ${zoneName(zone)}.`)
			});
		}

		case "set-label": {
			const zone = findZone(state.zones, action.zoneId);
			if (!zone || zone.zone_label === action.label) return state;
			const zones = withZone(state.zones, zone.zone_id, current => ({ ...current, zone_label: action.label }));
			return commit(
				state,
				zones,
				`changed the name of zone ${zone.zone_code}`,
				action.at,
				{},
				{
					key: `label:${zone.zone_id}:${action.focus}`,
					window: Infinity
				}
			);
		}
		case "set-code": {
			const zone = findZone(state.zones, action.zoneId);
			if (!zone || zone.zone_code === action.code) return state;
			// Codes never change: only a zone new in this draft takes a code.
			if (state.base.has(zone.zone_id))
				return { ...state, announcement: announce(state, "Codes never change. A new code makes a new zone.") };
			const zones = withZone(state.zones, zone.zone_id, current => ({ ...current, zone_code: action.code }));
			return commit(
				state,
				zones,
				`changed the code of ${zoneName(zone)}`,
				action.at,
				{},
				{
					key: `code:${zone.zone_id}:${action.focus}`,
					window: Infinity
				}
			);
		}

		case "undo": {
			if (state.gesture) return state;
			const result = undo(state.history);
			if (!result) return { ...state, announcement: announce(state, "Nothing to undo.") };
			return {
				...state,
				zones: result.step.before,
				history: result.history,
				selection: validSelection(result.step.before, state.selection),
				announcement: announce(state, `Undid: ${result.step.label}.`)
			};
		}
		case "redo": {
			if (state.gesture) return state;
			const result = redo(state.history);
			if (!result) return { ...state, announcement: announce(state, "Nothing to redo.") };
			return {
				...state,
				zones: result.step.after,
				history: result.history,
				selection: validSelection(result.step.after, state.selection),
				announcement: announce(state, `Redid: ${result.step.label}.`)
			};
		}

		case "set-setting":
			return { ...state, settings: { ...state.settings, [action.key]: action.value } };
		case "replace-zones":
			return {
				...state,
				zones: action.zones,
				history: emptyHistory(),
				gesture: null,
				selection: validSelection(action.zones, state.selection)
			};
		case "announce":
			return { ...state, announcement: announce(state, action.text) };

		case "set-tool": {
			if (state.gesture) return state;
			if (action.tool === "select")
				return {
					...state,
					tool: "select",
					drawing: null,
					announcement: announce(state, "Select. Choose a zone to edit its points.")
				};
			return {
				...state,
				tool: action.tool,
				drawing: { tool: action.tool, points: [], snaps: [], trace: null },
				announcement: announce(state, TOOL_HELP[action.tool])
			};
		}
		case "draw-point": {
			const drawing = state.drawing;
			if (!drawing) return state;
			const last = drawing.points[drawing.points.length - 1];
			// A double click adds its point once.
			if (last && last[0] === action.position[0] && last[1] === action.position[1]) return state;
			if (drawing.tool === "rectangle" && drawing.points.length === 1) {
				const [corner] = drawing.points as [Position];
				if (corner[0] === action.position[0] || corner[1] === action.position[1])
					return {
						...state,
						announcement: announce(
							state,
							"Not drawn. The second corner must differ from the first in both directions."
						)
					};
				return finishZone(
					state,
					{ type: "Polygon", coordinates: [rectangleRing(corner, action.position)] },
					action.zoneId,
					action.at,
					4
				);
			}
			const points = [...drawing.points, action.position];
			const snapped = action.snap ? " on an existing point" : "";
			return {
				...state,
				drawing: { ...drawing, points, snaps: [...drawing.snaps, action.snap], trace: null },
				announcement: announce(
					state,
					drawing.tool === "rectangle"
						? `First corner set${snapped}.`
						: `Point ${points.length} added${snapped}.`
				)
			};
		}
		case "draw-back": {
			const drawing = state.drawing;
			if (!drawing || drawing.points.length === 0) return state;
			const points = drawing.points.slice(0, -1);
			return {
				...state,
				drawing: { ...drawing, points, snaps: drawing.snaps.slice(0, -1), trace: null },
				announcement: announce(
					state,
					points.length === 0 ? "No points yet." : `Removed point ${points.length + 1}.`
				)
			};
		}
		case "draw-trace": {
			const drawing = state.drawing;
			if (!drawing || drawing.tool !== "shape" || drawing.points.length < 2) return state;
			// Following again replaces the edge copied before (the other way round).
			const kept = drawing.trace ? drawing.trace.count : 0;
			const end = drawing.points.length - 1;
			const points = [...drawing.points.slice(0, end - kept), ...action.between, drawing.points[end]!];
			const snaps = [
				...drawing.snaps.slice(0, end - kept),
				...action.between.map(() => null),
				drawing.snaps[end]!
			];
			return {
				...state,
				drawing: {
					...drawing,
					points,
					snaps,
					trace: { count: action.between.length, direction: action.direction }
				},
				announcement: announce(
					state,
					`Following the edge of ${action.edgeName}: ${plural(action.between.length, "point")} copied.`
				)
			};
		}
		case "draw-finish": {
			const drawing = state.drawing;
			if (!drawing || drawing.tool !== "shape") return state;
			const ring = [...drawing.points, drawing.points[0]!];
			if (drawing.points.length < 3 || distinctCount(ring) < 3)
				return {
					...state,
					announcement: announce(
						state,
						`Not finished. A shape needs at least three different points; it has ${drawing.points.length}.`
					)
				};
			return finishZone(
				state,
				{ type: "Polygon", coordinates: [ring] },
				action.zoneId,
				action.at,
				drawing.points.length
			);
		}
		case "draw-cancel": {
			const drawing = state.drawing;
			if (!drawing) return state;
			if (drawing.points.length === 0)
				return {
					...state,
					tool: "select",
					drawing: null,
					announcement: announce(state, "Select. Choose a zone to edit its points.")
				};
			return {
				...state,
				drawing: { ...drawing, points: [], snaps: [], trace: null },
				announcement: announce(state, "Drawing cancelled. Nothing was added.")
			};
		}
	}
}

const TOOL_HELP: Record<"shape" | "rectangle", string> = {
	shape: "Draw shape. Click, or press Space at the cross, to add points. Click the first point or press Enter to finish.",
	rectangle: "Draw rectangle. Drag across the plan, or press Space at the cross for each corner."
};

/** A finished drawing becomes a new zone: a client identity, a suggested code, a name to fill in. */
function finishZone(
	state: EditorState,
	geometry: DraftZone["geometry"],
	zoneId: string,
	at: number,
	points: number
): EditorState {
	const code = suggestCode(state.zones, state.base);
	const zone: DraftZone = { zone_id: zoneId.toLowerCase(), zone_code: code, zone_label: "", geometry };
	const zones = [...state.zones, zone];
	return commit(state, zones, `drew zone ${code}`, at, {
		tool: "select",
		drawing: null,
		selection: { zoneId: zone.zone_id, ring: { part: 0, ring: 0 }, index: null },
		announcement: announce(state, `Drew zone ${code} with ${points} points. Give it a name.`)
	});
}

/** Whether a code may be typed for this zone: only a zone new in this draft takes one. */
export function codeEditable(state: EditorState, zoneId: string): boolean {
	return !state.base.has(zoneId);
}
