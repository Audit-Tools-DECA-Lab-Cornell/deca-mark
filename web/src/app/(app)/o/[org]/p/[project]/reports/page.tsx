import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LoadFailure } from "@/components/shell/LoadFailure";
import { dayRangeIsBackwards, parseDayKey, reportRows, type ZoneChoice } from "@/features/reports/model";
import { ReportsScreen } from "@/features/reports/ReportsScreen";
import type { ObservationFilters, ObservationPage, ObservationSummary } from "@/lib/api/types";
import {
	getFormDefinitions,
	getProject,
	listObservations,
	listSites,
	resolveProject,
	summarizeObservations
} from "@/lib/api/workspace";
import { isRoundType } from "@/lib/labels";
import { addDays, clock } from "@/lib/time";
import { projectAbilities } from "@/lib/workspace/access";
import { collectPath } from "@/lib/workspace/home";
import { settle } from "@/lib/workspace/result";

export const metadata: Metadata = { title: "Reports" };

/** A search parameter's value, when it may be repeated. */
function firstOf(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/**
 * Reports: counts of the project's observations, by zone, round, play type, observer and day. Site, round
 * and days are applied by DECA Mark: zones and rounds come from its summary of every match, the rest from
 * the newest 500 of the same scope. Play types are read with each record's own form version.
 */
export default async function ReportsPage({
	params,
	searchParams
}: {
	params: Promise<{ org: string; project: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const [{ org, project: code }, query] = await Promise.all([params, searchParams]);
	const resolved = await settle(resolveProject(org, code));
	if (!resolved.ok) return <LoadFailure failure={resolved.failure} what="the reports" />;
	const ref = resolved.data;
	if (!ref) notFound();
	if (projectAbilities(ref.role).collectOnly) redirect(collectPath(org));

	const [projectRead, sitesRead] = await Promise.all([settle(getProject(ref.id)), settle(listSites(ref.id))]);
	if (!projectRead.ok) return <LoadFailure failure={projectRead.failure} what="the reports" />;
	if (!sitesRead.ok) return <LoadFailure failure={sitesRead.failure} what="the reports" />;

	// A site or round in the address that does not exist is ignored, so an old link still opens a report.
	const sites = sitesRead.data;
	const chosen = sites.find(entry => entry.code === firstOf(query.site));
	const site = chosen?.code ?? "";
	const requestedRound = firstOf(query.round);
	const round = isRoundType(requestedRound) ? requestedRound : "";

	// Days are the project's calendar days: "to" is included, so the filter stops where the next day starts.
	const from = parseDayKey(firstOf(query.from));
	const to = parseDayKey(firstOf(query.to));
	const backwards = dayRangeIsBackwards(from, to);
	const projectClock = clock(projectRead.data.timezone);
	const filters: ObservationFilters = {
		...(chosen ? { siteId: chosen.site_id } : {}),
		...(round ? { roundType: round } : {}),
		...(from ? { observedFrom: projectClock.dayStart(from) } : {}),
		...(to ? { observedBefore: projectClock.dayStart(addDays(to, 1)) } : {})
	};
	const now = new Date().toISOString();
	const none: [ObservationSummary, ObservationPage] = [
		{ groups: [], total_matching: 0, generated_at: now },
		{ items: [], next_cursor: null, total_matching: 0, generated_at: now }
	];
	const read = await settle(
		backwards
			? Promise.resolve(none)
			: Promise.all([summarizeObservations(ref.id, filters), listObservations(ref.id, filters)])
	);
	if (!read.ok) return <LoadFailure failure={read.failure} what="the observations" />;
	const [summary, page] = read.data;
	const rows = page.items;

	// Every record is read with the form version it was collected with, never the newest one.
	const { definitions, missing } = await getFormDefinitions(ref.id, [...new Set(rows.map(row => row.form_version))]);
	const report = reportRows(rows, definitions);
	const zones: ZoneChoice[] = sites
		.filter(entry => !site || entry.code === site)
		.flatMap(entry =>
			entry.zones.map(zone => ({
				siteId: entry.site_id,
				siteCode: entry.code,
				siteName: entry.name,
				id: zone.zone_id,
				label: zone.label
			}))
		);

	return (
		<ReportsScreen
			// A new scope starts the screen again, so the day fields show the days the counts are for.
			key={`${site}|${round}|${from ?? ""}|${to ?? ""}|${summary.generated_at}`}
			projectName={ref.name}
			timeZone={projectRead.data.timezone}
			loadedAt={new Date().toISOString()}
			sites={sites.map(entry => ({ siteId: entry.site_id, code: entry.code, name: entry.name }))}
			site={site}
			round={round}
			from={from ?? ""}
			to={to ?? ""}
			groups={summary.groups}
			total={summary.total_matching}
			rows={report.rows}
			zones={zones}
			playOptions={report.playOptions}
			unreadableForms={missing.length}
		/>
	);
}
