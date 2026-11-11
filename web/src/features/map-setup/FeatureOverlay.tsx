"use client";

import { usePlanCamera } from "@/components/map/MapFrame";
import {
	boundsOf,
	interiorAnchor,
	type PlanBounds,
	type PlanFrame,
	type PlanParts,
	type PlanPoint,
	projectParts,
	toPlan,
	zonePath
} from "@/lib/plan";
import { readZoneGeometry } from "@/lib/zones/geometry";

import type { SourceLayer } from "./schema";

type SourceFeature = SourceLayer["features"][number]["feature"];

/** One imported feature as plan shapes, with the point its number sits on. */
export type OverlayShape = {
	readonly key: string;
	readonly number: number;
	readonly name: string;
	readonly areas: PlanParts | null;
	readonly lines: readonly (readonly PlanPoint[])[];
	readonly points: readonly PlanPoint[];
	readonly anchor: PlanPoint;
	readonly bounds: PlanBounds;
};

function isPair(value: unknown): value is [number, number] {
	return Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number" && value.length >= 2;
}

function pairs(value: unknown): [number, number][] {
	return Array.isArray(value) ? value.filter(isPair) : [];
}

/** Projects an imported feature for the overlay. Shapes that cannot be read are simply not drawn. */
export function overlayShape(
	feature: SourceFeature,
	frame: PlanFrame,
	key: string,
	number: number,
	name: string
): OverlayShape | null {
	const type = feature.geometry?.type;
	const coordinates = feature.geometry?.coordinates;
	let areas: PlanParts | null = null;
	let lines: PlanPoint[][] = [];
	let points: PlanPoint[] = [];
	if (type === "Polygon" || type === "MultiPolygon") {
		const read = readZoneGeometry(feature.geometry);
		if (!read.ok) return null;
		areas = projectParts(read.geometry, frame);
	} else if (type === "LineString") {
		lines = [pairs(coordinates).map(point => toPlan(point, frame))];
	} else if (type === "MultiLineString") {
		lines = (Array.isArray(coordinates) ? coordinates : []).map(line =>
			pairs(line).map(point => toPlan(point, frame))
		);
	} else if (type === "Point") {
		points = isPair(coordinates) ? [toPlan(coordinates, frame)] : [];
	} else if (type === "MultiPoint") {
		points = pairs(coordinates).map(point => toPlan(point, frame));
	}
	const every = [...(areas ?? []).flatMap(rings => rings[0] ?? []), ...lines.flat(), ...points];
	const first = every[0];
	if (!first) return null;
	const longest = [...lines].sort((a, b) => b.length - a.length)[0];
	const anchor = areas ? interiorAnchor(areas) : (longest?.[Math.floor(longest.length / 2)] ?? first);
	return { key, number, name, areas, lines, points, anchor, bounds: boundsOf(every) };
}

const PIN = 22;

/**
 * The imported features of one layer over the plan: a numbered ink pin on each, matching the numbers in
 * the list, and an ink edge round the selected one. Chrome on a map is ink, never a state colour. Pressing
 * a shape or its pin selects the row; the list offers the same choice to the keyboard.
 */
export function FeatureOverlay({
	shapes,
	selected,
	onSelect
}: {
	readonly shapes: readonly OverlayShape[];
	readonly selected: string | null;
	readonly onSelect: (key: string) => void;
}) {
	const unit = 1 / usePlanCamera().pixelsPerUnit;
	const chosen = shapes.find(shape => shape.key === selected);
	return (
		<g data-feature-overlay>
			{shapes.map(shape => (
				<g key={shape.key} aria-hidden="true" className="cursor-pointer" onClick={() => onSelect(shape.key)}>
					{shape.areas && <path d={zonePath(shape.areas)} fill="transparent" fillRule="evenodd" />}
					{shape.lines.map((line, index) => (
						<polyline
							key={index}
							points={line.map(point => point.join(",")).join(" ")}
							fill="none"
							stroke="transparent"
							strokeWidth={16 * unit}
						/>
					))}
					{shape.points.map(([x, y], index) => (
						<circle key={index} cx={x} cy={y} r={14 * unit} fill="transparent" />
					))}
				</g>
			))}
			{chosen && (
				<g aria-hidden="true" pointerEvents="none">
					{chosen.areas && (
						<>
							<path
								d={zonePath(chosen.areas)}
								fill="none"
								strokeWidth={6 * unit}
								strokeLinejoin="round"
								className="stroke-island"
							/>
							<path
								d={zonePath(chosen.areas)}
								fillRule="evenodd"
								fillOpacity={0.12}
								strokeWidth={2.5 * unit}
								strokeLinejoin="round"
								className="fill-ink stroke-ink"
							/>
						</>
					)}
					{chosen.lines.map((line, index) => (
						<g key={index} fill="none" strokeLinecap="round" strokeLinejoin="round">
							<polyline
								points={line.map(point => point.join(",")).join(" ")}
								strokeWidth={8 * unit}
								className="stroke-island"
							/>
							<polyline
								points={line.map(point => point.join(",")).join(" ")}
								strokeWidth={3.5 * unit}
								className="stroke-ink"
							/>
						</g>
					))}
					{chosen.points.map(([x, y], index) => (
						<g key={index} fill="none">
							<circle cx={x} cy={y} r={13 * unit} strokeWidth={5 * unit} className="stroke-island" />
							<circle cx={x} cy={y} r={13 * unit} strokeWidth={2.5 * unit} className="stroke-ink" />
						</g>
					))}
				</g>
			)}
			{shapes.map(shape => {
				const width = 14 + String(shape.number).length * 9;
				const active = shape.key === selected;
				return (
					<g
						key={shape.key}
						aria-hidden="true"
						className="cursor-pointer"
						onClick={() => onSelect(shape.key)}
						transform={`translate(${shape.anchor[0]} ${shape.anchor[1]}) scale(${unit}) translate(${-width / 2} ${-PIN / 2})`}>
						<rect
							width={width}
							height={PIN}
							rx={PIN / 2}
							strokeWidth={2}
							className={active ? "fill-ink stroke-ink" : "fill-island stroke-ink"}
						/>
						<text
							x={width / 2}
							y={PIN / 2}
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={13}
							className={active ? "fill-on-ink font-mono" : "fill-ink font-mono"}>
							{shape.number}
						</text>
					</g>
				);
			})}
		</g>
	);
}
