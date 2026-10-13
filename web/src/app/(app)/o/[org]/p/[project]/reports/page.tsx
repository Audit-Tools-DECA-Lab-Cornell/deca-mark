import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LoadFailure } from "@/components/shell/LoadFailure";
import { parseDayKey, reportRows, type ZoneChoice } from "@/features/reports/model";
import { ReportsScreen } from "@/features/reports/ReportsScreen";
import { getFormDefinitions, getProject, listObservations, listSites, resolveProject } from "@/lib/api/workspace";
import { isRoundType } from "@/lib/labels";
import { projectAbilities } from "@/lib/workspace/access";
import { collectPath } from "@/lib/workspace/home";
import { settle } from "@/lib/workspace/result";

export const metadata: Metadata = { title: "Reports" };

/** A search parameter's value, when it may be repeated. */
function firstOf(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/**
 * Reports: counts of the project's observations, by zone, round, play type, observer and day. Site and
 * round are filters on the list the API returns (applied before its 500-record limit); days are applied in
 * the browser. Play types are read with each record's own form version.
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

	const listRead = await settle(
		listObservations(ref.id, {
			...(chosen ? { siteId: chosen.site_id } : {}),
			...(round ? { roundType: round } : {})
		})
	);
	if (!listRead.ok) return <LoadFailure failure={listRead.failure} what="the observations" />;
	const rows = listRead.data.items;
	const limited = listRead.data.total_matching > rows.length;

	// Every record is read with the form version it was collected with, never the newest one.
	const { definitions, missing } = await getFormDefinitions(ref.id, [...new Set(rows.map(row => row.form_version))]);
	const report = reportRows(rows, definitions);
	const zones: ZoneChoice[] = sites
		.filter(entry => !site || entry.code === site)
		.flatMap(entry =>
			entry.zones.map(zone => ({
				siteCode: entry.code,
				siteName: entry.name,
				id: zone.zone_id,
				label: zone.label
			}))
		);

	return (
		<ReportsScreen
			projectName={ref.name}
			timeZone={projectRead.data.timezone}
			loadedAt={new Date().toISOString()}
			sites={sites.map(entry => ({ code: entry.code, name: entry.name }))}
			site={site}
			round={round}
			from={parseDayKey(firstOf(query.from)) ?? ""}
			to={parseDayKey(firstOf(query.to)) ?? ""}
			rows={report.rows}
			zones={zones}
			playOptions={report.playOptions}
			limited={limited}
			unreadableForms={missing.length}
		/>
	);
}
