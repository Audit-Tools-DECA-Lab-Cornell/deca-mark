"use client";

import type { ReactNode } from "react";

import { ButtonLink } from "@/components/contour/Button";
import { type Fact, FactsList } from "@/components/contour/FactsList";
import { Icon } from "@/components/contour/Icon";
import { InnerPanel } from "@/components/contour/InnerPanel";
import { Island } from "@/components/contour/Island";
import { PageHeader } from "@/components/contour/PageHeader";
import { ScreenState } from "@/components/contour/ScreenState";
import { StateBadge } from "@/components/contour/StateBadge";
import { TextLink } from "@/components/contour/TextLink";
import { MapFrame } from "@/components/map/MapFrame";
import { LoadFailure } from "@/components/shell/LoadFailure";
import { NotAvailable } from "@/components/shell/NotAvailable";
import { DownloadPackageButton } from "@/features/packages/DownloadPackageButton";
import { projectHref } from "@/features/shell/navigation";
import type { ZoneEntry } from "@/features/zones/model";
import { plural } from "@/lib/labels";
import type { ProjectedSite } from "@/lib/plan";
import type { Failure } from "@/lib/workspace/types";

import { EditSiteDialog } from "./EditSiteDialog";
import type { SiteView, ZoneRow } from "./view";

/**
 * A site: its plan from the current map package, its zones with how many observations each holds, the
 * current package with Download and Upload a new version, and the details a manager can edit. The Zones
 * island leads to the Zones page: "Edit zones" for managers where the web can edit them, "Zone versions"
 * otherwise.
 */
export function SiteScreen({
	org,
	project,
	projectId,
	canManage,
	site,
	plan,
	planFailure,
	zoneRows,
	countsFailure,
	zoneEntry
}: {
	org: string;
	project: string;
	projectId: string;
	canManage: boolean;
	site: SiteView;
	/** The current package drawn as a plan, or null when there is none or it cannot be drawn. */
	plan: ProjectedSite | null;
	/** Why the current package could not be fetched, when it could not. */
	planFailure: Failure | null;
	zoneRows: ZoneRow[];
	/** Why the observations could not be counted, when they could not: the zones show without counts. */
	countsFailure: Failure | null;
	zoneEntry: ZoneEntry;
}) {
	const sitesHref = projectHref(org, project, "sites");
	const base = `${sitesHref}/${site.code}`;
	const dataHref = projectHref(org, project, "data");
	const current = site.package;

	return (
		<div className="flex flex-col gap-6">
			<PageHeader
				breadcrumbs={[{ label: "Sites", href: sitesHref }, { label: site.name }]}
				title={site.name}
				lead={`${current ? site.zonesLabel : "No map package yet"} · ${site.observationsLabel}`}
				actions={
					<ButtonLink
						href={`${dataHref}?site=${encodeURIComponent(site.code)}`}
						variant="outline"
						iconRight="arrow-right">
						See observations
					</ButtonLink>
				}
			/>

			<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.36fr)_minmax(0,1fr)]">
				<div className="min-w-0">
					<MapSlot site={site} plan={plan} failure={planFailure} />
				</div>

				<div className="flex min-w-0 flex-col gap-6">
					<ZonesIsland
						entryLink={
							zoneEntry === "no-package" ? null : (
								<TextLink href={`${base}/zones`} tone="ink">
									{canManage && zoneEntry === "editable" ? "Edit zones" : "Zone versions"}
								</TextLink>
							)
						}
						hasPackage={current !== null}
						rows={zoneRows}
						failure={countsFailure}
						zoneHref={id =>
							`${dataHref}?site=${encodeURIComponent(site.code)}&zone=${encodeURIComponent(id)}`
						}
					/>

					<PackageIsland
						projectId={projectId}
						siteCode={site.code}
						current={current}
						canManage={canManage}
						uploadHref={`${base}/packages?step=upload`}
						historyHref={`${base}/packages`}
					/>

					<DetailsIsland org={org} project={project} site={site} canManage={canManage} />
				</div>
			</div>

			<div className="grid gap-4 lg:grid-cols-3">
				{zoneEntry === "unavailable" && (
					<NotAvailable
						title="Editing zones on the web for this site"
						instead="Edit the zones layer in QGIS and upload a new package."
					/>
				)}
				<NotAvailable
					title="Device readiness"
					reason="DECA Mark does not record which phones have downloaded this map."
					instead="Ask observers to open the site in the DECA Mark app before they go out."
				/>
				<NotAvailable
					title="Deleting a site or a map package"
					instead="To replace what observers download, upload a new version of the map package."
				/>
			</div>
		</div>
	);
}

function MapSlot({ site, plan, failure }: { site: SiteView; plan: ProjectedSite | null; failure: Failure | null }) {
	if (failure) return <LoadFailure failure={failure} what="the map" />;
	if (plan && site.package) return <MapFrame site={plan} mapVersion={`v${site.package.version}`} />;
	return (
		<InnerPanel dashed className="flex aspect-[36/25] flex-col items-center justify-center gap-3 px-6 text-center">
			<Icon name="layers" size={24} className="text-ink-2" />
			<p className="max-w-sm type-body text-ink-2">
				{site.package
					? "This map package cannot be drawn here. Its zones are listed beside it."
					: "The map appears here once the site has a map package."}
			</p>
		</InnerPanel>
	);
}

function ZonesIsland({
	entryLink,
	hasPackage,
	rows,
	failure,
	zoneHref
}: {
	/** The way to the Zones page, when the site has zones to show. */
	entryLink: ReactNode;
	hasPackage: boolean;
	rows: ZoneRow[];
	failure: Failure | null;
	zoneHref: (id: string) => string;
}) {
	return (
		<Island
			flush
			title="Zones"
			meta={hasPackage ? plural(rows.length, "zone") : undefined}
			actions={entryLink}
			footnote="Counts cover every map version of this site.">
			{rows.length === 0 ? (
				<ScreenState
					kind="empty"
					icon="layers"
					headingLevel={3}
					title="No zones yet"
					body="Zones come from the zones layer of the site's first map package."
				/>
			) : (
				<ul>
					{rows.map(row => (
						<li
							key={row.id}
							className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-t border-rule px-island-pad py-3.5 first:border-t-0">
							{/* Plain spaces keep a zone, its count and the next zone apart when the row is read as text. */}
							<div className="min-w-0">
								<TextLink href={zoneHref(row.id)} tone="ink" className="break-words">
									{row.label}
								</TextLink>{" "}
								{row.code && <p className="mt-1 type-mono-data break-all text-ink-2">{row.code}</p>}
								{!row.current && (
									<p className="mt-1 type-small text-ink-2">Not in the current map version.</p>
								)}
							</div>{" "}
							{row.countLabel && <p className="type-body text-ink">{row.countLabel}</p>}{" "}
						</li>
					))}
				</ul>
			)}
			{failure && <LoadFailure failure={failure} what="the observation counts" bare />}
		</Island>
	);
}

function PackageIsland({
	projectId,
	siteCode,
	current,
	canManage,
	uploadHref,
	historyHref
}: {
	projectId: string;
	siteCode: string;
	current: SiteView["package"];
	canManage: boolean;
	uploadHref: string;
	historyHref: string;
}) {
	const facts: Fact[] = current
		? [
				{ label: "Version", value: `v${current.version}`, mono: true },
				{ label: "Prepared", value: current.prepared },
				{ label: "Size", value: current.sizeLabel, mono: true },
				{ label: "Form version", value: current.formVersion, mono: true },
				{
					label: "Inventory form",
					value: current.inventoryFormVersion ?? "None: Inventory is off on this map",
					mono: current.inventoryFormVersion !== null
				}
			]
		: [];

	return (
		<Island
			flush
			divided
			title="Current map package"
			meta={current ? <StateBadge kind="package" state="active" /> : undefined}>
			<div className="flex flex-col gap-5 px-island-pad pt-4 pb-island-pad">
				{current ? (
					<>
						<FactsList items={facts} labelWidth="8.5rem" />
						<div className="flex flex-wrap items-start gap-3">
							<DownloadPackageButton
								projectId={projectId}
								packageId={current.packageId}
								siteCode={siteCode}
								version={current.version}
							/>
							{canManage && (
								<ButtonLink href={uploadHref} variant="primary" icon="upload">
									Upload a new version
								</ButtonLink>
							)}
						</div>
						<p className="type-small text-ink-2">
							Observers get this version the next time they make the site ready offline in the DECA Mark
							app.
						</p>
					</>
				) : (
					<>
						<p className="type-body text-ink-2">
							No map package yet. Observers cannot collect on this site until one is uploaded.
						</p>
						{canManage ? (
							<div>
								<ButtonLink href={uploadHref} variant="primary" icon="upload">
									Upload the first map package
								</ButtonLink>
							</div>
						) : (
							<p className="type-small text-ink-2">A project manager uploads map packages.</p>
						)}
					</>
				)}
				<TextLink href={historyHref}>Package history</TextLink>
			</div>
		</Island>
	);
}

function DetailsIsland({
	org,
	project,
	site,
	canManage
}: {
	org: string;
	project: string;
	site: SiteView;
	canManage: boolean;
}) {
	return (
		<Island flush divided title="Details">
			<div className="flex flex-col gap-5 px-island-pad pt-4 pb-island-pad">
				<FactsList
					labelWidth="8.5rem"
					items={[
						{ label: "Site code", value: site.code, mono: true },
						{
							label: "Description",
							value: site.description ? (
								<span className="break-words whitespace-pre-line">{site.description}</span>
							) : (
								<span className="text-ink-2">No description</span>
							)
						}
					]}
				/>
				{canManage && (
					<div>
						<EditSiteDialog
							org={org}
							project={project}
							code={site.code}
							name={site.name}
							description={site.description}
						/>
					</div>
				)}
			</div>
		</Island>
	);
}
