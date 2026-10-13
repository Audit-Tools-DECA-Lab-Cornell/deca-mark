"use client";

import { Island } from "@/components/contour/Island";
import { ScreenState } from "@/components/contour/ScreenState";
import { StateBadge } from "@/components/contour/StateBadge";
import { TextLink } from "@/components/contour/TextLink";
import { RowsTable } from "@/features/sites/parts";
import { plural } from "@/lib/labels";

import type { HistoryRow } from "./history";

function StateOf({ row }: { row: HistoryRow }) {
	if (row.state === "current") return <StateBadge kind="package" state="active" />;
	if (row.state === "archived") return <StateBadge kind="package" state="archived" />;
	return <StateBadge kind="check" state="fails" />;
}

function Notes({ row, currentVersion }: { row: HistoryRow; currentVersion: number | null }) {
	const origin = row.source === "draft" ? "Published from a draft on the web." : "Uploaded from QGIS.";
	const note = row.changeNote ? ` ${row.changeNote}` : "";
	if (row.state === "current")
		return (
			<span>
				Observers get this version. <span className="text-ink-2">{`${origin}${note}`}</span>
			</span>
		);
	if (row.state === "archived")
		return (
			<span className="text-ink-2">
				{currentVersion ? `Replaced by v${currentVersion}. ` : "Not the current version. "}
				Records collected on it keep it.{` ${origin}${note}`}
			</span>
		);
	return (
		<span>
			{row.blockedDetail ? `${row.blockedDetail} ` : ""}
			<span className="text-ink-2">It cannot be downloaded.</span>
		</span>
	);
}

/**
 * Version history: every map package of the site, newest first. The one the site names as current is
 * Active; other ready ones are Archived and stay readable; a blocked one fails, with the first reason it
 * was blocked.
 */
export function VersionHistory({
	rows,
	selectedId,
	packagesHref
}: {
	rows: HistoryRow[];
	/** The package open in Inspect, drawn as the selected row. */
	selectedId: string | null;
	/** The packages page; a version opens in Inspect at this address with `?package=<id>`. */
	packagesHref: string;
}) {
	const inspectHref = (packageId: string) => `${packagesHref}?package=${packageId}`;
	const currentVersion = rows.find(row => row.state === "current")?.version ?? null;
	return (
		<Island flush title="History" meta={plural(rows.length, "version")}>
			{rows.length === 0 ? (
				<ScreenState
					kind="empty"
					icon="layers"
					headingLevel={3}
					title="No map packages yet"
					body="The first package you upload becomes this site's map. Each upload after it is a new version."
				/>
			) : (
				<RowsTable
					caption="Map package versions, newest first"
					rows={rows}
					rowKey={row => row.packageId}
					selectedKey={selectedId}
					cardTitle={row => (
						<TextLink href={inspectHref(row.packageId)} tone="ink" className="type-mono-data font-semibold">
							v{row.version}
						</TextLink>
					)}
					columns={[
						{
							key: "version",
							label: "Version",
							hideInCard: true,
							mono: true,
							nowrap: true,
							cell: row => (
								<TextLink href={inspectHref(row.packageId)} tone="ink" className="font-semibold">
									v{row.version}
								</TextLink>
							)
						},
						{ key: "state", label: "State", cell: row => <StateOf row={row} /> },
						{ key: "prepared", label: "Prepared", nowrap: true, cell: row => row.prepared },
						{ key: "size", label: "Size", mono: true, nowrap: true, cell: row => row.sizeLabel },
						{
							key: "form",
							label: "Forms",
							mono: true,
							cell: row => (
								<span className="break-all">
									{row.inventoryFormVersion
										? `${row.formVersion} · ${row.inventoryFormVersion}`
										: row.formVersion}
								</span>
							)
						},
						{
							key: "notes",
							label: "Notes",
							cell: row => <Notes row={row} currentVersion={currentVersion} />
						}
					]}
				/>
			)}
		</Island>
	);
}
