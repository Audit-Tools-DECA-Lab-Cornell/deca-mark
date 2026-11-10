import {
	insertVertex,
	moveVertex,
	type Position,
	removeVertex,
	type VertexAddress,
	type ZoneGeometry
} from "@/lib/zones/geometry";

export type OutlineEditHistory = Readonly<{
	readonly past: readonly ZoneGeometry[];
	readonly future: readonly ZoneGeometry[];
	readonly message: string | null;
}>;
export type OutlineEditAction =
	| Readonly<{ readonly type: "move"; readonly address: VertexAddress; readonly position: Position }>
	| Readonly<{ readonly type: "insert"; readonly address: VertexAddress; readonly position: Position }>
	| Readonly<{ readonly type: "remove"; readonly address: VertexAddress }>
	| Readonly<{ readonly type: "undo" }>
	| Readonly<{ readonly type: "redo" }>;
export type OutlineEditResult = Readonly<{
	readonly geometry: ZoneGeometry;
	readonly history: OutlineEditHistory;
}>;

/** Creates empty undo and redo stacks for one outline editing session. */
export function createOutlineEditHistory(): OutlineEditHistory {
	return { past: [], future: [], message: null };
}

function committed(geometry: ZoneGeometry, history: OutlineEditHistory, next: ZoneGeometry): OutlineEditResult {
	if (next === geometry) return { geometry, history };
	return {
		geometry: next,
		history: { past: [...history.past, geometry], future: [], message: null }
	};
}

/**
 * Applies one coordinate edit or history move. Insert and remove delegate to the shared ring helpers, so
 * closure, multipart geometry, holes, and the three-distinct-point minimum use the same rules as zones.
 */
export function editOutline(
	geometry: ZoneGeometry,
	history: OutlineEditHistory,
	action: OutlineEditAction
): OutlineEditResult {
	switch (action.type) {
		case "move":
			return committed(geometry, history, moveVertex(geometry, action.address, action.position));
		case "insert":
			return committed(geometry, history, insertVertex(geometry, action.address, action.position));
		case "remove": {
			const removed = removeVertex(geometry, action.address);
			if (removed.ok) return committed(geometry, history, removed.geometry);
			return {
				geometry,
				history: {
					...history,
					message:
						removed.reason === "too_few_points"
							? "Point not removed. A site outline edge must keep at least three points."
							: "Point not removed. Choose an outline point that still exists."
				}
			};
		}
		case "undo": {
			const previous = history.past.at(-1);
			if (!previous) return { geometry, history };
			return {
				geometry: previous,
				history: {
					past: history.past.slice(0, -1),
					future: [geometry, ...history.future],
					message: null
				}
			};
		}
		case "redo": {
			const next = history.future[0];
			if (!next) return { geometry, history };
			return {
				geometry: next,
				history: {
					past: [...history.past, geometry],
					future: history.future.slice(1),
					message: null
				}
			};
		}
	}
}
