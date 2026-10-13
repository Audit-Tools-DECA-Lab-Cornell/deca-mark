import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/contour/PageHeader";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { SiteScreen } from "@/features/sites/SiteScreen";
import { siteView, zoneRows } from "@/features/sites/view";
import { getProject, getSite, getSitePlan, resolveProject, summarizeObservations } from "@/lib/api/workspace";
import { clock } from "@/lib/time";
import { projectAbilities } from "@/lib/workspace/access";
import { isNotFound, settle } from "@/lib/workspace/result";
import type { Failure } from "@/lib/workspace/types";

type Params = { org: string; project: string; site: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
	const { org, project, site } = await params;
	try {
		const ref = await resolveProject(org, project);
		return { title: ref ? (await getSite(ref.id, site)).name : "Site" };
	} catch {
		// The page itself says why the site could not be read.
		return { title: "Site" };
	}
}

function SiteFailure({ failure }: { failure: Failure }) {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader title="Site" />
			<LoadFailure failure={failure} what="this site" />
		</div>
	);
}

/**
 * A site: its plan from the current map package, its zones with exact observation counts from the server
 * (every map version), the current package and its details. A site that does not exist in this project is the in-shell not-found page.
 */
export default async function SitePage({ params }: { params: Promise<Params> }) {
	const { org, project: code, site: siteCode } = await params;
	const ref = await resolveProject(org, code);
	if (!ref) notFound();

	const [site, project] = await Promise.all([settle(getSite(ref.id, siteCode)), settle(getProject(ref.id))]);
	if (!site.ok) {
		// An address that names no site, or a code no site could have, is not a site.
		if (isNotFound(site.failure) || site.failure.code === "validation_failed") notFound();
		return <SiteFailure failure={site.failure} />;
	}
	if (!project.ok) return <SiteFailure failure={project.failure} />;

	const view = siteView(site.data, clock(project.data.timezone));
	const [plan, counts] = await Promise.all([
		view.package ? settle(getSitePlan(ref.id, view.package.packageId, view.name)) : null,
		// A site with no observations has nothing to count.
		view.observationCount > 0 ? settle(summarizeObservations(ref.id, { siteId: view.siteId })) : null
	]);

	const groups = counts === null ? [] : counts.ok ? counts.data.groups : null;

	return (
		<SiteScreen
			org={org}
			project={code}
			projectId={ref.id}
			canManage={projectAbilities(ref.role).manage}
			site={view}
			plan={plan?.ok ? plan.data : null}
			planFailure={plan && !plan.ok ? plan.failure : null}
			zoneRows={zoneRows(view.zones, groups, view.package?.version ?? null)}
			countsFailure={counts && !counts.ok ? counts.failure : null}
		/>
	);
}
