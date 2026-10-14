"use client";

import Link from "next/link";

import { Icon } from "@/components/contour/Icon";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { PlanThumbnail } from "@/components/map/PlanThumbnail";
import { projectHref } from "@/features/shell/navigation";
import { plural } from "@/lib/labels";
import type { ProjectedSite } from "@/lib/plan";

import { CreateSiteDialog } from "./CreateSiteDialog";
import { Eyebrow } from "./parts";
import type { SiteView } from "./view";

/**
 * Sites: every place in the project with its current map package, its zones and how many observations it
 * holds. Managers create sites here; a site's map and zones arrive with its first map package.
 */
export function SitesScreen({
	org,
	project,
	canManage,
	sites,
	plans
}: {
	org: string;
	project: string;
	canManage: boolean;
	sites: SiteView[];
	/** Plans of the first few sites with a map package, by site code, for the thumbnails. */
	plans: Record<string, ProjectedSite>;
}) {
	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				title="Sites"
				lead="Places where observers collect, each with its own map package and zones."
				actions={<CreateSiteDialog org={org} project={project} canManage={canManage} />}
			/>
			<Island flush title="All sites" meta={plural(sites.length, "site")}>
				{sites.length === 0 ? (
					<ScreenState
						kind="empty"
						icon="map"
						headingLevel={3}
						title="No sites yet"
						body={
							canManage
								? "A site is one real place. Use Create site to add the first one, then upload its map package from QGIS."
								: "A site is one real place. A project manager can add the first one."
						}
					/>
				) : (
					<ul>
						{sites.map(site => (
							<li key={site.code} className="relative border-t border-rule first:border-t-0">
								<SiteRow
									site={site}
									href={projectHref(org, project, `sites/${site.code}`)}
									plan={plans[site.code]}
								/>
							</li>
						))}
					</ul>
				)}
			</Island>
			<Note icon="layers">
				A site&rsquo;s map and zones come from a map package prepared in QGIS. Open a site to upload one.
			</Note>
		</div>
	);
}

const ROW =
	"grid grid-cols-[5rem_minmax(0,1fr)_1.5rem] items-center gap-x-4 gap-y-4 px-island-pad py-5 " +
	"transition-[background-color] duration-(--ct-duration-quick) ease-standard hover:bg-ground " +
	"md:grid-cols-[9.75rem_minmax(0,1fr)_1.5rem] " +
	"lg:grid-cols-[9.75rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_1.5rem]";

/** The facts sit under the name until the row is wide enough for them to sit beside it. */
const FACT = "col-span-3 md:col-span-1 md:col-start-2 lg:col-start-auto";

function SiteRow({ site, href, plan }: { site: SiteView; href: string; plan: ProjectedSite | undefined }) {
	return (
		<div className={ROW}>
			{plan ? (
				<PlanThumbnail site={plan} className="w-20 md:w-39" />
			) : (
				<span
					aria-hidden="true"
					className="grid aspect-[36/25] w-20 place-items-center rounded-thumb border border-dashed border-edge text-ink-2 md:w-39">
					<Icon name="layers" size={20} />
				</span>
			)}

			<div className="min-w-0">
				<h3 className="type-island text-ink sm:type-section">
					{/* The whole row opens the site; the name is the link a keyboard or screen reader finds. */}
					<Link prefetch={false} href={href} className="break-words after:absolute after:inset-0">
						{site.name}
					</Link>
				</h3>
				<p className="mt-1 type-mono-data break-all text-ink-2">{site.code}</p>
			</div>

			<div className={FACT}>
				<Eyebrow>Map package</Eyebrow>
				{site.package ? (
					<p className="mt-2 type-body text-ink">
						<span className="type-mono-data">v{site.package.version}</span>
						<span className="text-ink-2"> · {site.package.preparedDay}</span>
					</p>
				) : (
					<p className="mt-2 type-body text-ink-2">No map package yet</p>
				)}
			</div>

			<div className={FACT}>
				<Eyebrow>Zones</Eyebrow>
				<p className={site.package ? "mt-2 type-body text-ink" : "mt-2 type-body text-ink-2"}>
					{site.zonesLabel}
				</p>
			</div>

			<div className={FACT}>
				<Eyebrow>Observations</Eyebrow>
				<p className="mt-2 type-body text-ink">{site.observationsLabel}</p>
			</div>

			<Icon
				name="chevron-right"
				size={22}
				className="col-start-3 row-start-1 shrink-0 text-ink lg:col-start-auto lg:row-start-auto"
			/>
		</div>
	);
}
