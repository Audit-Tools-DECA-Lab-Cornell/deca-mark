"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Note } from "@/components/contour/Note";
import { MapFrame } from "@/components/map/MapFrame";
import { ZoneEditor } from "@/features/zones/editor/ZoneEditor";
import { newId } from "@/lib/ids";
import { MAP_PALETTES, useMapPalette } from "@/lib/map-palette";
import { fromPlan, toPlan } from "@/lib/plan";
import { type DraftZone, partsOf, type Position } from "@/lib/zones/geometry";

import { CoordinateEntry } from "./CoordinateEntry";
import { closeOutline, nextZoneCode } from "./model";
import { OutlineVertices } from "./OutlineVertices";
import { setupPlan } from "./plan";
import type { Content, SourceLayer } from "./schema";

export type BoundaryEditorProps = {
	readonly layers: readonly SourceLayer[];
	readonly baseZoneIds: readonly string[];
	readonly content: Content;
	readonly onChange: (content: Content) => void;
	readonly onPending: (pending: boolean) => void;
};
/** Edit one accepted map-setup snapshot until its parent explicitly remounts it. */
export function BoundaryEditor({ layers, content, onChange, onPending, baseZoneIds }: BoundaryEditorProps) {
	const [initial] = useState(() => setupPlan("Map setup", layers, content));
	const [drawing, setDrawing] = useState(false);
	useEffect(() => {
		onPending(drawing);
		return () => onPending(false);
	}, [drawing, onPending]);
	const [target, setTarget] = useState<"outline" | "zone">("outline");
	const [points, setPoints] = useState<readonly Position[]>([]);
	const [future, setFuture] = useState<readonly Position[]>([]);
	const [palette] = useMapPalette();
	const live = useMemo(() => setupPlan("Map setup", layers, content), [layers, content]);
	const plan =
		live && initial ? { ...live, frame: initial.frame, width: initial.width, height: initial.height } : null;
	const changeZones = useCallback(
		(zones: readonly DraftZone[]) => {
			if (JSON.stringify(zones) !== JSON.stringify(content.zones)) onChange({ ...content, zones: [...zones] });
		},
		[content, onChange]
	);
	if (!plan)
		return (
			<Note title="Map features are needed first">
				Return to Add map and include the missing data files before drawing boundaries.
			</Note>
		);
	const finish = () => {
		const outline = closeOutline(points);
		if (outline) {
			onChange(
				target === "outline"
					? { ...content, outline }
					: {
							...content,
							zones: [
								...content.zones,
								{
									zone_id: newId(),
									zone_code: nextZoneCode(content.zones),
									zone_label: "",
									geometry: outline
								}
							]
						}
			);
			setDrawing(false);
			setPoints([]);
		}
	};
	const add = (point: Position) => {
		setPoints(current => [...current, point]);
		setFuture([]);
	};
	const projected = points.map(point => toPlan(point, plan.frame));
	return (
		<div className="flex flex-col gap-5">
			<section className="flex flex-col gap-4" aria-labelledby="outline-heading">
				<h2 id="outline-heading" className="type-heading">
					{content.outline ? "Review the site outline" : "Draw the site outline"}
				</h2>
				<p className="type-body text-ink-2">
					Mark the outside edge of the site. You’ll draw the observation zones next.
				</p>
				{!drawing && (
					<Button
						variant="outline"
						onClick={() => {
							setTarget("outline");
							setDrawing(true);
							setPoints([]);
							setFuture([]);
						}}>
						{content.outline ? "Redraw site outline" : "Draw site outline"}
					</Button>
				)}
				{content.outline && !drawing && (
					<Button
						variant="outline"
						onClick={() => {
							setTarget("zone");
							setDrawing(true);
							setPoints([]);
							setFuture([]);
						}}>
						Draw a zone with coordinates
					</Button>
				)}
				{drawing && (
					<>
						<CoordinateEntry onAdd={add} />
						<div className="flex flex-wrap gap-2">
							<Button variant="ink" onClick={finish} disabled={!closeOutline(points)}>
								{target === "outline" ? "Finish outline" : "Finish zone"}
							</Button>
							<Button
								variant="outline"
								disabled={!points.length}
								onClick={() => {
									const last = points.at(-1);
									if (last) {
										setPoints(points.slice(0, -1));
										setFuture([last, ...future]);
									}
								}}>
								Undo point
							</Button>
							<Button
								variant="outline"
								disabled={!future.length}
								onClick={() => {
									const first = future[0];
									if (first) {
										setPoints([...points, first]);
										setFuture(future.slice(1));
									}
								}}>
								Redo point
							</Button>
							<Button variant="outline" onClick={() => setDrawing(false)}>
								Cancel drawing
							</Button>
						</div>
						<p role="status" className="type-small">
							{points.length} points placed. This unfinished{" "}
							{target === "outline" ? "site outline" : "zone"} has not been added to your saved draft.
						</p>
					</>
				)}
				{content.outline && !drawing && (
					<OutlineVertices
						geometry={content.outline}
						onChange={outline => onChange({ ...content, outline })}
					/>
				)}
				<MapFrame
					site={plan}
					title="Site outline"
					mapVersion="Draft"
					mode={drawing ? "draw" : "pan"}
					onPlanClick={point => {
						if (drawing) add(fromPlan(point, plan.frame));
					}}>
					<g pointerEvents="none">
						<polyline
							points={projected.map(point => point.join(",")).join(" ")}
							fill="none"
							stroke={MAP_PALETTES[palette].site.edge}
							strokeWidth={2}
						/>
						{projected.map(([x, y], index) => (
							<circle key={index} cx={x} cy={y} r={3} fill={MAP_PALETTES[palette].site.edge} />
						))}
					</g>
				</MapFrame>
			</section>
			{content.outline && (
				<section className="flex flex-col gap-4">
					<h2 className="type-heading">
						{content.zones.length ? "Review the zones" : "No zones in this project. Draw them here."}
					</h2>
					<p className="type-body text-ink-2">
						Zones divide the site into areas for observations. Give each zone a name and unique code before
						publishing.
					</p>
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
				</section>
			)}
		</div>
	);
}
