import {
	interiorAnchor,
	partsCentroid,
	type PlanFrame,
	type PlanParts,
	type PlanPoint,
	type PlanZone,
	projectParts
} from "@/lib/plan";
import type { DraftZone, ZoneGeometry } from "@/lib/zones/geometry";

/**
 * Draft zones drawn on the plan. Each geometry object is projected once per frame and remembered, so a drag
 * re-projects only the zone it moves: every other zone keeps its geometry object, and its drawing. Projection
 * is for drawing only; nothing here is ever turned back into a coordinate.
 */

type Projected = { readonly frame: PlanFrame; readonly parts: PlanParts; anchor: PlanPoint | null };

const projected = new WeakMap<ZoneGeometry, Projected>();

function partsFor(geometry: ZoneGeometry, frame: PlanFrame): Projected {
	const cached = projected.get(geometry);
	if (cached && cached.frame === frame) return cached;
	const entry: Projected = { frame, parts: projectParts(geometry, frame), anchor: null };
	projected.set(geometry, entry);
	return entry;
}

/** Where the zone's name pill sits: the inside point farthest from its edges, worked out once per shape. */
function anchorFor(geometry: ZoneGeometry, frame: PlanFrame): PlanPoint {
	const entry = partsFor(geometry, frame);
	entry.anchor ??= interiorAnchor(entry.parts);
	return entry.anchor;
}

/**
 * A draft zone as the plan draws it. While a point is dragged, `labelFrom` names the shape the drag started
 * from, so the name pill stays put instead of searching the moving shape every frame.
 */
export function planZone(zone: DraftZone, frame: PlanFrame, labelFrom?: ZoneGeometry): PlanZone {
	const { parts } = partsFor(zone.geometry, frame);
	return {
		id: zone.zone_id,
		zoneId: zone.zone_id,
		code: zone.zone_code,
		name: zone.zone_label.trim() || zone.zone_code,
		geometry: zone.geometry,
		parts,
		centroid: partsCentroid(parts),
		labelAnchor: anchorFor(labelFrom ?? zone.geometry, frame)
	};
}
