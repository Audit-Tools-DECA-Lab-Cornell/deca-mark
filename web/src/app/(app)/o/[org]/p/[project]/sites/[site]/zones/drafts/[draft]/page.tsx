import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/contour/Button";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { NotAvailable } from "@/components/shell/NotAvailable";
import { projectHref } from "@/features/shell/navigation";
import { DraftEditor } from "@/features/zones/DraftEditor";
import { errorCopy } from "@/lib/api/errors";
import {
	getEditorBase,
	getHistoricalZones,
	getProject,
	getSite,
	getWorkspace,
	getZoneDraft,
	resolveProject
} from "@/lib/api/workspace";
import { projectAbilities } from "@/lib/workspace/access";
import { isNotFound, settle } from "@/lib/workspace/result";
import type { Failure } from "@/lib/workspace/types";
import { historicalDraftZones, savedDraft } from "@/lib/zones/schemas";

type Params = { org: string; project: string; site: string; draft: string };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const metadata: Metadata = { title: "Edit zones" };

function Failed({ failure, what }: { failure: Failure; what: string }) {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader title="Edit zones" />
			<LoadFailure failure={failure} what={what} />
		</div>
	);
}

/**
 * A zone draft, for managers (UI plan WUI-13, 5.3): the editor over the draft's base version. Anyone else
 * is told so before a draft is asked for. The draft is read here for the first render and again from the
 * browser before any edit is accepted; every save after that goes from the browser to DECA Mark.
 */
export default async function ZoneDraftPage({ params }: { params: Promise<Params> }) {
	const { org, project: code, site: siteCode, draft: draftId } = await params;
	if (!ID.test(draftId)) notFound();
	const ref = await resolveProject(org, code);
	if (!ref) notFound();

	if (!projectAbilities(ref.role).manage)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader title="Edit zones" />
				<LoadFailure
					failure={{ code: "role_required", kind: "rejected", message: errorCopy.role_required }}
					what="this page"
					noAccess="Only project managers can edit zones."
				/>
			</div>
		);

	const [site, project, workspace] = await Promise.all([
		settle(getSite(ref.id, siteCode)),
		settle(getProject(ref.id)),
		getWorkspace()
	]);
	if (!site.ok) {
		if (isNotFound(site.failure)) notFound();
		return <Failed failure={site.failure} what="the site" />;
	}
	if (!project.ok) return <Failed failure={project.failure} what="the project" />;
	const siteHref = projectHref(org, code, `sites/${site.data.code}`);

	if (!site.data.zone_editing_available)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader
					breadcrumbs={[
						{ label: "Sites", href: projectHref(org, code, "sites") },
						{ label: site.data.name, href: siteHref },
						{ label: "Zone draft" }
					]}
					title={`Edit zones · ${site.data.name}`}
				/>
				<NotAvailable
					title="Editing zones on the web"
					reason="This site needs a map package with a site boundary and a published form first."
					instead="Edit the zones layer in QGIS and upload a new package."
				/>
			</div>
		);

	const draft = await settle(getZoneDraft(ref.id, site.data.site_id, draftId));
	if (!draft.ok) {
		if (isNotFound(draft.failure)) notFound();
		return <Failed failure={draft.failure} what="this draft" />;
	}
	const { base_package_id: basePackageId, base_package_version: baseVersion } = draft.data;
	const [base, baseZones] = await Promise.all([
		settle(getEditorBase(ref.id, basePackageId, site.data.name)),
		settle(getHistoricalZones(ref.id, site.data.site_id, basePackageId))
	]);
	if (!base.ok) return <Failed failure={base.failure} what={`map v${baseVersion}`} />;
	if (!baseZones.ok) return <Failed failure={baseZones.failure} what={`the zones of map v${baseVersion}`} />;
	if (!base.data)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader title={`Edit zones · ${site.data.name}`} />
				<ScreenState
					kind="error"
					title={`Map v${baseVersion} cannot be drawn as a plan.`}
					body="Its map package could not be read, so its zones cannot be edited here. Edit the zones layer in QGIS and upload a new package."
					actions={
						<ButtonLink variant="outline" href={siteHref}>
							Open the site
						</ButtonLink>
					}
				/>
			</div>
		);

	const userId = workspace.account.userId;
	if (!userId)
		return (
			<Failed
				failure={{ code: "token_invalid", kind: "sign-in", message: errorCopy.token_invalid }}
				what="this draft"
			/>
		);

	return (
		<DraftEditor
			// One editor per account, project and draft (WUI-12): nothing carries over to another.
			key={`${userId}:${ref.id}:${draftId}`}
			org={org}
			project={code}
			address={{ projectId: ref.id, siteId: site.data.site_id, draftId, userId }}
			siteCode={site.data.code}
			siteName={site.data.name}
			timeZone={project.data.timezone}
			draft={savedDraft(draft.data)}
			baseVersion={baseVersion}
			currentVersion={site.data.package?.package_version ?? null}
			site={base.data.site}
			siteBoundary={base.data.boundary}
			baseZones={historicalDraftZones(baseZones.data)}
		/>
	);
}
