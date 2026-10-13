import type { PackageHistory, PackageSummary, PreparationCheck } from "@/lib/api/types";
import { formatBytes } from "@/lib/labels";
import type { Clock } from "@/lib/time";

/**
 * A site's map packages as the history shows them. The current package is the one the site's
 * `current_package_id` names: a publication or an upload makes it current, and a replayed or later
 * request never moves it back, so "the newest ready one" is not a stand-in. Other ready packages are
 * earlier versions that stay readable for records collected on them; a blocked package stays in the
 * history with the reason it failed and cannot be downloaded.
 */

export type HistoryState = "current" | "archived" | "blocked";

export type HistoryRow = {
	packageId: string;
	version: number;
	state: HistoryState;
	/** "Oct 07, 2026 · 14:05" in the project's timezone. */
	prepared: string;
	bytes: number;
	sizeLabel: string;
	/** The play form the package binds. */
	formVersion: string;
	/** The inventory form it binds, or null when Inventory is off on this map. */
	inventoryFormVersion: string | null;
	/** Where the version came from: an upload from QGIS, or a draft published on the web. */
	source: "upload" | "draft";
	/** The note its author wrote, or "". */
	changeNote: string;
	/** For a blocked package: the first check that blocked it, when it has been read. */
	blockedDetail: string | null;
};

/** The first check that blocked a package, in the order the checks ran. */
export function firstBlockedDetail(checks: readonly PreparationCheck[]): string | null {
	return checks.find(check => check.state === "blocked")?.detail ?? null;
}

/** The package the site's `current_package_id` names, or null (no package yet, or not in this list). */
export function currentPackage(history: PackageHistory): PackageSummary | null {
	return history.packages.find(item => item.package_id === history.current_package_id) ?? null;
}

/** The blocked packages whose checks the history reads to say why, newest first, at most `limit`. */
export function blockedToExplain(packages: readonly PackageSummary[], limit = 8): string[] {
	return packages
		.filter(item => item.state === "blocked")
		.sort((a, b) => b.package_version - a.package_version)
		.slice(0, limit)
		.map(item => item.package_id);
}

export function historyRows(
	history: PackageHistory,
	clock: Clock,
	blockedDetails: Readonly<Record<string, string | null | undefined>> = {}
): HistoryRow[] {
	return [...history.packages]
		.sort((a, b) => b.package_version - a.package_version)
		.map(item => ({
			packageId: item.package_id,
			version: item.package_version,
			state:
				item.state === "blocked"
					? "blocked"
					: item.package_id === history.current_package_id
						? "current"
						: "archived",
			prepared: clock.dayTime(item.prepared_at),
			bytes: item.archive_bytes,
			sizeLabel: formatBytes(item.archive_bytes),
			formVersion: item.forms.play.form_version,
			inventoryFormVersion: item.forms.inventory?.form_version ?? null,
			source: item.source,
			changeNote: item.change_note.trim(),
			blockedDetail: item.state === "blocked" ? (blockedDetails[item.package_id] ?? null) : null
		}));
}
