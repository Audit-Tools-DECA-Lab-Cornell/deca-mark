import type { ZoneGeometry } from "../../lib/zones/geometry";
import { nextZoneCode } from "./model";
import type { Content, Role } from "./schema";

type Assignment = { source_id: string; feature_key: string; role: Role; zone_id?: string | null };

/**
 * Saved zone identities available to one imported feature. An identity already claimed by another
 * imported zone stays hidden, while the current feature may keep its own identity during an edit.
 */
export function availableZoneIdentityChoices(
	content: Pick<Content, "assignments" | "zones">,
	sourceId: string,
	featureKey: string
): Content["zones"] {
	const claimed = new Set(
		content.assignments
			.filter(
				item =>
					item.role === "zones" &&
					item.zone_id !== null &&
					(item.source_id !== sourceId || item.feature_key !== featureKey)
			)
			.map(item => item.zone_id)
	);
	return content.zones.filter(zone => !claimed.has(zone.zone_id));
}

/** Stable setup-local identity connects an adopted zone to its source across reloads. */
export async function adoptedZoneId(setupId: string, sourceId: string, featureKey: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(`${setupId}:${sourceId}:${featureKey}`)
	);
	const bytes = new Uint8Array(digest).slice(0, 16);
	bytes[6] = ((bytes[6] ?? 0) & 15) | 64;
	bytes[8] = ((bytes[8] ?? 0) & 63) | 128;
	const hex = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function assignFeature(
	content: Content,
	assignment: Assignment,
	geometry: ZoneGeometry | null,
	zoneId: string,
	label = ""
): Content {
	const prior = content.assignments.find(
		item => item.source_id === assignment.source_id && item.feature_key === assignment.feature_key
	);
	const assignments = content.assignments.filter(
		item => !(item.source_id === assignment.source_id && item.feature_key === assignment.feature_key)
	);
	const existing = content.zones.find(zone => zone.zone_id === zoneId);
	const zones = content.zones.filter(zone => zone.zone_id !== zoneId);
	return {
		...content,
		assignments: [...assignments, { ...assignment, zone_id: assignment.role === "zones" ? zoneId : null }],
		outline: assignment.role === "outline" ? geometry : prior?.role === "outline" ? null : content.outline,
		zones:
			assignment.role === "zones" && geometry
				? [
						...zones,
						{
							zone_id: zoneId,
							zone_code: existing?.zone_code ?? nextZoneCode(zones),
							zone_label: existing?.zone_label ?? label,
							geometry
						}
					]
				: zones
	};
}
