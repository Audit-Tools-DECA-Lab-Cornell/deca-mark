import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/contour/Button";
import { Island, IslandSection } from "@/components/contour/Island";
import { PageHeader } from "@/components/contour/PageHeader";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { formRows } from "@/features/forms/model";
import { ProjectFormsScreen } from "@/features/forms/ProjectFormsScreen";
import { listTemplates } from "@/features/forms/templates";
import { mapsAwaitingFormSchema } from "@/features/map-setup/schema";
import { projectHref } from "@/features/shell/navigation";
import { call } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { getProject, listForms, listSites, resolveProject } from "@/lib/api/workspace";
import { projectAbilities } from "@/lib/workspace/access";
import { settle } from "@/lib/workspace/result";

export const metadata: Metadata = { title: "Forms" };

/**
 * Forms: each form with its published version, its draft (managers only; the API sends drafts to nobody
 * else), its question count and the sites whose current map package uses it. A list that cannot load is a
 * load failure, never "No forms yet".
 */
export default async function FormsPage({ params }: { params: Promise<{ org: string; project: string }> }) {
	const { org, project: code } = await params;
	const ref = await resolveProject(org, code);
	if (!ref) notFound();

	const canManage = projectAbilities(ref.role).manage;
	const [forms, sites, project, awaiting] = await Promise.all([
		settle(listForms(ref.id)),
		settle(listSites(ref.id)),
		settle(getProject(ref.id)),
		canManage ? settle(mapsAwaitingForm(ref.id)) : null
	]);
	const failed = !forms.ok ? forms.failure : !project.ok ? project.failure : null;
	if (failed || !forms.ok || !project.ok)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader title="Forms" />
				<LoadFailure failure={failed ?? { code: "unknown", kind: "retry", message: "" }} what="the forms" />
			</div>
		);

	return (
		<ProjectFormsScreen
			org={org}
			project={code}
			forms={formRows(forms.data, sites.ok ? sites.data : [])}
			timeZone={project.data.timezone}
			canManage={canManage}
			templates={canManage ? listTemplates() : []}
			sitesProblem={sites.ok ? null : sites.failure.message}
			mapAssignments={
				awaiting?.ok && awaiting.data.length ? (
					<Island title="Maps awaiting a form" flush divided>
						{awaiting.data.map(map => (
							<IslandSection
								key={map.setup_id}
								rule
								className="flex flex-wrap items-center justify-between gap-3">
								<h3 className="type-body font-semibold">{map.site_name}</h3>
								<ButtonLink
									variant="ink"
									size="sm"
									href={projectHref(org, code, `forms/maps/${map.site_code}/${map.setup_id}`)}>
									Assign form<span className="sr-only"> to {map.site_name}</span>
								</ButtonLink>
							</IslandSection>
						))}
					</Island>
				) : awaiting && !awaiting.ok ? (
					<LoadFailure failure={awaiting.failure} what="maps awaiting a form" />
				) : null
			}
		/>
	);
}

async function mapsAwaitingForm(projectId: string) {
	const result = mapsAwaitingFormSchema.safeParse(
		await call<unknown>(api =>
			api.GET("/v1/projects/{project_id}/maps-awaiting-form", { params: { path: { project_id: projectId } } })
		)
	);
	if (!result.success) throw new ApiError("unknown", "retry");
	return result.data;
}
