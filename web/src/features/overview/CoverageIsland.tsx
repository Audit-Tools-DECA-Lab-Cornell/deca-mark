"use client";

import { usePathname, useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Field } from "@/components/contour/Field";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { Select } from "@/components/contour/Select";
import { StateBadge } from "@/components/contour/StateBadge";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/contour/Table";
import { TextLink } from "@/components/contour/TextLink";
import { MapFrame } from "@/components/map/MapFrame";
import type { ZonePlanStyle } from "@/components/map/SitePlan";
import { cx } from "@/lib/cx";
import { plural, ROUND_TYPES, roundName } from "@/lib/labels";
import type { Coverage } from "@/lib/observations/summary";
import { type ProjectedSite, zonePath } from "@/lib/plan";

export type CoverageIslandProps = {
	/** The site the counts are about, and the version of its current map package. */
	site: { code: string; name: string; version: number };
	/** Sites that have a current package, for the site picker (shown when there is more than one). */
	choices: readonly { code: string; name: string }[];
	coverage: Coverage;
	/** The site's plan from its current package; null when it could not be drawn. */
	plan: ProjectedSite | null;
	/** Why there is no plan, when there is not one. The counts do not depend on it. */
	planNote: string | null;
	siteHref: string;
	/** The Data page's address; zone rows add `?site=&zone=`. */
	dataHref: string;
};

/**
 * Coverage by zone: which zones have records in which rounds, for one site, with its plan beside the counts.
 * It is where records exist, never whether a round is complete: the project sets no target. Pointing at a
 * zone row highlights its zone on the plan, and the other way round.
 */
export function CoverageIsland({ site, choices, coverage, plan, planNote, siteHref, dataHref }: CoverageIslandProps) {
	const pickerId = useId();
	const router = useRouter();
	const pathname = usePathname();
	const [switching, startSwitch] = useTransition();
	const [hovered, setHovered] = useState<string | null>(null);

	const zoneStyles: Record<string, ZonePlanStyle> = Object.fromEntries(
		(plan?.zones ?? []).map(zone => [
			zone.id,
			(hovered !== null && hovered === zone.id
				? { emphasis: "focus", hatched: true }
				: {}) satisfies ZonePlanStyle
		])
	);
	const leave = (zone: string) => setHovered(current => (current === zone ? null : current));
	const dataFor = (zone: string) =>
		`${dataHref}?site=${encodeURIComponent(site.code)}&zone=${encodeURIComponent(zone)}`;

	return (
		<Island
			flush
			divided={false}
			title="Coverage by zone"
			aria-busy={switching || undefined}
			meta={`${site.name} · ${plural(coverage.total, "observation")}`}
			actions={<TextLink href={siteHref}>Open {site.name}</TextLink>}
			footnote={
				<div className="flex flex-col gap-2">
					<p>
						Counts are every observation recorded in each zone and round, on every map version. They show
						where records exist, not whether a round is complete.
					</p>
					{coverage.totals.inventory > 0 && (
						<p>Inventory observations describe a whole zone, not a place in it.</p>
					)}
				</div>
			}>
			{choices.length > 1 && (
				<div className="px-island-pad pb-4">
					<Field label="Site" htmlFor={pickerId} className="max-w-sm">
						<Select
							id={pickerId}
							value={site.code}
							onChange={event =>
								startSwitch(() =>
									router.replace(`${pathname}?site=${encodeURIComponent(event.target.value)}`, {
										scroll: false
									})
								)
							}>
							{choices.map(choice => (
								<option key={choice.code} value={choice.code}>
									{choice.name}
								</option>
							))}
						</Select>
					</Field>
				</div>
			)}
			{plan ? (
				<div className="px-island-pad pb-5">
					<MapFrame
						site={plan}
						surface="panel"
						mapVersion={`v${site.version}`}
						title={`${site.name} · plan`}
						subtitle={`Map v${site.version}`}
						zones={zoneStyles}>
						{/* Invisible zone shapes over the plan, so pointing at a zone highlights its row. */}
						<g aria-hidden="true">
							{plan.zones.map(zone => (
								<path
									key={zone.id}
									d={zonePath(zone.parts)}
									fillRule="nonzero"
									fill="none"
									pointerEvents="all"
									onPointerEnter={() => setHovered(zone.id)}
									onPointerLeave={() => leave(zone.id)}
								/>
							))}
						</g>
					</MapFrame>
				</div>
			) : (
				planNote && (
					<div className="px-island-pad pb-5">
						<Note tone="neutral">{planNote}</Note>
					</div>
				)
			)}
			<div className="border-t border-rule">
				<Table caption={`Observations by zone and round at ${site.name}`}>
					<THead>
						<tr>
							<Th>Zone</Th>
							{ROUND_TYPES.map(type => (
								<Th key={type} numeric>
									{roundName(type)}
								</Th>
							))}
							<Th numeric>Total</Th>
						</tr>
					</THead>
					<TBody>
						{coverage.rows.map(row => (
							<Tr
								key={row.zone}
								onPointerEnter={() => setHovered(row.zone)}
								onPointerLeave={() => leave(row.zone)}
								onFocus={() => setHovered(row.zone)}
								onBlur={() => leave(row.zone)}
								className={cx(hovered === row.zone && "bg-ground")}>
								<Td>
									<TextLink tone="ink" href={dataFor(row.zone)}>
										{row.label}
									</TextLink>
									{!row.known && (
										<span className="block type-small text-ink-2">
											Not in the current map version
										</span>
									)}
									{row.total === 0 && (
										<span className="mt-1 block">
											<StateBadge kind="coverage" state="none" size="sm" />
										</span>
									)}
								</Td>
								{/* Spaces around each count keep neighbouring cells apart when the row is read as text. */}
								{ROUND_TYPES.map(type => (
									<Td key={type} numeric mono>
										{" "}
										{row.counts[type]}{" "}
									</Td>
								))}
								<Td numeric mono>
									{" "}
									{row.total}{" "}
								</Td>
							</Tr>
						))}
						{coverage.rows.length > 1 && (
							<Tr>
								<Td className="font-semibold">All zones</Td>
								{ROUND_TYPES.map(type => (
									<Td key={type} numeric mono>
										{" "}
										{coverage.totals[type]}{" "}
									</Td>
								))}
								<Td numeric mono>
									{" "}
									{coverage.total}{" "}
								</Td>
							</Tr>
						)}
					</TBody>
				</Table>
			</div>
		</Island>
	);
}
