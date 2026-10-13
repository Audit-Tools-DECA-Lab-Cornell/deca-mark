import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LoadFailure } from "@/components/shell/LoadFailure";
import type { DataPlan } from "@/features/data/DataMap";
import { DataScreen, type DataSite } from "@/features/data/DataScreen";
import { defaultMapVersion, loadedGroups, mapVersionChoices } from "@/features/data/map";
import {
	daysBackwards,
	paramsReader,
	parseView,
	planSiteCode,
	viewFilters,
	viewQuery,
	zoneOptions,
	zoneVersions
} from "@/features/data/view";
import type { ObservationPage } from "@/lib/api/types";
import {
	getFormDefinitions,
	getProject,
	getSitePlan,
	listObservations,
	listPackages,
	listSites,
	resolveProject,
	summarizeObservations
} from "@/lib/api/workspace";
import { clock } from "@/lib/time";
import { settle } from "@/lib/workspace/result";

export const metadata: Metadata = { title: "Observation data" };

type Props = {
	params: Promise<{ org: string; project: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Observation data. DECA Mark applies the address's filters to every observation and sends the newest 500
 * that match, with how many match in all; the next 500 load on request. Each record keeps the zone label
 * and map version it was collected with. When one site is in view, its plan draws one map version: the one
 * the filters name, else the current one when a match was recorded on it, else the newest one a match was
 * recorded on (UI plan 7.3).
 */
export default async function DataPage({ params, searchParams }: Props) {
	const { org, project: code } = await params;
	const requested = parseView(paramsReader(await searchParams));
	const project = await resolveProject(org, code);
	if (!project) notFound();

	const [details, siteList] = await Promise.all([settle(getProject(project.id)), settle(listSites(project.id))]);
	if (!details.ok) return <LoadFailure failure={details.failure} what="the project" />;
	if (!siteList.ok) return <LoadFailure failure={siteList.failure} what="the sites" />;
	const projectClock = clock(details.data.timezone);

	// A site the project does not have is left out, rather than loading nothing under a name that is not there.
	const site = siteList.data.find(entry => entry.code === requested.site) ?? null;
	const view = site ? requested : { ...requested, site: null, zones: [], version: null };

	// "One map version" names a version of the site; its package is read from the site's history.
	let packageId: string | null = null;
	let versionNote: string | null = null;
	if (site && view.version !== null) {
		const history = await settle(listPackages(project.id, site.site_id));
		if (!history.ok) return <LoadFailure failure={history.failure} what="the site's map versions" />;
		packageId = history.data.packages.find(item => item.package_version === view.version)?.package_id ?? null;
		if (!packageId) versionNote = `${site.name} has no map v${view.version}, so every version is shown.`;
	}
	let filters = viewFilters(view, { siteId: site?.site_id ?? null, packageId }, projectClock);

	// A first day after the last matches nothing: there is nothing to ask for.
	const empty: ObservationPage = {
		items: [],
		next_cursor: null,
		total_matching: 0,
		generated_at: new Date().toISOString()
	};
	const sites: DataSite[] = siteList.data.map(entry => ({
		code: entry.code,
		name: entry.name,
		observationCount: entry.observation_count,
		hasPackage: entry.package !== null
	}));
	const planSite = daysBackwards(view)
		? undefined
		: siteList.data.find(entry => entry.code === planSiteCode(sites, view.site));

	const [first, zoneCounts, membership, firstScope] = await Promise.all([
		daysBackwards(view)
			? Promise.resolve({ ok: true as const, data: empty })
			: settle(listObservations(project.id, filters)),
		// The zone filter offers every zone this site's records were collected in, on any version.
		site && !daysBackwards(view)
			? settle(summarizeObservations(project.id, { ...filters, zoneIds: [], packageId: undefined }))
			: null,
		// Which map versions have the chosen zones is read for the whole site, whatever else is filtered.
		site && view.zones.length > 0 ? settle(summarizeObservations(project.id, { siteId: site.site_id })) : null,
		// The plan's map versions, and the inventories under it, are counted over every match.
		planSite ? settle(summarizeObservations(project.id, filters)) : null
	]);
	// A map version that does not have a chosen zone is refused; every version is shown instead, and says so.
	let list = first;
	let scope = firstScope;
	if (!list.ok && packageId && list.failure.kind === "rejected") {
		versionNote = `Map v${view.version} does not have ${view.zones.length === 1 ? "this zone" : "every chosen zone"}, so every version is shown.`;
		packageId = null;
		filters = viewFilters(view, { siteId: site?.site_id ?? null, packageId }, projectClock);
		[list, scope] = await Promise.all([
			settle(listObservations(project.id, filters)),
			planSite ? settle(summarizeObservations(project.id, filters)) : null
		]);
	}
	if (!list.ok) return <LoadFailure failure={list.failure} what="the observations" />;
	const effective = packageId ? view : { ...view, version: null };

	// Each record is read with the form version it was collected with, never the newest one.
	const formVersions = [...new Set(list.data.items.map(item => item.form_version))];
	const { definitions, missing } = await getFormDefinitions(project.id, formVersions);

	const zones = site
		? zoneOptions(
				zoneCounts?.ok ? zoneCounts.data.groups : [],
				site.zones.map(zone => ({ id: zone.zone_id, label: zone.label })),
				site.package?.package_version ?? null
			)
		: [];

	let plan: DataPlan | null = null;
	let planNote: string | null = null;
	if (planSite && list.data.items.length > 0) {
		// Without DECA Mark's counts, the versions are those of the loaded observations.
		const groups = scope?.ok ? scope.data.groups.filter(group => group.site_id === planSite.site_id) : null;
		const choices = mapVersionChoices(
			groups ?? loadedGroups(list.data.items),
			planSite.site_id,
			planSite.current_package_id
		);
		const chosen =
			defaultMapVersion(choices, packageId) ??
			(planSite.package
				? { packageId: planSite.package.package_id, version: planSite.package.package_version }
				: null);
		if (!chosen) {
			planNote = `${planSite.name} has no map package yet, so its observations are not drawn on a plan.`;
		} else {
			const drawn = await settle(getSitePlan(project.id, chosen.packageId, planSite.name));
			if (drawn.ok && drawn.data)
				plan = {
					site: drawn.data,
					siteId: planSite.site_id,
					siteCode: planSite.code,
					siteName: planSite.name,
					packageId: chosen.packageId,
					version: chosen.version,
					currentPackageId: planSite.current_package_id,
					currentVersion: planSite.package?.package_version ?? null,
					groups
				};
			else
				planNote = `Map v${chosen.version} of ${planSite.name} did not load. The table still lists every loaded observation.`;
		}
	}

	// "One map version" offers the versions that have every chosen zone: those the zones' records were
	// collected on, and the current one when it still has them all.
	// The version applied stays offered, so the picker always shows what the list is filtered by.
	const versions = site
		? [
				...new Set([
					...zoneVersions(membership?.ok ? membership.data.groups : [], view.zones, {
						version: site.package?.package_version ?? null,
						zoneIds: site.zones.map(zone => zone.zone_id)
					}),
					...(effective.version !== null ? [effective.version] : [])
				])
			].sort((a, b) => a - b)
		: [];

	return (
		<DataScreen
			// A new view, or a refresh, starts again from the first page.
			key={`${viewQuery({ ...effective, q: "" })}|${list.data.generated_at}`}
			org={org}
			project={code}
			projectId={project.id}
			timeZone={details.data.timezone}
			view={effective}
			filters={filters}
			page={list.data}
			sites={sites}
			zones={zones}
			versions={versions}
			zonesFailure={
				zoneCounts && !zoneCounts.ok
					? zoneCounts.failure
					: membership && !membership.ok
						? membership.failure
						: null
			}
			versionNote={versionNote}
			definitions={definitions}
			missingVersions={missing}
			plan={plan}
			planNote={planNote}
		/>
	);
}
