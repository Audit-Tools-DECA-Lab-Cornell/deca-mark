import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/contour/PageHeader";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { historyRows } from "@/features/packages/history";
import { draftRows, othersNote, ownDraft, versionRows, zoneEntry, zoneTableRows } from "@/features/zones/model";
import { ZonesScreen } from "@/features/zones/ZonesScreen";
import { errorCopy } from "@/lib/api/errors";
import {
	getHistoricalZones,
	getProject,
	getSite,
	getSitePlan,
	getWorkspace,
	listPackages,
	listZoneDrafts,
	resolveProject
} from "@/lib/api/workspace";
import { clock } from "@/lib/time";
import { projectAbilities } from "@/lib/workspace/access";
import { isNotFound, settle } from "@/lib/workspace/result";
import type { Failure } from "@/lib/workspace/types";
import { historicalDraftZones } from "@/lib/zones/schemas";

type Params = { org: string; project: string; site: string };
type Query = { version?: string | string[] };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
	const { org, project, site } = await params;
	try {
		const ref = await resolveProject(org, project);
		return { title: ref ? `Zones · ${(await getSite(ref.id, site)).name}` : "Zones" };
	} catch {
		return { title: "Zones" };
	}
}

function Failed({ failure, what }: { failure: Failure; what: string }) {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader title="Zones" />
			<LoadFailure failure={failure} what={what} />
		</div>
	);
}

/** "3" from `?version=3`, or null. */
function versionParam(value: string | string[] | undefined): number | null {
	const raw = Array.isArray(value) ? value[0] : value;
	if (!raw || !/^[1-9]\d{0,5}$/.test(raw)) return null;
	return Number(raw);
}

/**
 * A site's zones (UI plan 5.1, WUI-13): managers and viewers see the current version and every earlier one;
 * managers also see the open drafts and start one. Observers never reach this page (the project layout
 * sends them to collect); anyone else without access is told so before anything is read.
 */
export default async function ZonesPage({
	params,
	searchParams
}: {
	params: Promise<Params>;
	searchParams: Promise<Query>;
}) {
	const [{ org, project: code, site: siteCode }, query] = await Promise.all([params, searchParams]);
	const ref = await resolveProject(org, code);
	if (!ref) notFound();
	const abilities = projectAbilities(ref.role);
	if (!abilities.read)
		return (
			<div className="flex flex-col gap-6">
				<PageHeader title="Zones" />
				<LoadFailure
					failure={{ code: "role_required", kind: "rejected", message: errorCopy.role_required }}
					what="this page"
					noAccess="Only project managers and viewers can see a site's zones."
				/>
			</div>
		);

	const [site, project, workspace] = await Promise.all([
		settle(getSite(ref.id, siteCode)),
		settle(getProject(ref.id)),
		getWorkspace()
	]);
	if (!site.ok) {
		if (isNotFound(site.failure) || site.failure.code === "validation_failed") notFound();
		return <Failed failure={site.failure} what="this site" />;
	}
	if (!project.ok) return <Failed failure={project.failure} what="the project" />;
	const projectClock = clock(project.data.timezone);
	const entry = zoneEntry(site.data);
	const userId = workspace.account.userId;

	const [history, drafts] = await Promise.all([
		entry === "no-package" ? null : settle(listPackages(ref.id, site.data.site_id)),
		// Drafts are managers' only: nothing about them is read for anyone else.
		abilities.manage && entry !== "no-package" ? settle(listZoneDrafts(ref.id, site.data.site_id, "draft")) : null
	]);
	const versions = history?.ok ? versionRows(historyRows(history.data, projectClock)) : [];
	const asked = versionParam(query.version);
	const named = asked === null ? undefined : versions.find(row => row.version === asked);
	const shown = named ?? versions.find(row => row.current) ?? null;

	const [plan, zones] = shown
		? await Promise.all([
				settle(getSitePlan(ref.id, shown.packageId, site.data.name)),
				settle(getHistoricalZones(ref.id, site.data.site_id, shown.packageId))
			])
		: [null, null];

	const context = { userId, currentPackageId: site.data.current_package_id, clock: projectClock };
	const rows = drafts?.ok ? draftRows(drafts.data, context) : [];

	return (
		<ZonesScreen
			org={org}
			project={code}
			projectId={ref.id}
			userId={userId}
			site={{ siteId: site.data.site_id, code: site.data.code, name: site.data.name }}
			entry={entry}
			canManage={abilities.manage}
			shown={shown}
			plan={plan?.ok ? plan.data : null}
			planFailure={plan && !plan.ok ? plan.failure : null}
			zones={zones?.ok ? zoneTableRows(historicalDraftZones(zones.data)) : []}
			zonesFailure={zones && !zones.ok ? zones.failure : null}
			versions={versions}
			versionsFailure={history && !history.ok ? history.failure : null}
			drafts={drafts === null ? null : rows}
			draftsFailure={drafts && !drafts.ok ? drafts.failure : null}
			ownDraft={ownDraft(rows)}
			othersNote={drafts?.ok ? othersNote(drafts.data, context) : null}
			missingVersion={history?.ok && asked !== null && !named ? asked : null}
		/>
	);
}
