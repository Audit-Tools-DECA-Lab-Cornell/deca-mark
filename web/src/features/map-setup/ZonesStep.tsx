"use client";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Icon } from "@/components/contour/Icon";
import { Note } from "@/components/contour/Note";
import { ZoneEditor } from "@/features/zones/editor/ZoneEditor";
import { newId } from "@/lib/ids";
import { type DraftZone, partsOf, type Position } from "@/lib/zones/geometry";

import { CoordinateEntry } from "./CoordinateEntry";
import { closeOutline, nextZoneCode } from "./model";
import { setupPlan } from "./plan";
import type { Content, SourceLayer } from "./schema";

export type ZonesStepProps = {
	readonly layers: readonly SourceLayer[];
	readonly baseZoneIds: readonly string[];
	readonly content: Content;
	readonly onChange: (content: Content) => void;
	readonly onPending: (pending: boolean) => void;
	readonly footer: ReactNode;
};

/**
 * Step 3: the observation zones, in the same editor the Zones page uses. Zones that came with the project
 * arrive ready to check; others are drawn on the plan. Typing a zone's corners as coordinates is offered
 * below the editor for the few who need it.
 */
export function ZonesStep({ layers, baseZoneIds, content, onChange, onPending, footer }: ZonesStepProps) {
	const [initial] = useState(() => setupPlan("Map setup", layers, content));
	const [typing, setTyping] = useState(false);
	const [points, setPoints] = useState<readonly Position[]>([]);
	// Typed points are unfinished work until the zone is finished or cancelled; closing the section is neither.
	const unfinished = points.length > 0;
	useEffect(() => {
		onPending(unfinished);
		return () => onPending(false);
	}, [unfinished, onPending]);
	const plan = useMemo(() => setupPlan("Map setup", layers, content, initial?.frame), [layers, content, initial]);
	const changeZones = useCallback(
		(zones: readonly DraftZone[]) => {
			if (JSON.stringify(zones) === JSON.stringify(content.zones)) return;
			const zoneIds = new Set(zones.map(zone => zone.zone_id));
			onChange({
				...content,
				zones: [...zones],
				assignments: content.assignments.map(assignment =>
					assignment.role === "zones" && !zoneIds.has(assignment.zone_id ?? "")
						? { ...assignment, role: "leave_out", zone_id: null }
						: assignment
				)
			});
		},
		[content, onChange]
	);
	if (!plan || !content.outline)
		return (
			<Note title="The site outline is needed first">Return to Site outline and add it before the zones.</Note>
		);
	const finish = () => {
		const geometry = closeOutline(points);
		if (!geometry) return;
		onChange({
			...content,
			zones: [
				...content.zones,
				{ zone_id: newId(), zone_code: nextZoneCode(content.zones), zone_label: "", geometry }
			]
		});
		setTyping(false);
		setPoints([]);
	};
	return (
		<div className="flex flex-col gap-6">
			<div className="max-w-3xl">
				<h2 className="type-section">
					{content.zones.length ? "Review the zones" : "No zones in this project. Draw them here."}
				</h2>
				<p className="mt-2 type-body text-ink-2">
					Observation zones are the named areas observers choose before they record. Give each zone a name and
					a short code of its own; both appear in the app and in your data.
				</p>
			</div>
			<ZoneEditor
				key={content.zones.map(zone => zone.zone_id).join(",")}
				site={plan}
				siteBoundary={partsOf(content.outline)}
				zones={content.zones}
				baseZones={content.zones.filter(zone => baseZoneIds.includes(zone.zone_id))}
				baseVersion="Draft"
				mapTitle="Observation zones"
				mapSubtitle="Unpublished map setup"
				onZonesChange={changeZones}
			/>
			<details
				open={typing || unfinished}
				onToggle={event => setTyping(event.currentTarget.open)}
				className="max-w-xl rounded-note bg-well px-4 py-1">
				<summary // The section stays open while it holds typed points, so they are never hidden and forgotten.
					onClick={event => {
						if (unfinished) event.preventDefault();
					}}
					className="flex min-h-touch cursor-pointer list-none items-center gap-1.5 type-small font-semibold [&::-webkit-details-marker]:hidden">
					<Icon
						name="chevron-right"
						size={16}
						className="shrink-0 transition-transform duration-(--ct-duration-quick) [[open]>summary>&]:rotate-90"
					/>
					Add a zone by typing coordinates
				</summary>
				<div className="flex flex-col gap-3 pb-3">
					<CoordinateEntry onAdd={point => setPoints(current => [...current, point])} mapHint={false} />
					<p role="status" className="type-small">
						<span className="type-mono-data">{points.length}</span> points entered. This unfinished zone has
						not been added to your saved draft.
					</p>
					<div className="flex flex-wrap gap-2">
						<Button variant="ink" size="sm" disabled={!closeOutline(points)} onClick={finish}>
							Finish zone
						</Button>
						<Button
							variant="outline"
							size="sm"
							disabled={!points.length}
							onClick={() => setPoints(points.slice(0, -1))}>
							Undo point
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								setPoints([]);
								setTyping(false);
							}}>
							Cancel
						</Button>
					</div>
				</div>
			</details>
			{footer}
		</div>
	);
}
