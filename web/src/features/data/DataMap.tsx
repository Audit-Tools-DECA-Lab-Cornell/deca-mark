"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Field } from "@/components/contour/Field";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/contour/Table";
import { TextLink } from "@/components/contour/TextLink";
import { useRovingRows } from "@/components/contour/useRovingRows";
import { MapFrame } from "@/components/map/MapFrame";
import type { PlanObservation, ZonePlanStyle } from "@/components/map/SitePlan";
import { useWorkspace } from "@/features/shell/WorkspaceProvider";
import { formatCount, plural } from "@/lib/labels";
import type { ProjectedSite } from "@/lib/plan";

import { loadSitePlanAction } from "./actions";
import {
	choiceLabel,
	dimmedNote,
	drawnNote,
	loadedGroups,
	type MapGroup,
	type MapVersionChoice,
	mapVersionChoices,
	subsetNote,
	zoneInventories
} from "./map";
import { packagePlans, planKey } from "./plans";
import type { DataRecord } from "./view";

export type DataPlan = {
	/** The map version drawn first, as a plan. */
	site: ProjectedSite;
	siteId: string;
	siteCode: string;
	siteName: string;
	packageId: string;
	version: number;
	/** The site's current map version, which may be another one. */
	currentPackageId: string | null;
	currentVersion: number | null;
	/** DECA Mark's counts of every match at this site; null when they could not be read. */
	groups: MapGroup[] | null;
};

export type DataMapProps = {
	org: string;
	project: string;
	projectId: string;
	plan: DataPlan;
	/** Every loaded record: what the counts cover when DECA Mark's could not be read. */
	loaded: readonly DataRecord[];
	/** The loaded records the search finds: the points the map draws. */
	shown: readonly DataRecord[];
	total: number;
	searched: boolean;
	/** The zones the filters choose, by identity. */
	filterZones: readonly string[];
	selected: DataRecord | null;
	onSelectObservation: (id: string) => void;
	hrefOf: (record: DataRecord) => string;
};

type Drawn = { packageId: string; version: number; site: ProjectedSite };
type Version = { packageId: string; version: number };

/** A marker's accessible name; a point of another map version says so. */
function markerLabel(record: DataRecord, dimmed: boolean): string {
	const name = `${record.label}, ${record.zoneLabel}, ${record.roundName}, map ${record.mapVersion}`;
	return dimmed ? `${name}, recorded on another map version` : name;
}

/** Where the selected record is on the plan, after its facts. */
function whereOnPlan(record: DataRecord, drawn: Drawn, siteCode: string): string {
	if (record.siteCode !== siteCode) return " · not on this plan";
	if (record.wholeZone)
		return record.packageId === drawn.packageId
			? " · the whole zone, hatched on the plan"
			: ` · the whole zone on map ${record.mapVersion}`;
	return record.packageId === drawn.packageId ? "" : " · dimmed: recorded on another map version";
}

/**
 * The site plan beside Data's table: one map version at a time (UI plan 7.3). The Boundaries picker lists
 * the versions the matches were recorded on, with DECA Mark's counts; points recorded on another version
 * are dimmed, never drawn as if these boundaries were theirs. Zone inventories are listed by zone and map
 * version under the plan, and choosing one hatches its zone on its own version. Plans the browser has
 * already read are kept per package for this account.
 */
export function DataMap({
	org,
	project,
	projectId,
	plan,
	loaded,
	shown,
	total,
	searched,
	filterZones,
	selected,
	onSelectObservation,
	hrefOf
}: DataMapProps) {
	const { account } = useWorkspace();
	const [drawn, setDrawn] = useState<Drawn>({ packageId: plan.packageId, version: plan.version, site: plan.site });
	const [loading, setLoading] = useState<Version | null>(null);
	const [problem, setProblem] = useState<{ version: Version; message: string } | null>(null);
	const [inventoryKey, setInventoryKey] = useState<string | null>(null);
	// Selecting another observation ends the inventory chosen below: one zone is hatched, the one chosen last.
	const selectedId = selected?.id ?? null;
	const [selectedBefore, setSelectedBefore] = useState(selectedId);
	if (selectedId !== selectedBefore) {
		setSelectedBefore(selectedId);
		setInventoryKey(null);
	}
	// The read asked for last: an answer to any earlier one, even for the same version, is dropped.
	const asked = useRef<{ packageId: string; token: number } | null>(null);
	const reads = useRef(0);

	// The plan drawn on the server is kept too, so coming back to its version reads nothing.
	useEffect(() => {
		packagePlans.remember(planKey(account.userId, projectId, plan.packageId), plan.site);
	}, [account.userId, projectId, plan.packageId, plan.site]);

	const groups = plan.groups ?? loadedGroups(loaded.map(record => record.row));
	const counted = plan.groups ? "every matching observation" : "the loaded observations";
	const found = mapVersionChoices(groups, plan.siteId, plan.currentPackageId);
	const choices: MapVersionChoice[] = found.some(choice => choice.packageId === drawn.packageId)
		? found
		: [
				{
					packageId: drawn.packageId,
					version: drawn.version,
					count: 0,
					current: drawn.packageId === plan.currentPackageId
				},
				...found
			].sort((a, b) => b.version - a.version);
	const inventories = zoneInventories(groups, plan.siteId);
	const inventory = inventories.find(row => `${row.zoneId}|${row.packageId}` === inventoryKey) ?? null;

	async function show(version: Version) {
		if (version.packageId === drawn.packageId) {
			asked.current = null;
			setLoading(null);
			setProblem(null);
			return;
		}
		// The version already on its way is not asked for again.
		if (asked.current?.packageId === version.packageId) return;
		setProblem(null);
		const key = planKey(account.userId, projectId, version.packageId);
		const kept = packagePlans.recall(key);
		if (kept) {
			asked.current = null;
			setLoading(null);
			setDrawn({ ...version, site: kept });
			return;
		}
		reads.current += 1;
		const token = reads.current;
		asked.current = { packageId: version.packageId, token };
		const latest = () => asked.current?.token === token;
		setLoading(version);
		let message: string;
		try {
			const read = await loadSitePlanAction({ org, project }, plan.siteCode, version.packageId);
			if (!latest()) return;
			if (read.status === "loaded") {
				packagePlans.remember(key, read.site);
				setDrawn({ ...version, site: read.site });
				return;
			}
			message = read.message;
		} catch {
			if (!latest()) return;
			message = "Check the connection and try again.";
		} finally {
			if (latest()) {
				asked.current = null;
				setLoading(null);
			}
		}
		setProblem({ version, message });
	}

	/* ── What the plan draws ───────────────────────────────────────────── */

	const points = shown.filter(record => record.siteCode === plan.siteCode && record.point !== null);
	const markers: PlanObservation[] = points.map(record => {
		const dim = record.packageId !== drawn.packageId;
		return { id: record.id, lng: record.point![0], lat: record.point![1], label: markerLabel(record, dim), dim };
	});
	const onDrawn = markers.filter(marker => !marker.dim).length;
	const dimmed = dimmedNote([
		...new Set(
			points.filter(record => record.packageId !== drawn.packageId).map(record => record.row.package_version)
		)
	]);
	const subset = subsetNote({ loaded: loaded.length, total, searched: searched ? shown.length : null });

	// An inventory hatches its zone on its own version: the one chosen below, else the selected record.
	const hatched =
		inventory && inventory.packageId === drawn.packageId
			? inventory.zoneId
			: selected?.wholeZone && selected.siteCode === plan.siteCode && selected.packageId === drawn.packageId
				? selected.zone
				: null;
	const zoneStyles: Record<string, ZonePlanStyle> | undefined =
		filterZones.length > 0 || hatched
			? Object.fromEntries(
					drawn.site.zones.map(zone => {
						const chosen = zone.id === hatched || filterZones.includes(zone.id);
						const style: ZonePlanStyle = {
							emphasis: chosen ? "focus" : filterZones.length > 0 ? "dim" : undefined,
							hatched: zone.id === hatched
						};
						return [zone.id, style];
					})
				)
			: undefined;

	const selectedInventory = inventories.findIndex(row => row === inventory);
	const { bodyProps, rowProps } = useRovingRows({
		count: inventories.length,
		selectedIndex: selectedInventory,
		onSelect: index => {
			const row = inventories[index];
			if (!row) return;
			setInventoryKey(`${row.zoneId}|${row.packageId}`);
			void show({ packageId: row.packageId, version: row.version });
		}
	});

	return (
		<div className="flex min-w-0 flex-col gap-6">
			<Island
				title="Site plan"
				meta={`${plan.siteName} · Map v${drawn.version}${drawn.packageId === plan.currentPackageId ? " (current)" : ""}`}>
				<div className="flex flex-col gap-4">
					{choices.length > 1 && (
						<Field
							label="Boundaries"
							htmlFor="data-boundaries"
							hint={`The map versions the matches were recorded on, counted from ${counted}.`}>
							<Select
								id="data-boundaries"
								value={loading?.packageId ?? drawn.packageId}
								onChange={event => {
									const choice = choices.find(item => item.packageId === event.target.value);
									if (choice) void show(choice);
								}}>
								{choices.map(choice => (
									<option key={choice.packageId} value={choice.packageId}>
										{choiceLabel(choice)}
									</option>
								))}
							</Select>
						</Field>
					)}
					{/* Always present, so a change of version is announced; seen only while one loads. */}
					<p aria-live="polite" className={loading ? "type-small text-ink-2" : "sr-only"}>
						{loading
							? `Loading map v${loading.version}…`
							: problem
								? `Map v${problem.version.version} did not load.`
								: `Drawn on map v${drawn.version}.`}
					</p>
					{problem && (
						<Note tone="attention" title={`Map v${problem.version.version} did not load.`}>
							<span className="flex flex-col items-start gap-3">
								<span>
									{problem.message} The plan still shows v{drawn.version}.
								</span>
								<Button
									variant="outline"
									size="sm"
									icon="rotate-cw"
									onClick={() => void show(problem.version)}>
									Try again
								</Button>
							</span>
						</Note>
					)}
					<MapFrame
						key={drawn.packageId}
						site={drawn.site}
						surface="panel"
						mapVersion={`v${drawn.version}`}
						title={plan.siteName}
						subtitle={`${plural(onDrawn, "point")} on v${drawn.version}${
							markers.length > onDrawn ? ` · ${plural(markers.length - onDrawn, "dimmed point")}` : ""
						}`}
						observations={markers}
						zones={zoneStyles}
						selectedId={selected && markers.some(marker => marker.id === selected.id) ? selected.id : null}
						onSelectObservation={onSelectObservation}
					/>
					<div aria-live="polite" className="type-body">
						{selected ? (
							<p>
								<span className="type-mono-data font-semibold">{selected.label}</span> ·{" "}
								{selected.zoneLabel} · {selected.roundName} · Map {selected.mapVersion} ·{" "}
								{selected.when}
								{whereOnPlan(selected, drawn, plan.siteCode)}{" "}
								<TextLink tone="ink" href={hrefOf(selected)}>
									Open observation
								</TextLink>
							</p>
						) : (
							<p className="text-ink-2">Select a marker or a row to see which observation it is.</p>
						)}
					</div>
					<p className="type-small text-ink-2">
						{[drawnNote(drawn.version, plan.currentVersion), dimmed, subset].filter(Boolean).join(" ")}
					</p>
				</div>
			</Island>

			{inventories.length > 0 && (
				<Island
					flush
					title="Zone inventories in this view"
					meta={plural(
						inventories.reduce((sum, row) => sum + row.count, 0),
						"inventory",
						"inventories"
					)}
					footnote={`An inventory describes a whole zone, so it has no point. Choose one to hatch its zone on the map version it was recorded on. Counted from ${counted}.`}>
					<Table caption="Zone inventories in this view. Arrow keys move the selection; the chosen zone is hatched on its map version.">
						<THead>
							<tr>
								<Th>Zone</Th>
								<Th>Map</Th>
								<Th numeric>Inventories</Th>
							</tr>
						</THead>
						<TBody {...bodyProps}>
							{inventories.map((row, index) => (
								<Tr key={`${row.zoneId}|${row.packageId}`} {...rowProps(index)}>
									<Td>
										<span className="block">{row.zoneLabel}</span>
										<span className="block type-mono-data text-ink-2">{row.zoneCode}</span>
									</Td>
									<Td mono nowrap>
										{`v${row.version}`}
									</Td>
									<Td mono numeric>
										{formatCount(row.count)}
									</Td>
								</Tr>
							))}
						</TBody>
					</Table>
				</Island>
			)}
		</div>
	);
}
