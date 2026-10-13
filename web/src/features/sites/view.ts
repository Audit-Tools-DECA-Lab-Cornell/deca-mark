import type { Site } from "@/lib/api/types";
import { formatBytes, plural } from "@/lib/labels";
import type { Clock } from "@/lib/time";

/**
 * What the Sites screens show about a site, worked out once on the server and passed to the screens as
 * plain values. A site's current package is the one its `current_package_id` names (the API's `package`).
 */

export type SitePackageView = {
	packageId: string;
	version: number;
	/** "Oct 07, 2026 · 14:05" in the project's timezone. */
	prepared: string;
	/** "Oct 07, 2026". */
	preparedDay: string;
	bytes: number;
	sizeLabel: string;
	/** The play form the package binds. */
	formVersion: string;
	/** The inventory form it binds, or null when Inventory is off on this map. */
	inventoryFormVersion: string | null;
};

export type SiteView = {
	/** The site's UUID, which API calls take. */
	siteId: string;
	/** The site's code, which web addresses carry. */
	code: string;
	name: string;
	description: string | null;
	/** The zones of the current package, in its order, by identity. */
	zones: { id: string; code: string; label: string }[];
	zonesLabel: string;
	observationCount: number;
	observationsLabel: string;
	package: SitePackageView | null;
};

export function siteView(site: Site, clock: Clock): SiteView {
	const zones = site.zones.map(zone => ({ id: zone.zone_id, code: zone.zone_code, label: zone.label }));
	const current = site.package;
	return {
		siteId: site.site_id,
		code: site.code,
		name: site.name,
		description: site.description?.trim() ? site.description.trim() : null,
		zones,
		zonesLabel: current ? plural(zones.length, "zone") : "No zones yet",
		observationCount: site.observation_count,
		observationsLabel: plural(site.observation_count, "observation"),
		package: current
			? {
					packageId: current.package_id,
					version: current.package_version,
					prepared: clock.dayTime(current.prepared_at),
					preparedDay: clock.day(current.prepared_at),
					bytes: current.archive_bytes,
					sizeLabel: formatBytes(current.archive_bytes),
					formVersion: current.forms.play.form_version,
					inventoryFormVersion: current.forms.inventory?.form_version ?? null
				}
			: null
	};
}

/** Sites by name, so the list reads the same on every visit. */
export function sortSites<T extends { name: string; code: string }>(sites: readonly T[]): T[] {
	return [...sites].sort((a, b) => a.name.localeCompare(b.name, "en") || a.code.localeCompare(b.code, "en"));
}

/** The first `limit` sites with a map package, whose plans the list draws as thumbnails. */
export function thumbnailSites<T extends { package: unknown }>(sites: readonly T[], limit = 6): T[] {
	return sites.filter(site => site.package !== null).slice(0, limit);
}

export type ZoneRow = {
	/** The zone's identity. */
	id: string;
	/** The zone's code, when the current map version has the zone. */
	code: string | null;
	/** Whether the current map version has this zone. */
	current: boolean;
	label: string;
	/** Observations in this zone, or null when they could not be counted. */
	count: number | null;
	countLabel: string | null;
};

/** Observation counts by zone, as the server summary groups them (every version and round). */
export type ZoneCountGroup = {
	readonly zone_id: string;
	readonly zone_label: string;
	readonly package_version: number;
	readonly count: number;
};

/**
 * The site's zones with how many observations each holds, counted by the server for every map version.
 * Zones of older versions that observations still name come after, under the label of the newest version
 * they were recorded on. Without the counts (`null`) the zones are listed without them.
 */
export function zoneRows(
	zones: readonly { id: string; code: string; label: string }[],
	groups: readonly ZoneCountGroup[] | null
): ZoneRow[] {
	if (groups === null)
		return zones.map(zone => ({
			id: zone.id,
			code: zone.code,
			current: true,
			label: zone.label,
			count: null,
			countLabel: null
		}));
	const counts = new Map<string, { count: number; label: string; version: number }>();
	for (const group of groups) {
		const entry = counts.get(group.zone_id) ?? { count: 0, label: group.zone_label, version: 0 };
		entry.count += group.count;
		if (group.package_version > entry.version) {
			entry.version = group.package_version;
			entry.label = group.zone_label;
		}
		counts.set(group.zone_id, entry);
	}
	const known = new Set(zones.map(zone => zone.id));
	const row = (id: string, code: string | null, label: string, count: number): ZoneRow => ({
		id,
		code,
		current: code !== null,
		label,
		count,
		countLabel: plural(count, "observation")
	});
	return [
		...zones.map(zone => row(zone.id, zone.code, zone.label, counts.get(zone.id)?.count ?? 0)),
		...[...counts]
			.filter(([id]) => !known.has(id))
			.map(([id, entry]) => row(id, null, entry.label, entry.count))
			.sort((a, b) => a.label.localeCompare(b.label, "en"))
	];
}
