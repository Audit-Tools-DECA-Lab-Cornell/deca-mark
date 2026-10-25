import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LoadFailure } from "@/components/shell/LoadFailure";
import { backToDataHref, paramsReader } from "@/features/data/view";
import { ObservationDetail, type ObservationPlan } from "@/features/observation/ObservationDetail";
import { projectHref } from "@/features/shell/navigation";
import { getObservation, getProject, getSitePlan, listSites, resolveProject } from "@/lib/api/workspace";
import { shortLabel } from "@/lib/labels";
import { isNotFound, settle } from "@/lib/workspace/result";

type Params = { org: string; project: string; observation: string };
type SearchParams = Record<string, string | string[] | undefined>;

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
	const { observation } = await params;
	return { title: ID.test(observation) ? shortLabel(observation) : "Observation" };
}

/**
 * One observation, as it was recorded: its site, zone label, map version and round, and its answers worded
 * by the form definition it was collected with, never the newest. The plan is the map version it was
 * recorded on, never today's. An address that is not an observation of this project is the in-shell
 * not-found page. It is opened from Data with the view in its address, so its breadcrumb returns to that view.
 */
export default async function ObservationPage({
	params,
	searchParams
}: {
	params: Promise<Params>;
	searchParams: Promise<SearchParams>;
}) {
	const { org, project: code, observation: id } = await params;
	// Data opens a record with its own filters in the address; the "Data" breadcrumb returns to them.
	const backHref = backToDataHref(projectHref(org, code, "data"), paramsReader(await searchParams));
	if (!ID.test(id)) notFound();
	const project = await resolveProject(org, code);
	if (!project) notFound();

	const found = await settle(getObservation(project.id, id));
	if (!found.ok) {
		if (isNotFound(found.failure)) notFound();
		return <LoadFailure failure={found.failure} what="this observation" />;
	}
	const row = found.data;

	const [details, drawn, sites] = await Promise.all([
		settle(getProject(project.id)),
		// Every member can read a superseded package, so the record's own map version always loads.
		settle(getSitePlan(project.id, row.package_id, row.site_name)),
		// Only for saying which version is current; the record reads the same without it.
		settle(listSites(project.id))
	]);
	if (!details.ok) return <LoadFailure failure={details.failure} what="the project" />;

	const plan: ObservationPlan | null =
		drawn.ok && drawn.data ? { site: drawn.data, version: row.package_version } : null;
	const current = sites.ok ? sites.data.find(site => site.site_id === row.site_id) : undefined;

	return (
		<ObservationDetail
			org={org}
			project={code}
			observation={row}
			timeZone={details.data.timezone}
			definition={row.definition}
			plan={plan}
			planProblem={plan ? null : drawn.ok ? "unreadable" : "failed"}
			currentVersion={current?.package?.package_version ?? null}
			backHref={backHref}
		/>
	);
}
