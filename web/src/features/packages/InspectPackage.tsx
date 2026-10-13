"use client";

import { type Fact, FactsList } from "@/components/contour/FactsList";
import { Island, IslandSection } from "@/components/contour/Island";
import { StateBadge } from "@/components/contour/StateBadge";
import { TextLink } from "@/components/contour/TextLink";
import { MapFrame } from "@/components/map/MapFrame";
import { LoadFailure } from "@/components/shell/LoadFailure";
import type { PreparationCheck } from "@/lib/api/types";
import { plural } from "@/lib/labels";
import { SLOT_LABELS } from "@/lib/packages";
import type { ProjectedSite } from "@/lib/plan";
import type { Failure } from "@/lib/workspace/types";

import { CheckBadge } from "./CheckBadge";
import { CHECK_STEP } from "./checks";
import { DownloadPackageButton } from "./DownloadPackageButton";
import type { HistoryState } from "./history";
import type { ManifestView } from "./manifest";

export type InspectedPackage = {
	packageId: string;
	version: number;
	ready: boolean;
	state: HistoryState;
	prepared: string;
	sizeLabel: string;
	formVersion: string;
	/** The inventory form the package binds, or null when Inventory is off on this map. */
	inventoryFormVersion: string | null;
	checks: PreparationCheck[];
	manifest: ManifestView | null;
};

function layerName(name: string): string {
	return name in SLOT_LABELS ? SLOT_LABELS[name as keyof typeof SLOT_LABELS] : name;
}

/**
 * Inspect: what DECA Mark found when it prepared one package (its checks, one by one) and what the package
 * holds (zones, layers, the QGIS project it came from). A ready package is drawn on a plan and can be
 * downloaded; a blocked one has neither, only the reasons.
 */
export function InspectPackage({
	projectId,
	siteCode,
	pkg,
	plan,
	planFailure,
	closeHref
}: {
	projectId: string;
	siteCode: string;
	pkg: InspectedPackage;
	plan: ProjectedSite | null;
	planFailure: Failure | null;
	closeHref: string;
}) {
	const { manifest } = pkg;
	const facts: Fact[] = [
		{ label: "Version", value: `v${pkg.version}`, mono: true },
		{ label: "Prepared", value: pkg.prepared },
		{ label: "Size", value: pkg.sizeLabel, mono: true },
		{ label: "Form version", value: <span className="break-all">{pkg.formVersion}</span>, mono: true },
		{
			label: "Inventory form",
			value: pkg.inventoryFormVersion ? (
				<span className="break-all">{pkg.inventoryFormVersion}</span>
			) : (
				"None: Inventory is off on this map"
			),
			mono: pkg.inventoryFormVersion !== null
		}
	];
	if (manifest && manifest.layers.length > 0)
		facts.push({
			label: "Layers",
			value: manifest.layers
				.map(layer => `${layerName(layer.name)} ${plural(layer.features, "feature")}`)
				.join(" · ")
		});
	if (manifest?.project)
		facts.push({
			label: "QGIS project",
			value: [
				manifest.project.fileName,
				manifest.project.title,
				manifest.project.crs,
				`${plural(manifest.project.vectorLayers, "vector layer")}, ${plural(manifest.project.rasterLayers, "raster layer")}`
			]
				.filter(Boolean)
				.join(" · ")
		});

	const showMap = pkg.ready && (plan !== null || planFailure !== null);

	return (
		<div className={showMap ? "grid items-start gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" : undefined}>
			{showMap && (
				<div className="min-w-0">
					{planFailure ? (
						<LoadFailure failure={planFailure} what="this map package" />
					) : plan ? (
						<MapFrame site={plan} mapVersion={`v${pkg.version}`} />
					) : null}
				</div>
			)}

			<Island
				flush
				divided
				title={`Inspect v${pkg.version}`}
				meta={
					pkg.state === "current" ? (
						<StateBadge kind="package" state="active" />
					) : pkg.state === "archived" ? (
						<StateBadge kind="package" state="archived" />
					) : (
						<StateBadge kind="check" state="fails" />
					)
				}>
				<IslandSection className="pt-4 pb-5">
					<FactsList items={facts} labelWidth="8.5rem" />
				</IslandSection>

				<ul aria-label={`Checks for v${pkg.version}`} className="border-t border-rule">
					{pkg.checks.map((check, index) => (
						<li
							key={`${check.step}-${index}`}
							className="flex items-start justify-between gap-4 border-b border-rule px-island-pad py-3.5">
							<span className="min-w-0">
								<span className="block type-body font-semibold text-ink">{CHECK_STEP[check.step]}</span>
								<span className="block type-small break-words text-ink-2">{check.detail}</span>
							</span>
							<CheckBadge state={check.state} />
						</li>
					))}
				</ul>

				{manifest && manifest.zones.length > 0 && (
					<IslandSection className="pt-4 pb-5">
						<p className="type-mono-label text-ink-2">Zones in this package</p>
						<ul className="mt-2 divide-y divide-rule">
							{manifest.zones.map(zone => (
								<li
									key={zone.id}
									className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
									<span className="min-w-0 break-words text-ink">{zone.label}</span>
									<span className="type-mono-data break-all text-ink-2">{zone.code ?? zone.id}</span>
								</li>
							))}
						</ul>
					</IslandSection>
				)}

				<IslandSection className="flex flex-wrap items-start gap-x-6 gap-y-3 pt-4 pb-island-pad">
					{pkg.ready ? (
						<DownloadPackageButton
							projectId={projectId}
							packageId={pkg.packageId}
							siteCode={siteCode}
							version={pkg.version}
						/>
					) : (
						<p className="type-body text-ink-2">A blocked package cannot be downloaded.</p>
					)}
					<TextLink href={closeHref} arrow="left">
						Back to history
					</TextLink>
				</IslandSection>
			</Island>
		</div>
	);
}
