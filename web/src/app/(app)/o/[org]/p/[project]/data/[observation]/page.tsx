import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LoadFailure } from "@/components/shell/LoadFailure";
import { ObservationDetail, type ObservationPlan } from "@/features/observation/ObservationDetail";
import { getObservation, getProject, getSitePlan, resolveProject } from "@/lib/api/workspace";
import { shortLabel } from "@/lib/labels";
import { isNotFound, settle } from "@/lib/workspace/result";

type Params = { org: string; project: string; observation: string };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
	const { observation } = await params;
	return { title: ID.test(observation) ? shortLabel(observation) : "Observation" };
}

/**
 * One observation, as it was recorded: its site, zone label, map version and round, and its answers worded
 * by the form definition it was collected with, never the newest. The plan is the map version it was
 * recorded on, never today's. An address that is not an observation of this project is the in-shell
 * not-found page.
 */
export default async function ObservationPage({ params }: { params: Promise<Params> }) {
	const { org, project: code, observation: id } = await params;
	if (!ID.test(id)) notFound();
	const project = await resolveProject(org, code);
	if (!project) notFound();

	const found = await settle(getObservation(project.id, id));
	if (!found.ok) {
		if (isNotFound(found.failure)) notFound();
		return <LoadFailure failure={found.failure} what="this observation" />;
	}
	const row = found.data;

	const [details, drawn] = await Promise.all([
		settle(getProject(project.id)),
		// Every member can read a superseded package, so the record's own map version always loads.
		settle(getSitePlan(project.id, row.package_id, row.site_name))
	]);
	if (!details.ok) return <LoadFailure failure={details.failure} what="the project" />;

	const plan: ObservationPlan | null =
		drawn.ok && drawn.data ? { site: drawn.data, version: row.package_version } : null;
	const planNote = plan
		? null
		: `Map v${row.package_version} of ${row.site_name}, which this record was collected on, did not load.`;

	return (
		<ObservationDetail
			org={org}
			project={code}
			observation={row}
			timeZone={details.data.timezone}
			definition={row.definition}
			plan={plan}
			planNote={planNote}
		/>
	);
}
