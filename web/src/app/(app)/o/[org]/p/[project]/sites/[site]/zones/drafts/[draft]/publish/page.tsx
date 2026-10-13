import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/contour/PageHeader";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { PublishReview } from "@/features/zones/publish/PublishReview";
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

export const metadata: Metadata = { title: "Publish zones" };

function Failed({ failure, what }: { failure: Failure; what: string }) {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader title="Publish zones" />
			<LoadFailure failure={failure} what={what} />
		</div>
	);
}

/**
 * Review and publish a zone draft, for managers (UI plan 5.10, WUI-6). Anyone else is told so before a
 * draft is asked for. The draft is checked again from the browser for its exact revision before it can be
 * published.
 */
export default async function PublishZonesPage({ params }: { params: Promise<Params> }) {
	const { org, project: code, site: siteCode, draft: draftId } = await params;
	if (!ID.test(draftId)) notFound();
	const ref = await resolveProject(org, code);
	if (!ref) notFound();

	if (!projectAbilities(ref.role).manage)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader title="Publish zones" />
				<LoadFailure
					failure={{ code: "role_required", kind: "rejected", message: errorCopy.role_required }}
					what="this page"
					noAccess="Only project managers can publish zones."
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
			<Failed
				failure={{ code: "unknown", kind: "retry", message: `Map v${baseVersion} cannot be drawn as a plan.` }}
				what={`map v${baseVersion}`}
			/>
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
		<PublishReview
			key={`${userId}:${ref.id}:${draftId}`}
			org={org}
			project={code}
			address={{ projectId: ref.id, siteId: site.data.site_id, draftId, userId }}
			siteCode={site.data.code}
			siteName={site.data.name}
			timeZone={project.data.timezone}
			draft={savedDraft(draft.data)}
			baseVersion={baseVersion}
			currentPackageId={site.data.current_package_id}
			currentVersion={site.data.package?.package_version ?? null}
			basePackageId={basePackageId}
			forms={draft.data.forms}
			site={base.data.site}
			baseZones={historicalDraftZones(baseZones.data)}
		/>
	);
}
