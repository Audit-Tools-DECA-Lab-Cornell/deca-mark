"use client";

import type { ReactNode } from "react";

import { usePlanCamera } from "@/components/map/MapFrame";
import type { PlanPoint } from "@/lib/plan";

/**
 * Chrome the editor draws over the plan, in plan units at a constant size on screen: problem markers and the
 * snap target. Problems are numbered ink pills, never an attention colour on the map (rule 03); the
 * Problems island carries the words.
 */

const PILL_HEIGHT = 22;
const SNAP_RING = 13;

/** Plan units per screen pixel, for drawing at a fixed size while the plan zooms. */
function useUnit(): number {
	return 1 / usePlanCamera().pixelsPerUnit;
}

export function ProblemPills({ pills }: { pills: readonly { number: number; at: PlanPoint }[] }) {
	const unit = useUnit();
	return (
		<g aria-hidden="true" pointerEvents="none">
			{pills.map(({ number, at: [x, y] }) => {
				const width = 14 + String(number).length * 9;
				return (
					<g key={number} transform={`translate(${x} ${y}) scale(${unit}) translate(10 -${PILL_HEIGHT + 6})`}>
						<rect width={width} height={PILL_HEIGHT} rx={PILL_HEIGHT / 2} className="fill-ink" />
						<text
							x={width / 2}
							y={PILL_HEIGHT / 2}
							textAnchor="middle"
							dominantBaseline="central"
							fontSize={13}
							className="fill-on-ink font-mono">
							{number}
						</text>
					</g>
				);
			})}
		</g>
	);
}

/** A ring round the exact point a drag or a drawn point will snap to. */
export function SnapMarker({ at }: { at: PlanPoint | null }) {
	const unit = useUnit();
	if (!at) return null;
	return (
		<g aria-hidden="true" pointerEvents="none" transform={`translate(${at[0]} ${at[1]}) scale(${unit})`}>
			<circle r={SNAP_RING} fill="none" strokeWidth={5} className="stroke-island" />
			<circle r={SNAP_RING} fill="none" strokeWidth={2.5} className="stroke-ink" />
		</g>
	);
}

/** Groups the editing layer so it sits above the plan's zones and labels. */
export function EditorLayer({ children }: { children: ReactNode }) {
	return <g data-zone-editor>{children}</g>;
}
