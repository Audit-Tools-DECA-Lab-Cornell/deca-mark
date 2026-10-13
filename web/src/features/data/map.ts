import type { Observation, SummaryGroup } from "../../lib/api/observations";
import { formatCount, plural } from "../../lib/labels";

/**
 * Which map version Data's plan draws, and what it says about the observations it does not draw as its own
 * (UI plan 7.3, WUI-9). One version at a time: points recorded on another version are dimmed, because their
 * zones may differ from these boundaries, and inventories are listed by zone, never drawn as points. Pure,
 * with relative imports only, so the unit tests load it directly.
 */

/** Counts by site, map version and zone, as the summary groups them. */
export type MapGroup = Pick<
	SummaryGroup,
	"site_id" | "package_id" | "package_version" | "zone_id" | "zone_code" | "zone_label" | "spatial_support" | "count"
>;

/**
 * The loaded observations counted as the summary counts every match, for when the summary could not be
 * read. What these counts cover is then only what has loaded, and the page says so.
 */
export function loadedGroups(
	rows: readonly Pick<
		Observation,
		"site_id" | "package_id" | "package_version" | "zone_id" | "zone_code" | "zone_label" | "spatial_support"
	>[]
): MapGroup[] {
	const groups = new Map<string, MapGroup>();
	for (const row of rows) {
		const key = `${row.site_id}|${row.package_id}|${row.zone_id}|${row.spatial_support}`;
		const found = groups.get(key);
		groups.set(
			key,
			found
				? { ...found, count: found.count + 1 }
				: {
						site_id: row.site_id,
						package_id: row.package_id,
						package_version: row.package_version,
						zone_id: row.zone_id,
						zone_code: row.zone_code,
						zone_label: row.zone_label,
						spatial_support: row.spatial_support,
						count: 1
					}
		);
	}
	return [...groups.values()];
}

/** One map version of the site in view, with how many matching observations were recorded on it. */
export type MapVersionChoice = {
	readonly packageId: string;
	readonly version: number;
	readonly count: number;
	/** The site's current map version. */
	readonly current: boolean;
};

/** The site's map versions the matching observations were recorded on, newest first, with a count each. */
export function mapVersionChoices(
	groups: readonly MapGroup[],
	siteId: string,
	currentPackageId: string | null
): MapVersionChoice[] {
	const versions = new Map<string, { version: number; count: number }>();
	for (const group of groups) {
		if (group.site_id !== siteId || group.count === 0) continue;
		const found = versions.get(group.package_id) ?? { version: group.package_version, count: 0 };
		found.count += group.count;
		versions.set(group.package_id, found);
	}
	return [...versions]
		.map(([packageId, { version, count }]) => ({
			packageId,
			version,
			count,
			current: packageId === currentPackageId
		}))
		.sort((a, b) => b.version - a.version);
}

/**
 * The version the plan draws first: the one the filters name, else the current one when any match was
 * recorded on it, else the newest one a match was recorded on. Null when nothing matches.
 */
export function defaultMapVersion(
	choices: readonly MapVersionChoice[],
	filterPackageId: string | null
): MapVersionChoice | null {
	return (
		(filterPackageId ? choices.find(choice => choice.packageId === filterPackageId) : undefined) ??
		choices.find(choice => choice.current) ??
		choices[0] ??
		null
	);
}

/** "v2 (current) · 260 observations": a choice in the Boundaries picker. */
export function choiceLabel(choice: MapVersionChoice): string {
	return `v${choice.version}${choice.current ? " (current)" : ""} · ${plural(choice.count, "observation")}`;
}

/** The inventories of one zone on one map version. */
export type ZoneInventory = {
	readonly zoneId: string;
	readonly zoneLabel: string;
	readonly zoneCode: string;
	readonly packageId: string;
	readonly version: number;
	readonly count: number;
};

/**
 * The zone inventories in view at one site, one row per zone and map version, with the zone's name and code
 * as they were on that version. Newest version first, then by name.
 */
export function zoneInventories(groups: readonly MapGroup[], siteId: string): ZoneInventory[] {
	const rows = new Map<string, ZoneInventory>();
	for (const group of groups) {
		if (group.site_id !== siteId || group.spatial_support !== "zone" || group.count === 0) continue;
		const key = `${group.zone_id}|${group.package_id}`;
		const found = rows.get(key);
		rows.set(key, {
			zoneId: group.zone_id,
			zoneLabel: group.zone_label,
			zoneCode: group.zone_code,
			packageId: group.package_id,
			version: group.package_version,
			count: (found?.count ?? 0) + group.count
		});
	}
	return [...rows.values()].sort(
		(a, b) =>
			b.version - a.version || a.zoneLabel.localeCompare(b.zoneLabel, "en") || a.zoneId.localeCompare(b.zoneId)
	);
}

/** "v1", "v1 and v3", "v1, v2 and v4". */
export function versionList(versions: readonly number[]): string {
	const names = [...new Set(versions)].sort((a, b) => a - b).map(version => `v${version}`);
	if (names.length <= 1) return names.join("");
	return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Which version the plan is and which is current: "Drawn on map v1. v2 is current." */
export function drawnNote(version: number, currentVersion: number | null): string {
	if (currentVersion === version) return `Drawn on map v${version}, the site's current version.`;
	return currentVersion === null
		? `Drawn on map v${version}.`
		: `Drawn on map v${version}. v${currentVersion} is current.`;
}

/** Why some points are faint: "Points recorded on v1 are dimmed. Their zones may differ from these boundaries." */
export function dimmedNote(versions: readonly number[]): string | null {
	if (versions.length === 0) return null;
	return `Points recorded on ${versionList(versions)} are dimmed. Their zones may differ from these boundaries.`;
}

/**
 * What the map holds of what matches, when that is not everything: "The map shows the 500 loaded of 1,284
 * matching observations.", or, while a search narrows them, the ones it finds.
 */
export function subsetNote(input: {
	readonly loaded: number;
	readonly total: number;
	/** How many loaded observations the search finds, while a search is typed. */
	readonly searched: number | null;
}): string | null {
	const { loaded, total, searched } = input;
	if (searched !== null)
		return `The map shows the ${formatCount(searched)} of ${formatCount(loaded)} loaded observations the search finds.`;
	if (loaded >= total) return null;
	return `The map shows the ${formatCount(loaded)} loaded of ${formatCount(total)} matching observations.`;
}
