import { type DraftZone, sameGeometry } from "@/lib/zones/geometry";

import type { DraftSnapshot } from "./save-queue";
import { zoneName } from "./state";

/**
 * What a conflict choice needs (UI plan 5.9, WUI-7): which zones differ between the edits in this tab and
 * the draft someone else saved, and the edits as a file the manager keeps, so nothing depends on the tab
 * staying open. Pure, so the unit tests load it.
 */

/** The zones that differ between two drafts, by name, in the order of `mine` and then of `theirs`. */
export function differingZones(mine: readonly DraftZone[], theirs: readonly DraftZone[]): string[] {
	const other = new Map(theirs.map(zone => [zone.zone_id, zone]));
	const names: string[] = [];
	for (const zone of mine) {
		const saved = other.get(zone.zone_id);
		if (
			!saved ||
			saved.zone_code !== zone.zone_code ||
			saved.zone_label.trim() !== zone.zone_label.trim() ||
			!sameGeometry(saved.geometry, zone.geometry)
		)
			names.push(zoneName(zone));
		other.delete(zone.zone_id);
	}
	for (const zone of other.values()) names.push(zoneName(zone));
	return names;
}

/** "North meadow, Slide and 3 more": a short list of names for a sentence. */
export function nameList(names: readonly string[], shown = 3): string {
	if (names.length === 0) return "";
	const head = names.slice(0, shown);
	const rest = names.length - head.length;
	if (rest > 0) return `${head.join(", ")} and ${rest} more`;
	if (head.length === 1) return head[0]!;
	return `${head.slice(0, -1).join(", ")} and ${head.at(-1)}`;
}

/** What differs between the edits in this tab and the saved draft, as the conflict dialog says it. */
export function conflictLine(mine: DraftSnapshot, theirs: DraftSnapshot): string {
	const zones = differingZones(mine.zones, theirs.zones);
	const note = mine.changeNote.trim() !== theirs.changeNote.trim();
	if (zones.length === 0)
		return note
			? "The saved draft has the same zones as yours. Its change note differs."
			: "The saved draft has the same zones and change note as yours.";
	return note
		? `Zones that differ: ${nameList(zones)}. The change note differs too.`
		: `Zones that differ: ${nameList(zones)}.`;
}

/** The edits in this tab as a GeoJSON file for QGIS: every zone with its identity, code and name. */
export function draftGeoJson(zones: readonly DraftZone[]): string {
	return `${JSON.stringify(
		{
			type: "FeatureCollection",
			features: zones.map(zone => ({
				type: "Feature",
				id: zone.zone_id,
				geometry: zone.geometry,
				properties: { zone_id: zone.zone_id, zone_code: zone.zone_code, zone_label: zone.zone_label }
			}))
		},
		null,
		2
	)}\n`;
}

/** "fall-creek-zones-draft-r6.geojson": the edits made on revision 6 of a draft. */
export function draftFileName(siteCode: string, revision: number): string {
	return `${siteCode}-zones-draft-r${revision}.geojson`;
}
