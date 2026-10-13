import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { ButtonLink } from "@/components/contour/Button";
import { Island } from "@/components/contour/Island";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { ActivityIsland } from "@/features/overview/ActivityIsland";
import { AttentionIsland } from "@/features/overview/AttentionIsland";
import { CoverageSection } from "@/features/overview/CoverageSection";
import { FieldReturnIsland } from "@/features/overview/FieldReturnIsland";
import { attentionItems } from "@/features/overview/model";
import { projectHref } from "@/features/shell/navigation";
import {
	getPackage,
	getProject,
	listForms,
	listObservations,
	listProjectPackages,
	listSites,
	resolveProject,
	summarizeObservations
} from "@/lib/api/workspace";
import { activity } from "@/lib/observations/summary";
import { addDays, clock } from "@/lib/time";
import { projectAbilities } from "@/lib/workspace/access";
import { collectPath } from "@/lib/workspace/home";
import { settle } from "@/lib/workspace/result";

export const metadata: Metadata = { title: "Overview" };

/** A search parameter's value, when it may be repeated. */
function firstOf(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}

/**
 * The project's Overview: what came back from the field, which zones have records in which rounds, what
 * needs attention and what happened recently. Everything is read from DECA Mark when the page loads, and a
 * part that cannot be read says so instead of showing zero. Viewers see the same page without links to
 * manager pages.
 */
export default async function OverviewPage({
	params,
	searchParams
}: {
	params: Promise<{ org: string; project: string }>;
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const [{ org, project: code }, query] = await Promise.all([params, searchParams]);
	const resolved = await settle(resolveProject(org, code));
	if (!resolved.ok) return <LoadFailure failure={resolved.failure} what="the overview" />;
	const ref = resolved.data;
	if (!ref) notFound();
	const abilities = projectAbilities(ref.role);
	if (abilities.collectOnly) redirect(collectPath(org));
	const base = projectHref(org, code);

	const [projectRead, sitesRead, packagesRead, formsRead, observationsRead] = await Promise.all([
		settle(getProject(ref.id)),
		settle(listSites(ref.id)),
		settle(listProjectPackages(ref.id)),
		settle(listForms(ref.id)),
		// The newest 500, for the counts read from records; the page's total says how many match in all.
		settle(listObservations(ref.id))
	]);
	// Days and times are the project's own; without its time zone none of them can be shown truthfully.
	if (!projectRead.ok) return <LoadFailure failure={projectRead.failure} what="the overview" />;
	const projectClock = clock(projectRead.data.timezone);
	const nowIso = new Date().toISOString();
	// Today and the last 7 days in the project's time zone, counted by the server for every record.
	const todayKey = projectClock.dayKey(nowIso);
	const recentRead = await settle(
		Promise.all([
			summarizeObservations(ref.id, { observedFrom: projectClock.dayStart(todayKey) }),
			summarizeObservations(ref.id, { observedFrom: projectClock.dayStart(addDays(todayKey, -6)) })
		]).then(([today, week]) => ({ today: today.total_matching, last7Days: week.total_matching }))
	);

	// Needs attention: the first blocked check of each site's newest package, when that package is blocked.
	const newestBlocked =
		sitesRead.ok && packagesRead.ok
			? sitesRead.data.flatMap(site => {
					const newest = packagesRead.data
						.filter(entry => entry.site_code === site.code)
						.sort((a, b) => b.package_version - a.package_version)[0];
					return newest?.state === "blocked" ? [newest] : [];
				})
			: [];
	const blockedChecks = await Promise.all(
		newestBlocked.map(async entry => {
			const detail = await settle(getPackage(ref.id, entry.package_id));
			const first = detail.ok ? detail.data.checks.find(check => check.state === "blocked") : undefined;
			return [entry.package_id, first?.detail ?? null] as const;
		})
	);
	const items = sitesRead.ok
		? attentionItems({
				sites: sitesRead.data,
				packages: packagesRead.ok ? packagesRead.data : null,
				blocked: Object.fromEntries(blockedChecks),
				forms: formsRead.ok ? formsRead.data : null,
				base,
				manage: abilities.manage
			})
		: [];
	// The sites' own failure is shown in the Field return; here, only what else could not be checked.
	const unchecked = [
		...(packagesRead.ok ? [] : [{ what: "the map packages", failure: packagesRead.failure }]),
		...(formsRead.ok ? [] : [{ what: "the forms", failure: formsRead.failure }])
	];

	// Activity: from whichever sources could be read; the others are named.
	const entries = activity(
		{
			rows: observationsRead.ok ? observationsRead.data.items : [],
			packages: packagesRead.ok ? packagesRead.data : [],
			forms: formsRead.ok ? formsRead.data : [],
			sites: sitesRead.ok ? sitesRead.data : []
		},
		projectClock,
		{ limit: 12 }
	);
	const unread = [
		...(observationsRead.ok ? [] : [{ what: "recent observations", failure: observationsRead.failure }]),
		...(packagesRead.ok ? [] : [{ what: "map package activity", failure: packagesRead.failure }]),
		...(formsRead.ok ? [] : [{ what: "form activity", failure: formsRead.failure }])
	];

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="What came back from the field"
				lead={ref.name}
				actions={
					<ButtonLink variant="primary" href={`${base}/data`} iconRight="arrow-right">
						Open observations
					</ButtonLink>
				}
			/>
			<FieldReturnIsland
				sites={sitesRead}
				observations={observationsRead}
				recent={recentRead}
				nowIso={nowIso}
				clock={projectClock}
				dataHref={`${base}/data`}
			/>
			<div className="grid gap-6 xl:grid-cols-[minmax(0,4fr)_minmax(0,3fr)] xl:items-start">
				<Suspense
					fallback={
						<Island flush divided={false} title="Coverage by zone">
							<ScreenState kind="loading" loadingLabel="Loading coverage…" rows={3} headingLevel={3} />
						</Island>
					}>
					<CoverageSection
						projectId={ref.id}
						base={base}
						manage={abilities.manage}
						sites={sitesRead}
						requested={firstOf(query.site)}
					/>
				</Suspense>
				<div className="flex flex-col gap-6">
					{sitesRead.ok && <AttentionIsland items={items} unchecked={unchecked} />}
					<ActivityIsland
						entries={entries}
						unread={unread}
						limited={
							observationsRead.ok &&
							observationsRead.data.total_matching > observationsRead.data.items.length
						}
						nowIso={nowIso}
						clock={projectClock}
						dataHref={`${base}/data`}
					/>
				</div>
			</div>
		</div>
	);
}
