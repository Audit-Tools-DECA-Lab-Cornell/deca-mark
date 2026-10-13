import type { ObservationFilters } from "../api/observations";
import { formatCount, roundLabel } from "../labels";
import { addDays, type Clock } from "../time";

/**
 * Observation exports are made by DECA Mark for the same filters the page applies (contract "Observation
 * reads, filters and exports"): one ZIP holding the observations as CSV or GeoJSON, a codebook of every
 * column, the forms they were answered with and the zone boundaries they were recorded on. The browser only
 * names the file and says what it holds. Pure, so the unit tests load it.
 */

/** The most observations one export holds (`ROW_LIMIT` in `backend/.../domain/observation_export.py`). */
export const EXPORT_LIMIT = 10_000;

export const EXPORT_TOO_LARGE = "One export holds up to 10,000 observations. Narrow the dates or choose one site.";

/** Why the export cannot be made for this many matching observations, or null when it can. */
export function exportBlocked(matching: number): string | null {
	if (matching === 0) return "No observations match these filters. Change the filters to export.";
	if (matching > EXPORT_LIMIT) return EXPORT_TOO_LARGE;
	return null;
}

/** "fall-creek-observations-2026-10-08.zip": the site's code (or the project's) and the project's day. */
export function exportFileName(stem: string, dayKey: string): string {
	return `${stem}-observations-${dayKey}.zip`;
}

/** "fall-creek-zones-v3.geojson": one map version's zone boundaries. */
export function zonesFileName(siteCode: string, version: number): string {
	return `${siteCode}-zones-v${version}.geojson`;
}

/** What a scope's filters say, in words, for the export dialog and the QGIS page. */
export type ScopeWords = {
	readonly site: string | null;
	/** The zones' names, when zones are chosen. */
	readonly zones: readonly string[];
	/** One map version, when the zones are matched on one version only. */
	readonly version: number | null;
	readonly round: ObservationFilters["roundType"] | null;
	readonly observer: string | null;
	/** Day keys in the project's time zone; `to` is included. */
	readonly from: string | null;
	readonly to: string | null;
};

/**
 * The scope as lines a person can check before downloading: each filter, how zones match, and the days in
 * the project's time zone with the exact instants DECA Mark compares (`to` is included, so the end is the
 * start of the next day).
 */
export function scopeLines(scope: ScopeWords, clock: Pick<Clock, "dayStart" | "keyLabel" | "timeZone">): string[] {
	const lines = [scope.site ? `Site: ${scope.site}` : "All sites"];
	if (scope.zones.length > 0)
		lines.push(
			`${scope.zones.length === 1 ? "Zone" : "Zones"}: ${scope.zones.join(", ")} · ${
				scope.version === null
					? "every map version, by the zone's identity"
					: `only what was recorded on map v${scope.version}`
			}`
		);
	lines.push(scope.round ? roundLabel(scope.round) : "All rounds");
	if (scope.observer) lines.push(`Observer: ${scope.observer}`);
	if (scope.from || scope.to) {
		const first = scope.from ? clock.keyLabel(scope.from) : "the first observation";
		const last = scope.to ? clock.keyLabel(scope.to) : "the newest observation";
		const start = scope.from ? clock.dayStart(scope.from) : null;
		const end = scope.to ? clock.dayStart(addDays(scope.to, 1)) : null;
		const bounds = [start ? `from ${start}` : null, end ? `before ${end}` : null].filter(Boolean).join(" ");
		lines.push(`Days: ${first} to ${last} in ${clock.timeZone} (${bounds}, UTC)`);
	} else lines.push("All days");
	return lines;
}

/** "Export 1,284 matching observations": the button's words. */
export function exportAction(matching: number): string {
	return `Export ${formatCount(matching)} matching ${matching === 1 ? "observation" : "observations"}`;
}

type Position = readonly [number, number];
type MultiPolygon = {
	readonly type: "MultiPolygon";
	readonly coordinates: readonly (readonly (readonly Position[])[])[];
};

/** One map version's zones as the API serves them (`GET …/sites/{site_id}/zones?package_id=`). */
export type HistoricalZonesLike = {
	readonly site_id: string;
	readonly package_id: string;
	readonly package_version: number;
	readonly zones: readonly {
		readonly zone_id: string;
		readonly zone_code: string;
		readonly zone_label: string;
		readonly geometry: MultiPolygon | { readonly type: string; readonly coordinates: unknown };
	}[];
};

/**
 * One map version's zone boundaries as a GeoJSON FeatureCollection for QGIS: each zone's exact geometry
 * (EPSG:4326, holes and parts kept) with its identity, code, name and version, so exports join to it by
 * `zone_id` and `map_version`.
 */
export function zonesGeoJson(historical: HistoricalZonesLike, siteCode: string): string {
	const features = historical.zones.map(zone => ({
		type: "Feature",
		id: zone.zone_id,
		geometry: zone.geometry,
		properties: {
			zone_id: zone.zone_id,
			zone_code: zone.zone_code,
			zone_label: zone.zone_label,
			site_id: historical.site_id,
			site_code: siteCode,
			package_id: historical.package_id,
			map_version: historical.package_version
		}
	}));
	return `${JSON.stringify({ type: "FeatureCollection", features }, null, 2)}\n`;
}
