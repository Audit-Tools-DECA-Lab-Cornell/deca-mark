import type { Position, ZoneGeometry } from "../../lib/zones/geometry";
import type { Content, Role, SourceLayer } from "./schema";

export type SetupLoadDisposition = "capability-unavailable" | "setup-missing" | "failed";

/**
 * Distinguishes an older backend without the bare setup-list capability from one missing setup.
 * A specific setup returning 404 is stale work, not evidence that map setup itself is unavailable.
 */
export function classifySetupLoadFailure(
	failure: { readonly code: string; readonly status?: number },
	setupId?: string
): SetupLoadDisposition {
	if (failure.code !== "not_found" || failure.status !== 404) return "failed";
	return setupId === undefined ? "capability-unavailable" : "setup-missing";
}

export function closeOutline(points: readonly Position[]): ZoneGeometry | null {
	if (points.length < 3 || new Set(points.map(point => point.join(","))).size < 3) return null;
	if (
		points.some(
			([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90
		)
	)
		return null;
	const first = points[0];
	if (!first) return null;
	return { type: "Polygon", coordinates: [[...points, first]] };
}
export function allowedRoles(type: string): readonly Role[] {
	switch (type) {
		case "Polygon":
		case "MultiPolygon":
			return ["outline", "ground", "zones", "paths", "trees", "leave_out"];
		case "Point":
		case "MultiPoint":
			return ["trees", "leave_out"];
		case "LineString":
		case "MultiLineString":
			return ["paths", "leave_out"];
		default:
			return ["leave_out"];
	}
}
export function setupReady(content: Pick<Content, "outline" | "zones" | "form_version">): boolean {
	return content.outline !== null && content.zones.length > 0 && content.form_version !== null;
}
export function sourceDisposition(
	layers: readonly Pick<SourceLayer, "source_id" | "features">[],
	assignments: readonly { source_id: string; feature_key: string }[]
): number {
	return layers.flatMap(layer =>
		layer.features.filter(
			feature =>
				!assignments.some(
					item => item.source_id === layer.source_id && item.feature_key === feature.feature_key
				)
		)
	).length;
}

export function nextZoneCode(zones: readonly { readonly zone_code: string }[]): string {
	const used = new Set(zones.map(zone => zone.zone_code));
	let number = 1;
	while (used.has(`Z${number}`)) number += 1;
	return `Z${number}`;
}
