"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { Button, ButtonLink } from "@/components/contour/Button";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { useToast } from "@/components/contour/Toast";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { projectHref } from "@/features/shell/navigation";
import { appendPage } from "@/lib/api/observations";
import type { Observation, ObservationFilters, ObservationPage, RawDefinition } from "@/lib/api/types";
import { scopeLines } from "@/lib/export/files";
import { formatCount } from "@/lib/labels";
import { clock as makeClock } from "@/lib/time";
import type { Failure } from "@/lib/workspace/types";

import { loadObservationsAction } from "./actions";
import { DataMap, type DataPlan } from "./DataMap";
import { DataTable } from "./DataTable";
import { ExportObservations } from "./ExportObservations";
import { FilterBar } from "./FilterBar";
import {
	countLine,
	type DataRecord,
	type DataView,
	daysBackwards,
	hasFilters,
	type Option,
	prepareRecords,
	searchLoaded,
	viewQuery
} from "./view";

export type DataSite = {
	readonly code: string;
	readonly name: string;
	/** The exact number of observations at the site. */
	readonly observationCount: number;
	/** Whether the site has a ready map package. */
	readonly hasPackage: boolean;
};

export type DataScreenProps = {
	org: string;
	project: string;
	/** The project's identity, for the export DECA Mark makes. */
	projectId: string;
	timeZone: string;
	/** The view in the address, as the server applied it. */
	view: DataView;
	/** The filters the first page was read with; the next pages use the same ones. */
	filters: ObservationFilters;
	page: ObservationPage;
	sites: DataSite[];
	/** The zones the chosen site's filter offers; empty without a site. */
	zones: Option[];
	/** The site's map versions, for "One map version"; empty without a site. */
	versions: number[];
	/** Why the zone or map version choices could not be read in full, when they could not. */
	zonesFailure: Failure | null;
	/** Why the map version in the address was not applied, when it was not. */
	versionNote: string | null;
	/** Each form version in the page, as it was published. */
	definitions: Record<string, RawDefinition>;
	missingVersions: string[];
	plan: DataPlan | null;
	/** Why there is no plan, when a plan was expected. */
	planNote: string | null;
};

/** How long typing in the search waits before the address follows it. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Observation data: what observers uploaded, in one table that the map, the count and the export all
 * follow. DECA Mark applies every filter but the search to every observation, and says how many match;
 * the newest 500 load first and the next 500 on request. The search finds words in the loaded ones and
 * says so. The address holds the view, and each filter change is a step Back undoes.
 */
export function DataScreen({
	org,
	project,
	projectId,
	timeZone,
	view,
	filters,
	page,
	sites,
	zones,
	versions,
	zonesFailure,
	versionNote,
	definitions: firstDefinitions,
	missingVersions: firstMissing,
	plan,
	planNote
}: DataScreenProps) {
	const router = useRouter();
	const { toast } = useToast();
	const [pending, startTransition] = useTransition();
	const [items, setItems] = useState<Observation[]>(page.items);
	const [cursor, setCursor] = useState(page.next_cursor);
	const [total, setTotal] = useState(page.total_matching);
	const [generatedAt, setGeneratedAt] = useState(page.generated_at);
	const [definitions, setDefinitions] = useState(firstDefinitions);
	const [missingVersions, setMissingVersions] = useState(firstMissing);
	const [loadingMore, setLoadingMore] = useState(false);
	const [moreProblem, setMoreProblem] = useState<string | null>(null);
	const [q, setQ] = useState(view.q);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [exportOpen, setExportOpen] = useState(false);
	const firstFilterRef = useRef<HTMLSelectElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	const clock = useMemo(() => makeClock(timeZone), [timeZone]);
	const records = useMemo(() => prepareRecords(items, definitions, clock), [items, definitions, clock]);
	const shown = useMemo(() => searchLoaded(records, q), [records, q]);
	const selected = shown.find(record => record.id === selectedId) ?? null;

	const base = projectHref(org, project, "data");
	const hrefOf = (record: DataRecord) => `${base}/${record.id}`;
	const current = { ...view, q };
	const canClear = hasFilters(current);
	const noneYet = total === 0 && !hasFilters(view) && items.length === 0;

	/* ── The address ───────────────────────────────────────────────────── */

	/** A filter DECA Mark applies: the page is asked for again, and Back returns to this view. */
	function changeView(patch: Partial<DataView>) {
		const next = { ...view, q, ...patch };
		// Zones belong to one site; a version belongs to the zones.
		const tidy: DataView = {
			...next,
			zones: next.site === view.site ? next.zones : [],
			version: next.site === view.site && next.zones.length > 0 ? next.version : null
		};
		cancelSearchWrite();
		startTransition(() => router.push(`${base}${viewQuery(tidy)}`, { scroll: false }));
	}

	// The search narrows what loaded without asking again; the address follows it, without a Back step each.
	// Nothing is written while the address already says it, and a filter change cancels a pending write, so
	// the search never replaces the address of a page that is still on its way.
	const searchWrite = useRef<number | null>(null);
	useEffect(() => {
		if ((new URLSearchParams(window.location.search).get("q") ?? "") === q.trim()) return;
		const timer = window.setTimeout(() => {
			const { pathname, hash } = window.location;
			window.history.replaceState(window.history.state, "", `${pathname}${viewQuery({ ...view, q })}${hash}`);
		}, SEARCH_DEBOUNCE_MS);
		searchWrite.current = timer;
		return () => window.clearTimeout(timer);
	}, [q, view]);

	function cancelSearchWrite() {
		if (searchWrite.current !== null) window.clearTimeout(searchWrite.current);
		searchWrite.current = null;
	}

	function clearAll() {
		cancelSearchWrite();
		setQ("");
		startTransition(() => router.push(base, { scroll: false }));
		firstFilterRef.current?.focus();
	}

	async function copyLink() {
		try {
			await navigator.clipboard.writeText(`${window.location.origin}${base}${viewQuery(current)}`);
			toast({ title: "Link to this view copied", tone: "saved" });
		} catch {
			toast({
				title: "Couldn't copy the link",
				description: "Copy it from the address bar instead.",
				tone: "attention"
			});
		}
	}

	/* ── More pages ────────────────────────────────────────────────────── */

	async function loadMore() {
		if (!cursor || loadingMore) return;
		setLoadingMore(true);
		setMoreProblem(null);
		try {
			const next = await loadObservationsAction({ org, project }, filters, cursor, Object.keys(definitions));
			if (next.status === "failed") {
				setMoreProblem(next.message);
				return;
			}
			// A record uploaded since the first page can shift a later one: each is kept once.
			setItems(loaded => appendPage(loaded, next.items));
			setCursor(next.nextCursor);
			setTotal(next.total);
			setGeneratedAt(next.generatedAt);
			setDefinitions(known => ({ ...known, ...next.definitions }));
			setMissingVersions(known => [...new Set([...known, ...next.missingVersions])]);
		} finally {
			setLoadingMore(false);
		}
	}

	/* ── Selection ─────────────────────────────────────────────────────── */

	function selectMarker(id: string) {
		setSelectedId(id);
		const nodes = listRef.current?.querySelectorAll<HTMLElement>(`[data-record-id="${id}"]`) ?? [];
		[...nodes].find(node => node.offsetParent !== null)?.scrollIntoView({ block: "nearest" });
	}

	/* ── What the list says about itself ───────────────────────────────── */

	const count = pending
		? "Loading observations…"
		: countLine({
				loaded: records.length,
				total,
				searched: q.trim() ? shown.length : null,
				countedAt: clock.time(generatedAt)
			});

	const emptyBody = !sites.length
		? "This project has no sites. Add a site and upload its map package, then observers can start collecting."
		: !sites.some(site => site.hasPackage)
			? "No site has a map package yet. Upload one, then observers can start collecting."
			: "Observers upload observations from the DECA Mark app. Observations still on their devices are not listed here.";

	const body = noneYet ? (
		<ScreenState
			kind="empty"
			icon="list"
			headingLevel={3}
			title="No observations yet"
			body={emptyBody}
			actions={
				!sites.length || !sites.some(site => site.hasPackage) ? (
					<ButtonLink variant="outline" href={projectHref(org, project, "sites")}>
						Open sites
					</ButtonLink>
				) : undefined
			}
		/>
	) : (
		<>
			<FilterBar
				view={current}
				sites={sites.map(site => ({ value: site.code, label: site.name }))}
				zones={zones}
				versions={versions}
				timeZone={clock.timeZone}
				onViewChange={changeView}
				onSearch={setQ}
				onClear={clearAll}
				canClear={canClear}
				firstFilterRef={firstFilterRef}
			/>
			{zonesFailure && (
				<div className="px-island-pad pb-5">
					<LoadFailure
						failure={zonesFailure}
						what="every zone and map version of this site's earlier maps"
						bare
					/>
				</div>
			)}
			{versionNote && (
				<div className="px-island-pad pb-5">
					<Note tone="neutral">{versionNote}</Note>
				</div>
			)}
			{shown.length === 0 ? (
				<ScreenState
					kind="filtered"
					icon="funnel"
					headingLevel={3}
					className="border-t border-rule"
					title={
						daysBackwards(view)
							? "The first day is after the last"
							: q.trim() && records.length > 0
								? "No loaded observations match the search"
								: "No observations match this view"
					}
					body={
						q.trim() && cursor
							? "The search finds words in the observations that have loaded. Show the next 500, or change the filters."
							: "Change the filters to see more. No observations were removed."
					}
					actions={
						<Button variant="ink" icon="x" onClick={clearAll}>
							Clear filters
						</Button>
					}
				/>
			) : (
				<div ref={listRef} className="border-t border-rule">
					<DataTable records={shown} hrefOf={hrefOf} selectedId={selectedId} onSelect={setSelectedId} />
				</div>
			)}
			<div className="flex flex-col gap-3 border-t border-rule px-island-pad py-4">
				{cursor && (
					<div className="flex flex-wrap items-center gap-3">
						<Button
							variant="outline"
							icon="chevron-down"
							disabled={loadingMore}
							disabledReason={loadingMore ? "The next observations are loading." : undefined}
							onClick={loadMore}>
							{loadingMore
								? "Loading…"
								: `Show the next ${formatCount(Math.min(500, total - records.length))}`}
						</Button>
						<p className="type-small text-ink-2">
							{formatCount(total - records.length)} more match the filters.
						</p>
					</div>
				)}
				{moreProblem && (
					<Note tone="attention" title="The next observations did not load.">
						{moreProblem}
					</Note>
				)}
				<div className="flex flex-wrap items-center gap-3">
					<Button variant="outline" size="sm" icon="refresh-cw" onClick={() => router.refresh()}>
						Refresh
					</Button>
					<p className="type-small text-ink-2">
						Refresh counts again and starts from the newest observations.
					</p>
				</div>
			</div>
		</>
	);

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Observation data"
				lead="Filter what observers have uploaded, then copy a link to the view or export it."
				actions={
					<>
						<Button variant="outline" icon="link" onClick={copyLink}>
							Copy link to this view
						</Button>
						<Button
							variant="primary"
							icon="download"
							disabled={total === 0}
							disabledReason={
								total === 0
									? noneYet
										? "There is nothing to export yet."
										: "No observations match these filters."
									: undefined
							}
							onClick={() => setExportOpen(true)}>
							Export
						</Button>
					</>
				}
			/>

			{missingVersions.length > 0 && (
				<Note tone="attention" title="Some questions could not be loaded.">
					Answers made with {missingVersions.join(", ")} are shown under their question ids.
				</Note>
			)}
			{planNote && <Note tone="neutral">{planNote}</Note>}

			<div
				className={plan ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] xl:items-start" : undefined}>
				<Island
					flush
					divided={false}
					title="Observations"
					meta={noneYet ? undefined : <span role="status">{count}</span>}
					aria-busy={pending || loadingMore}>
					{body}
				</Island>

				{plan && (
					<DataMap
						org={org}
						project={project}
						projectId={projectId}
						plan={plan}
						loaded={records}
						shown={shown}
						total={total}
						searched={q.trim() !== ""}
						filterZones={view.zones}
						selected={selected}
						onSelectObservation={selectMarker}
						hrefOf={hrefOf}
					/>
				)}
			</div>

			<ExportObservations
				open={exportOpen}
				onOpenChange={setExportOpen}
				projectId={projectId}
				filters={filters}
				matching={total}
				searched={q.trim() !== ""}
				scope={scopeLines(
					{
						site: sites.find(entry => entry.code === view.site)?.name ?? null,
						zones: view.zones.map(id => zones.find(option => option.value === id)?.label ?? id),
						version: view.version,
						round: view.round,
						observer: view.observer,
						from: view.from,
						to: view.to
					},
					clock
				)}
				fileStem={view.site ?? project}
				dayKey={clock.dayKey(new Date().toISOString())}
			/>
		</div>
	);
}
