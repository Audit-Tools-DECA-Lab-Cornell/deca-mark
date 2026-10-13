import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LoadFailure } from "@/components/shell/LoadFailure";
import { mapRows } from "@/features/qgis/model";
import { QgisScreen } from "@/features/qgis/QgisScreen";
import { projectHref } from "@/features/shell/navigation";
import { getFormDefinitions, getProject, listObservations, listSites, resolveProject } from "@/lib/api/workspace";
import { isRoundType } from "@/lib/labels";
import { projectAbilities } from "@/lib/workspace/access";
import { collectPath } from "@/lib/workspace/home";
import { settle } from "@/lib/workspace/result";

export const metadata: Metadata = { title: "QGIS" };

/** A search parameter's value, when it may be repeated. */
function firstOf(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/**
 * QGIS: every site's current map package to download, and the project's observations as CSV, GeoJSON and a
 * codebook. Site and round are filters on the list the API returns, applied before its 500-record limit.
 * Each record's answer columns come from the form version it was collected with.
 */
export default async function QgisPage({
	params,
	searchParams
}: {
	params: Promise<{ org: string; project: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const [{ org, project: code }, query] = await Promise.all([params, searchParams]);
	const resolved = await settle(resolveProject(org, code));
	if (!resolved.ok) return <LoadFailure failure={resolved.failure} what="the QGIS page" />;
	const ref = resolved.data;
	if (!ref) notFound();
	const abilities = projectAbilities(ref.role);
	if (abilities.collectOnly) redirect(collectPath(org));

	const [projectRead, sitesRead] = await Promise.all([settle(getProject(ref.id)), settle(listSites(ref.id))]);
	if (!projectRead.ok) return <LoadFailure failure={projectRead.failure} what="the QGIS page" />;
	if (!sitesRead.ok) return <LoadFailure failure={sitesRead.failure} what="the sites" />;

	// A site or round in the address that does not exist is ignored, so an old link still opens the page.
	const chosen = sitesRead.data.find(entry => entry.code === firstOf(query.site));
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
	const { definitions, missing } = await getFormDefinitions(ref.id, [...new Set(rows.map(row => row.form_version))]);

	return (
		<QgisScreen
			projectId={ref.id}
			projectCode={ref.code}
			timeZone={projectRead.data.timezone}
			loadedAt={new Date().toISOString()}
			base={projectHref(org, code)}
			canUpload={abilities.manage}
			maps={mapRows(sitesRead.data)}
			site={site}
			round={round}
			rows={rows}
			definitions={definitions}
			unreadableForms={missing.length}
			limited={limited}
		/>
	);
}
