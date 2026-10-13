import { plural, roundLabel } from "@/lib/labels";
import type { RoundType } from "@/lib/workspace/types";

/**
 * The QGIS page's words and rows, apart from the screen. Pure, so the tests load it directly.
 */

type SiteLike = {
	readonly site_id: string;
	readonly code: string;
	readonly name: string;
	readonly zones: readonly unknown[];
	/** The package `current_package_id` names. */
	readonly package: {
		readonly package_id: string;
		readonly package_version: number;
		readonly archive_bytes: number;
		readonly prepared_at: string;
		readonly forms: { readonly play: { readonly form_version: string } };
	} | null;
};

/** A site and the map package observers download for it, as the page's "Maps in" list shows it. */
export type MapRow = {
	readonly siteId: string;
	readonly code: string;
	readonly name: string;
	readonly zoneCount: number;
	readonly package: {
		readonly id: string;
		readonly version: number;
		readonly bytes: number;
		readonly preparedAt: string;
		readonly formVersion: string | null;
	} | null;
};

export function mapRows(sites: readonly SiteLike[]): MapRow[] {
	return sites.map(site => ({
		siteId: site.site_id,
		code: site.code,
		name: site.name,
		zoneCount: site.zones.length,
		package: site.package
			? {
					id: site.package.package_id,
					version: site.package.package_version,
					bytes: site.package.archive_bytes,
					preparedAt: site.package.prepared_at,
					formVersion: site.package.forms.play.form_version
				}
			: null
	}));
}

/**
 * What the files hold, in one line: "8 observations · Fall Creek test site · Reliability round". An
 * unfiltered side reads "All sites" or "All rounds".
 */
export function exportScope(input: {
	readonly count: number;
	readonly siteName: string | null;
	readonly round: RoundType | null;
}): string {
	return [
		plural(input.count, "observation"),
		input.siteName ?? "All sites",
		input.round ? roundLabel(input.round) : "All rounds"
	].join(" · ");
}
