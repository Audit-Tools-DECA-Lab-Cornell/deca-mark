import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { LoadFailure } from "@/components/shell/LoadFailure";
import { mapRows } from "@/features/qgis/model";
import { QgisScreen } from "@/features/qgis/QgisScreen";
import { projectHref } from "@/features/shell/navigation";
import { getProject, listSites, resolveProject, summarizeObservations } from "@/lib/api/workspace";
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
 * QGIS: every site's current map package and zone boundaries to download, and DECA Mark's export of the
 * project's observations for a site and round: every matching observation, with each record's answer
 * columns from the form version it was collected with.
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

	// The export covers every observation of the scope, so only how many match is read here.
	const filters = { ...(chosen ? { siteId: chosen.site_id } : {}), ...(round ? { roundType: round } : {}) };
	const counted = await settle(summarizeObservations(ref.id, filters));
	if (!counted.ok) return <LoadFailure failure={counted.failure} what="the observations" />;

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
			filters={filters}
			matching={counted.data.total_matching}
		/>
	);
}
