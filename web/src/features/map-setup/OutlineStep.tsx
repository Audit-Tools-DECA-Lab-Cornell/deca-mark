"use client";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/contour/Button";
import { Icon } from "@/components/contour/Icon";
import { Island } from "@/components/contour/Island";
import { Note } from "@/components/contour/Note";
import { MapFrame } from "@/components/map/MapFrame";
import { fromPlan, toPlan } from "@/lib/plan";
import { openLength, type Position, ringAddresses, ringAt } from "@/lib/zones/geometry";

import { CoordinateEntry } from "./CoordinateEntry";
import { closeOutline } from "./model";
import { OutlineVertices } from "./OutlineVertices";
import { setupPlan } from "./plan";
import type { Content, SourceLayer } from "./schema";
import { MAP_HEIGHT, WORKSPACE_GRID } from "./workspace";

export type OutlineStepProps = {
	readonly layers: readonly SourceLayer[];
	readonly content: Content;
	readonly onChange: (content: Content) => void;
	readonly onPending: (pending: boolean) => void;
	/** Returns to the layers step, where an imported feature can be chosen as the outline instead. */
	readonly onChooseImported: () => void;
	readonly footer: ReactNode;
};

/**
 * Step 2: the site outline, the outer edge everything else sits inside. An outline that came with the
 * project is shown for checking; otherwise it is drawn by clicking round the site on the map. Typing
 * coordinates and moving single points stay available, one level down.
 */
export function OutlineStep({ layers, content, onChange, onPending, onChooseImported, footer }: OutlineStepProps) {
	const [initial] = useState(() => setupPlan("Map setup", layers, content));
	const [drawing, setDrawing] = useState(false);
	useEffect(() => {
		onPending(drawing);
		return () => onPending(false);
	}, [drawing, onPending]);
	const [points, setPoints] = useState<readonly Position[]>([]);
	const [future, setFuture] = useState<readonly Position[]>([]);
	const plan = useMemo(() => setupPlan("Map setup", layers, content, initial?.frame), [layers, content, initial]);
	if (!plan)
		return (
			<Note title="Map features are needed first">
				Return to Map layers and add the project’s data files before drawing the site outline.
			</Note>
		);
	const start = () => {
		setDrawing(true);
		setPoints([]);
		setFuture([]);
	};
	const finish = () => {
		const outline = closeOutline(points);
		if (!outline) return;
		onChange({ ...content, outline });
		setDrawing(false);
		setPoints([]);
	};
	const add = (point: Position) => {
		setPoints(current => [...current, point]);
		setFuture([]);
	};
	const projected = points.map(point => toPlan(point, plan.frame));
	const imported = content.assignments.some(item => item.role === "outline");
	const corners = content.outline
		? ringAddresses(content.outline).reduce(
				(sum, address) => sum + openLength(ringAt(content.outline!, address) ?? []),
				0
			)
		: 0;
	return (
		<div className={WORKSPACE_GRID}>
			<div className="lg:sticky lg:top-4">
				<MapFrame
					site={plan}
					title="Site outline"
					subtitle={drawing ? "Click round the edge of the site" : undefined}
					mapVersion="Draft"
					mode={drawing ? "draw" : "pan"}
					className={MAP_HEIGHT}
					onPlanClick={point => {
						if (drawing) add(fromPlan(point, plan.frame));
					}}>
					<g pointerEvents="none" fill="none" strokeLinecap="round" strokeLinejoin="round">
						{/* Ink over a light halo, like the zone editor's handles: map chrome is never a state colour. */}
						{projected.length > 2 && (
							<line
								x1={projected.at(-1)?.[0]}
								y1={projected.at(-1)?.[1]}
								x2={projected[0]?.[0]}
								y2={projected[0]?.[1]}
								strokeWidth={2}
								strokeDasharray="6 5"
								vectorEffect="non-scaling-stroke"
								className="stroke-ink"
							/>
						)}
						<polyline
							points={projected.map(point => point.join(",")).join(" ")}
							strokeWidth={6}
							vectorEffect="non-scaling-stroke"
							className="stroke-island"
						/>
						<polyline
							points={projected.map(point => point.join(",")).join(" ")}
							strokeWidth={2.5}
							vectorEffect="non-scaling-stroke"
							className="stroke-ink"
						/>
						{projected.map(([x, y], index) => (
							<line
								key={index}
								data-outline-point
								x1={x}
								y1={y}
								x2={x}
								y2={y}
								strokeWidth={11}
								vectorEffect="non-scaling-stroke"
								className="stroke-ink"
							/>
						))}
					</g>
				</MapFrame>
			</div>
			<div className="flex min-w-0 flex-col gap-6">
				<Island
					title={<span id="outline-heading">Site outline</span>}
					meta={
						content.outline ? (
							<>
								<span className="type-mono-data">{corners}</span> points
							</>
						) : (
							"Not added yet"
						)
					}>
					<div className="flex flex-col gap-4">
						<p className="type-body text-ink-2">
							The site outline is the outer edge of the place observers work in. Every observation zone
							sits inside it.
						</p>
						{!drawing && (
							<>
								<p className="type-body">
									{content.outline
										? imported
											? "This outline came from your QGIS project. Check it against the map."
											: "You drew this outline. Check it against the map."
										: "Your project has no site outline yet. Draw it on the map."}
								</p>
								<div className="flex flex-wrap gap-2">
									<Button variant={content.outline ? "outline" : "ink"} icon="pencil" onClick={start}>
										{content.outline ? "Redraw site outline" : "Draw site outline"}
									</Button>
								</div>
								{!content.outline && (
									<p className="type-small text-ink-2">
										Is the outline one of the imported areas?{" "}
										<button
											type="button"
											className="font-semibold text-ink underline decoration-1 underline-offset-4 hover:decoration-2"
											onClick={onChooseImported}>
											Choose it in Map layers
										</button>
										.
									</p>
								)}
							</>
						)}
						{drawing && (
							<>
								<p className="type-body">
									Click each corner of the site in order. You need at least three points.
								</p>
								<p role="status" className="type-small">
									<span className="type-mono-data">{points.length}</span> points placed. This
									unfinished site outline has not been added to your saved draft.
								</p>
								<div className="flex flex-wrap gap-2">
									<Button
										variant="ink"
										icon="check"
										onClick={finish}
										disabled={!closeOutline(points)}>
										Finish outline
									</Button>
									<Button variant="outline" onClick={() => setDrawing(false)}>
										Cancel drawing
									</Button>
								</div>
								<div className="flex flex-wrap gap-2">
									<Button
										variant="soft"
										size="sm"
										icon="undo-2"
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
										variant="soft"
										size="sm"
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
								</div>
								<details className="border-t border-rule pt-2">
									<summary className="flex min-h-touch cursor-pointer list-none items-center gap-1.5 type-small font-semibold [&::-webkit-details-marker]:hidden">
										<Icon
											name="chevron-right"
											size={16}
											className="shrink-0 transition-transform duration-(--ct-duration-quick) [[open]>summary>&]:rotate-90"
										/>
										Type coordinates instead
									</summary>
									<CoordinateEntry onAdd={add} />
								</details>
							</>
						)}
						{content.outline && !drawing && (
							<OutlineVertices
								geometry={content.outline}
								onChange={outline => onChange({ ...content, outline })}
							/>
						)}
					</div>
				</Island>
				{footer}
			</div>
		</div>
	);
}
