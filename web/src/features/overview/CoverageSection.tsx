import { Island } from "@/components/contour/Island";
import { ScreenState } from "@/components/contour/ScreenState";
import { TextLink } from "@/components/contour/TextLink";
import { LoadFailure } from "@/components/shell/LoadFailure";
import type { Site } from "@/lib/api/types";
import { getSitePlan, summarizeObservations } from "@/lib/api/workspace";
import { coverageFromGroups } from "@/lib/observations/summary";
import { settle } from "@/lib/workspace/result";
import type { Result } from "@/lib/workspace/types";

import { CoverageIsland } from "./CoverageIsland";
import { pickCoverageSite } from "./model";

export type CoverageSectionProps = {
	projectId: string;
	/** The project's address, for links. */
	base: string;
	/** Managers get a link to the Sites page when there is nothing to count yet. */
	manage: boolean;
	sites: Result<readonly Site[]>;
	/** The site asked for with `?site=`. */
	requested?: string;
};

/**
 * Coverage by zone for one site: the zones of its current map package (named by the package), the
 * records it holds in each round, counted by the server for every map version, and its plan. Reads the
 * counts and plan here, so the rest of the Overview does not wait for the plan's archive.
 */
export async function CoverageSection({ projectId, base, manage, sites, requested }: CoverageSectionProps) {
	if (!sites.ok) return <LoadFailure failure={sites.failure} what="the coverage" />;

	const chosen = pickCoverageSite(sites.data, requested);
	if (!chosen?.package)
		return (
			<Island flush divided={false} title="Coverage by zone">
				<ScreenState
					kind="empty"
					icon="layers"
					title="No site has a map package yet"
					body="Coverage counts records by the zones of a site's map package, so it appears once a package is uploaded."
					actions={manage ? <TextLink href={`${base}/sites`}>Open sites</TextLink> : undefined}
				/>
			</Island>
		);

	const packageId = chosen.package.package_id;
	const [counts, plan] = await Promise.all([
		settle(summarizeObservations(projectId, { siteId: chosen.site_id })),
		settle(getSitePlan(projectId, packageId, chosen.name))
	]);
	if (!counts.ok) return <LoadFailure failure={counts.failure} what="the coverage" />;

	let planNote: string | null = null;
	if (!plan.ok) planNote = `The site plan could not be loaded. ${plan.failure.message} The counts are not affected.`;
	else if (plan.data === null)
		planNote = "This map package could not be drawn as a plan. The counts are not affected.";

	return (
		<CoverageIsland
			site={{ code: chosen.code, name: chosen.name, version: chosen.package.package_version }}
			choices={sites.data.filter(site => site.package).map(site => ({ code: site.code, name: site.name }))}
			coverage={coverageFromGroups(
				counts.data.groups,
				chosen.zones.map(zone => ({ id: zone.zone_id, label: zone.label }))
			)}
			plan={plan.ok ? plan.data : null}
			planNote={planNote}
			siteHref={`${base}/sites/${chosen.code}`}
			dataHref={`${base}/data`}
		/>
	);
}
