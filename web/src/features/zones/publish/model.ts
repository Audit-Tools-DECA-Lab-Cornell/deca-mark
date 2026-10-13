import type { Publication } from "../../../lib/api/sites";
import type { DraftZone } from "../../../lib/zones/geometry";
import type { ZoneValidation } from "../../../lib/zones/schemas";

/**
 * What the review before publishing says (UI plan 5.10): what changed against the version the draft started
 * from, whether this exact revision is ready, and what a publication's answer means. Pure, with relative
 * imports only, so the unit tests load it directly.
 */

export type ChangeKind = "added" | "removed" | "geometry_changed" | "label_changed" | "unchanged";

export type ChangeRow = { readonly zoneId: string; readonly name: string; readonly change: ChangeKind };

const ORDER: readonly ChangeKind[] = ["geometry_changed", "added", "label_changed", "removed", "unchanged"];

/** The words for a change, as the changes list shows them. */
export const CHANGE_WORDS: Readonly<Record<ChangeKind, string>> = {
	geometry_changed: "Boundary changed",
	added: "New zone",
	label_changed: "Name changed",
	removed: "Removed",
	unchanged: "Unchanged"
};

/**
 * Each zone's change as DECA Mark classified it for this revision against the base version, with its name
 * in the draft (or, removed, in the base). Changed zones first. A zone the check did not classify is left
 * out, never guessed from the coordinates.
 */
export function changeRows(
	validation: ZoneValidation,
	draftZones: readonly DraftZone[],
	baseZones: readonly DraftZone[]
): ChangeRow[] {
	const names = new Map<string, string>();
	for (const zone of baseZones) names.set(zone.zone_id, zone.zone_label.trim() || zone.zone_code);
	for (const zone of draftZones) names.set(zone.zone_id, zone.zone_label.trim() || zone.zone_code);
	return validation.zones
		.flatMap(zone =>
			zone.change
				? [{ zoneId: zone.zone_id, name: names.get(zone.zone_id) ?? "A zone", change: zone.change }]
				: []
		)
		.sort((a, b) => ORDER.indexOf(a.change) - ORDER.indexOf(b.change) || a.name.localeCompare(b.name, "en"));
}

/** "2 boundaries changed · 1 new zone · 1 removed", or "No changes from v1". */
export function changeSummary(rows: readonly ChangeRow[], baseVersion: number): string {
	const count = (kind: ChangeKind) => rows.filter(row => row.change === kind).length;
	const parts = [
		[count("geometry_changed"), "boundary changed", "boundaries changed"],
		[count("added"), "new zone", "new zones"],
		[count("label_changed"), "name changed", "names changed"],
		[count("removed"), "removed", "removed"]
	] as const;
	const words = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
	return words.length > 0 ? words.join(" · ") : `No changes from v${baseVersion}`;
}

/** The zones the review map hatches: their boundary changed, or they are new. */
export function hatchedZones(rows: readonly ChangeRow[]): Set<string> {
	return new Set(
		rows.filter(row => row.change === "geometry_changed" || row.change === "added").map(row => row.zoneId)
	);
}

/** Where `sessionStorage` keeps the request ID for publishing one revision, so a reload sends the same one. */
export function publishRequestKey(draftId: string, revision: number): string {
	return `zone-publish:${draftId}:${revision}`;
}

/** Why "Publish" waits, or null when this revision can be published. */
export function publishUnavailable(input: {
	readonly ready: boolean;
	readonly checkedRevision: number | null;
	readonly revision: number;
	readonly unsaved: boolean;
	readonly stale: boolean;
	readonly confirmed: boolean;
	readonly blocking: number;
}): string | null {
	if (input.stale) return "This draft is not based on the current version, so it cannot be published.";
	if (input.unsaved) return "Publishing waits until your changes are saved.";
	if (input.checkedRevision !== input.revision) return "Publishing waits until DECA Mark has checked this revision.";
	if (!input.ready)
		return input.blocking > 0
			? "Fix the problems listed first, in the editor."
			: "DECA Mark did not find this revision ready to publish.";
	if (!input.confirmed) return "Confirm that published boundaries cannot be edited.";
	return null;
}

/** What a publication's answer says (UI plan 5.10). A replay never claims to be current when it is not. */
export function publishedLine(publication: Publication): { readonly title: string; readonly body: string } {
	const version = publication.package.package_version;
	const current = publication.current_package_id === publication.package.package_id;
	if (!publication.replayed)
		return {
			title: `v${version} is published.`,
			body: "Observers use it after they download it in the DECA Mark app."
		};
	// The answer names this draft's version only; the later one is not read here, so it is not named.
	return {
		title: `This draft was already published as v${version}.`,
		body: current ? `v${version} is the current version.` : "A later version is current now."
	};
}
