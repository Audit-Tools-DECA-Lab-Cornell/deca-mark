import { type DraftZone, partsOf, type PolygonRings, type Position, type Ring } from "@/lib/zones/geometry";
import { type SnapSource, traceRing } from "@/lib/zones/hints";

import { type Drawing, zoneName } from "./state";

/**
 * Tracing while drawing (UI plan 5.4): when the last two points of a shape snapped to the same ring, the
 * shape can follow that ring between them, copying its own points so the two zones share an edge exactly.
 * Each request flips the way round, so the second "Follow the edge" takes the other side.
 */

export type TraceOption = {
	/** "Slide", or "the site boundary". */
	readonly edgeName: string;
	readonly direction: 1 | -1;
	readonly between: readonly Position[];
};

function sameRing(a: SnapSource, b: SnapSource): boolean {
	if (a.part !== b.part || a.ring !== b.ring) return false;
	if (a.kind === "zone" && b.kind === "zone") return a.zoneId === b.zoneId;
	if (a.kind === "site" && b.kind === "site") return a.feature === b.feature;
	return false;
}

function ringOf(source: SnapSource, zones: readonly DraftZone[], site: readonly PolygonRings[]): Ring | undefined {
	if (source.kind === "site") return site[source.feature]?.[source.ring];
	const zone = zones.find(entry => entry.zone_id === source.zoneId);
	return zone ? partsOf(zone.geometry)[source.part]?.[source.ring] : undefined;
}

/** What "Follow the edge" would copy now, or null when the last two points are not on one ring. */
export function traceOption(
	drawing: Drawing | null,
	zones: readonly DraftZone[],
	site: readonly PolygonRings[]
): TraceOption | null {
	if (!drawing || drawing.tool !== "shape" || drawing.points.length < 2) return null;
	const last = drawing.points.length - 1;
	const first = last - 1 - (drawing.trace?.count ?? 0);
	const from = drawing.snaps[first];
	const to = drawing.snaps[last];
	if (first < 0 || !from || !to || !sameRing(from, to) || from.index === to.index) return null;
	const ring = ringOf(from, zones, site);
	if (!ring) return null;
	const direction: 1 | -1 = drawing.trace ? (drawing.trace.direction === 1 ? -1 : 1) : 1;
	const zone = from.kind === "zone" ? zones.find(entry => entry.zone_id === from.zoneId) : undefined;
	return {
		edgeName: zone ? zoneName(zone) : "the site boundary",
		direction,
		between: traceRing(ring, from.index, to.index, direction)
	};
}
