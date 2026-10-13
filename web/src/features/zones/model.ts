import type { Clock } from "../../lib/time";
import { type DraftZone, partsOf } from "../../lib/zones/geometry";
import type { ZoneDraftSummary } from "../../lib/zones/schemas";
import type { HistoryRow } from "../packages/history";

/**
 * What the Zones page and the site page say about a site's zones (UI plan section 4 and 5.1): which entry a
 * person gets, the open drafts, each version, and each zone's shape. Pure, with relative imports only, so
 * the unit tests load it directly.
 */

/** Where a site stands for zone editing. */
export type ZoneEntry =
	/** No ready package: nothing to edit or show yet. */
	| "no-package"
	/** A package, but no usable site boundary or published form: history only. */
	| "unavailable"
	/** Managers can start and edit drafts; viewers see the versions. */
	| "editable";

export function zoneEntry(site: {
	readonly current_package_id: string | null;
	readonly zone_editing_available: boolean;
}): ZoneEntry {
	if (site.current_package_id === null) return "no-package";
	return site.zone_editing_available ? "editable" : "unavailable";
}

/** One open draft as the Zones page lists it. */
export type DraftRow = {
	readonly draftId: string;
	readonly mine: boolean;
	/** "Based on v1", and " · v2 is current" when that is no longer the current version. */
	readonly basedOn: string;
	/** Its base is not the current version: it cannot be published as it is. */
	readonly stale: boolean;
	/** "Edited Oct 13, 11:32 by JL". */
	readonly edited: string;
	readonly revision: number;
	readonly owner: string;
	/** The draft's ETag as listed, for discarding it from the list. */
	readonly etag: string;
};

function who(name: string | null, mine: boolean): string {
	if (mine) return "you";
	return name?.trim() || "another manager";
}

/** The site's open drafts, newest edit first. */
export function draftRows(
	drafts: readonly ZoneDraftSummary[],
	context: { readonly userId: string | null; readonly currentPackageId: string | null; readonly clock: Clock }
): DraftRow[] {
	return drafts
		.filter(draft => draft.state === "draft")
		.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
		.map(draft => {
			const mine = draft.created_by === context.userId;
			const stale = draft.base_package_id !== context.currentPackageId;
			const current = draft.current_package_version;
			return {
				draftId: draft.draft_id,
				mine,
				basedOn: `Based on v${draft.base_package_version}${stale && current !== null ? ` · v${current} is current` : ""}`,
				stale,
				edited: `Edited ${context.clock.dayTime(draft.updated_at)} by ${who(draft.updated_by_name, draft.updated_by === context.userId)}`,
				revision: draft.revision,
				owner: mine ? "Your draft" : `${who(draft.created_by_name, false)}’s draft`,
				etag: draft.etag
			};
		});
}

/** The manager's own open draft on the current version, newest edit first, or null. */
export function ownDraft(rows: readonly DraftRow[]): DraftRow | null {
	return rows.find(row => row.mine && !row.stale) ?? null;
}

/**
 * What starting a draft says when other managers have drafts on the same version: "JL has a draft based on
 * v1, edited Oct 13, 11:32. Both can be edited, but only the first one published becomes v2."
 */
export function othersNote(
	drafts: readonly ZoneDraftSummary[],
	context: { readonly userId: string | null; readonly currentPackageId: string | null; readonly clock: Clock }
): string | null {
	const others = drafts.filter(
		draft =>
			draft.state === "draft" &&
			draft.created_by !== context.userId &&
			draft.base_package_id === context.currentPackageId
	);
	if (others.length === 0) return null;
	const newest = [...others].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0]!;
	const next = newest.base_package_version + 1;
	const lead =
		others.length === 1
			? `${who(newest.created_by_name, false)} has a draft based on v${newest.base_package_version}, edited ${context.clock.dayTime(newest.updated_at)}.`
			: `${others.length} other managers have drafts based on v${newest.base_package_version}.`;
	return `${lead} ${others.length === 1 ? "Both" : "All"} can be edited, but only the first one published becomes v${next}.`;
}

/** A zone as the Zones page's table shows it. */
export type ZoneTableRow = {
	readonly zoneId: string;
	readonly label: string;
	readonly code: string;
	/** "1 part · 1 hole", "2 parts". */
	readonly shape: string;
};

export function zoneTableRows(zones: readonly DraftZone[]): ZoneTableRow[] {
	return zones.map(zone => {
		const parts = partsOf(zone.geometry);
		const holes = parts.reduce((sum, rings) => sum + Math.max(0, rings.length - 1), 0);
		const shape = [
			`${parts.length} ${parts.length === 1 ? "part" : "parts"}`,
			holes > 0 ? `${holes} ${holes === 1 ? "hole" : "holes"}` : null
		]
			.filter(Boolean)
			.join(" · ");
		return { zoneId: zone.zone_id, label: zone.zone_label, code: zone.zone_code, shape };
	});
}

/** One ready version of the site's zones. */
export type VersionRow = {
	readonly packageId: string;
	readonly version: number;
	readonly current: boolean;
	/** "Replaced by v2" for an earlier version. */
	readonly replacedBy: string | null;
	readonly published: string;
	/** "Drawn on the web" or "Imported from QGIS". */
	readonly madeBy: string;
	readonly changeNote: string;
};

/** The site's ready versions, newest first, from its package history; blocked packages are not versions. */
export function versionRows(history: readonly HistoryRow[]): VersionRow[] {
	const ready = history.filter(row => row.state !== "blocked").sort((a, b) => b.version - a.version);
	return ready.map((row, index) => ({
		packageId: row.packageId,
		version: row.version,
		current: row.state === "current",
		replacedBy: row.state === "current" ? null : index > 0 ? `Replaced by v${ready[index - 1]!.version}` : null,
		published: row.prepared,
		madeBy: row.source === "draft" ? "Drawn on the web" : "Imported from QGIS",
		changeNote: row.changeNote
	}));
}

/** The change note a restored version's draft starts with. */
export function restoreNote(version: number): string {
	return `Restores v${version} boundaries`;
}
