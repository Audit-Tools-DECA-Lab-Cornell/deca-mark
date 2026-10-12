"use client";

import {
	type Dispatch,
	type KeyboardEvent,
	type PointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState
} from "react";

import { usePlanCamera } from "@/components/map/MapFrame";
import { MAP_PALETTES, type MapPaletteName } from "@/lib/map-palette";
import { fromPlan, type PlanFrame, type PlanPoint, toPlan } from "@/lib/plan";
import { type DraftZone, nudge, type PolygonRings, type Position, rectangleRing } from "@/lib/zones/geometry";
import { createSnapIndex, nearestCandidate, type SnapCandidate, snapCandidates } from "@/lib/zones/hints";

import { traceOption } from "./drawing";
import { SNAP_PX } from "./Handles";
import { type Drawing, type EditorAction, eventTime } from "./state";

/**
 * Drawing on the plan (UI plan 5.4, 5.5): Draw shape and Draw rectangle, by pointer, touch or keyboard.
 *
 * - Shape: click or tap to add points; click the first point, double-click, or press Enter to finish;
 *   Backspace removes the last point; Escape cancels.
 * - Rectangle: drag across the plan, or set one corner and then the other. Its sides follow longitude and
 *   latitude.
 * - Keyboard: a cross at the middle of the view. Arrows move it 10 cm, and 1 m with Shift; Space adds a
 *   point (or a corner) there; the camera follows the cross near the frame's edge.
 * - Snapping copies the exact pair of a point of any zone or the site boundary within 10 px; Alt places
 *   freely. Two points snapped to one ring can follow it ("Follow the edge", T).
 *
 * The shape being drawn stays here and in the editor's drawing state; it becomes a zone only when finished.
 */

/** Screen pixels. */
const POINT = 5;
const START_RING = 11;
const CROSS = 16;
const DRAG = 4;
/** Arrow keys move the cross 10 cm, and 1 m with Shift (WUI-8). */
const STEP_M = 0.1;
const STEP_SHIFT_M = 1;

export type DrawLayerProps = {
	drawing: Drawing;
	zones: readonly DraftZone[];
	siteBoundary: readonly PolygonRings[];
	frame: PlanFrame;
	palette: MapPaletteName;
	snap: boolean;
	dispatch: Dispatch<EditorAction>;
	/** The editor sends plain clicks on the plan here while a drawing tool is on. */
	registerClick: (handler: ((point: PlanPoint, modifiers: { altKey: boolean }) => void) | null) => void;
	/** Finishes the shape: the editor makes the new zone's identity and moves on to its name. */
	onFinish: () => void;
	/** The cross's element id: the editor moves focus to it when a drawing tool is chosen from the keyboard. */
	crossId: string;
};

const coordinate = (value: number) => value.toFixed(7).replace("-", "−");

export function DrawLayer({
	drawing,
	zones,
	siteBoundary,
	frame,
	palette: paletteName,
	snap,
	dispatch,
	registerClick,
	onFinish,
	crossId
}: DrawLayerProps) {
	const camera = usePlanCamera();
	const palette = MAP_PALETTES[paletteName];
	const unit = 1 / camera.pixelsPerUnit;
	const project = useCallback((position: Position) => toPlan(position, frame), [frame]);
	const [hover, setHover] = useState<{ plan: PlanPoint; candidate: SnapCandidate | null } | null>(null);
	const [cross, setCross] = useState<Position>(() =>
		fromPlan([(camera.view.minX + camera.view.maxX) / 2, (camera.view.minY + camera.view.maxY) / 2], frame)
	);
	const dragRef = useRef<{ pointerId: number; start: Position; startPlan: PlanPoint; moved: boolean } | null>(null);
	const [dragEnd, setDragEnd] = useState<PlanPoint | null>(null);
	const [dragStart, setDragStart] = useState<PlanPoint | null>(null);

	// Every point of every zone and of the site boundary; the drawing's own first point closes the shape.
	const index = useMemo(
		() => createSnapIndex(snapCandidates(zones, siteBoundary, project), 8),
		[zones, siteBoundary, project]
	);
	const snapAt = useCallback(
		(plan: PlanPoint, altKey: boolean) =>
			snap && !altKey ? nearestCandidate(index, plan, SNAP_PX / camera.pixelsPerUnit) : null,
		[snap, index, camera.pixelsPerUnit]
	);

	const points = drawing.points;
	const startPlan = points[0] ? project(points[0]) : null;
	const nearStart = useCallback(
		(plan: PlanPoint) =>
			drawing.tool === "shape" &&
			points.length >= 3 &&
			startPlan !== null &&
			Math.hypot(plan[0] - startPlan[0], plan[1] - startPlan[1]) * camera.pixelsPerUnit <= SNAP_PX,
		[drawing.tool, points.length, startPlan, camera.pixelsPerUnit]
	);

	const add = useCallback(
		(plan: PlanPoint, altKey: boolean) => {
			if (nearStart(plan)) {
				onFinish();
				return;
			}
			const last = points[points.length - 1];
			// The second click of a double click lands where the first did: it is not a new point.
			if (last) {
				const [lx, ly] = project(last);
				if (Math.hypot(plan[0] - lx, plan[1] - ly) * camera.pixelsPerUnit < DRAG) return;
			}
			const candidate = snapAt(plan, altKey);
			dispatch({
				type: "draw-point",
				position: candidate ? candidate.position : fromPlan(plan, frame),
				snap: candidate ? candidate.source : null,
				zoneId: crypto.randomUUID(),
				at: eventTime()
			});
		},
		[nearStart, onFinish, points, project, camera.pixelsPerUnit, snapAt, dispatch, frame]
	);

	useEffect(() => {
		registerClick(drawing.tool === "shape" ? (plan, { altKey }) => add(plan, altKey) : null);
		return () => registerClick(null);
	}, [registerClick, drawing.tool, add]);

	const crossPlan = project(cross);
	const crossCandidate = snapAt(crossPlan, false);
	const trace = traceOption(drawing, zones, siteBoundary);

	function onCrossKey(event: KeyboardEvent<SVGGElement>) {
		if (event.ctrlKey || event.metaKey) return;
		const step = event.shiftKey ? STEP_SHIFT_M : STEP_M;
		const move = (east: number, north: number) => {
			const next = nudge(cross, east, north);
			setCross(next);
			camera.showPoint(project(next));
			const snapped = snapAt(project(next), false);
			dispatch({
				type: "announce",
				text: snapped
					? "Cross on an existing point."
					: `Cross at longitude ${coordinate(next[0])}, latitude ${coordinate(next[1])}.`
			});
		};
		switch (event.key) {
			case "ArrowLeft":
				move(-step, 0);
				break;
			case "ArrowRight":
				move(step, 0);
				break;
			case "ArrowUp":
				move(0, step);
				break;
			case "ArrowDown":
				move(0, -step);
				break;
			case " ":
				if (nearStart(crossPlan)) onFinish();
				else
					dispatch({
						type: "draw-point",
						position: crossCandidate ? crossCandidate.position : cross,
						snap: crossCandidate ? crossCandidate.source : null,
						zoneId: crypto.randomUUID(),
						at: eventTime()
					});
				break;
			case "Enter":
				if (drawing.tool === "shape") onFinish();
				break;
			case "Backspace":
			case "Delete":
				dispatch({ type: "draw-back" });
				break;
			case "t":
			case "T":
				if (!trace) {
					dispatch({
						type: "announce",
						text: "There is no edge to follow: the last two points are not on one zone's edge."
					});
					break;
				}
				dispatch({
					type: "draw-trace",
					between: trace.between,
					direction: trace.direction,
					edgeName: trace.edgeName
				});
				break;
			case "Escape":
				dispatch({ type: "draw-cancel" });
				break;
			default:
				return;
		}
		event.preventDefault();
		event.stopPropagation();
	}

	/* ── Rectangles by dragging ───────────────────────────────────────── */

	function onPointerDown(event: PointerEvent<SVGRectElement>) {
		if (drawing.tool !== "rectangle" || (event.pointerType === "mouse" && event.button !== 0)) return;
		// The rectangle owns this press: the frame does not pan under it.
		event.stopPropagation();
		event.currentTarget.setPointerCapture(event.pointerId);
		const plan = camera.clientToPlan(event.clientX, event.clientY);
		if (!plan) return;
		const candidate = snapAt(plan, event.altKey);
		dragRef.current = {
			pointerId: event.pointerId,
			start: candidate ? candidate.position : fromPlan(plan, frame),
			startPlan: candidate ? candidate.plan : plan,
			moved: false
		};
		setDragStart(candidate ? candidate.plan : plan);
	}

	function onPointerMove(event: PointerEvent<SVGRectElement>) {
		const plan = camera.clientToPlan(event.clientX, event.clientY);
		if (!plan) return;
		const candidate = snapAt(plan, event.altKey);
		setHover({ plan: candidate ? candidate.plan : plan, candidate });
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		if (Math.hypot(plan[0] - drag.startPlan[0], plan[1] - drag.startPlan[1]) * camera.pixelsPerUnit >= DRAG) {
			drag.moved = true;
			setDragEnd(candidate ? candidate.plan : plan);
		}
	}

	function onPointerUp(event: PointerEvent<SVGRectElement>) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		dragRef.current = null;
		setDragEnd(null);
		setDragStart(null);
		const plan = camera.clientToPlan(event.clientX, event.clientY);
		const candidate = plan ? snapAt(plan, event.altKey) : null;
		const end = candidate ? candidate.position : plan ? fromPlan(plan, frame) : null;
		const zoneId = crypto.randomUUID();
		if (points.length === 0)
			dispatch({ type: "draw-point", position: drag.start, snap: null, zoneId, at: eventTime() });
		// A drag sets both corners; a click sets one corner, and the next click the other.
		if ((drag.moved || points.length === 1) && end)
			dispatch({
				type: "draw-point",
				position: end,
				snap: candidate ? candidate.source : null,
				zoneId,
				at: eventTime()
			});
	}

	/* ── Drawing the drawing ──────────────────────────────────────────── */

	// The next point goes where the pointer is, or else where the cross is.
	const target = dragEnd ?? hover?.plan ?? crossPlan;
	const planPoints = points.map(project);
	const rubber = drawing.tool === "shape" && target ? [...planPoints, target] : planPoints;
	const corner = drawing.tool === "rectangle" ? (dragStart ?? planPoints[0] ?? null) : null;
	const cornerEnd = drawing.tool === "rectangle" ? (dragEnd ?? (planPoints[0] ? target : null)) : null;
	const preview =
		corner && cornerEnd ? rectangleRing(fromPlan(corner, frame), fromPlan(cornerEnd, frame)).map(project) : null;
	const snapped = hover?.candidate ?? (crossCandidate && !hover ? crossCandidate : null);
	const pathOf = (list: readonly PlanPoint[]) =>
		list.length > 0 ? `M${list.map(([x, y]) => `${x} ${y}`).join("L")}` : "";

	return (
		<g>
			{/* Catches the pointer over the plan: hover feedback, and the rectangle's drag. */}
			<rect
				x={camera.view.minX}
				y={camera.view.minY}
				width={Math.max(0, camera.view.maxX - camera.view.minX)}
				height={Math.max(0, camera.view.maxY - camera.view.minY)}
				fill="transparent"
				aria-hidden="true"
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={() => {
					dragRef.current = null;
					setDragEnd(null);
					setDragStart(null);
				}}
				onPointerLeave={() => setHover(null)}
				onDoubleClick={() => {
					if (drawing.tool === "shape" && points.length >= 3) onFinish();
				}}
			/>
			<g aria-hidden="true" pointerEvents="none">
				{drawing.tool === "shape" && rubber.length > 1 && (
					<path
						d={pathOf(rubber)}
						fill="none"
						stroke={palette.zone.edge}
						strokeWidth={2.5}
						strokeDasharray="7 4.5"
						vectorEffect="non-scaling-stroke"
					/>
				)}
				{preview && (
					<path
						d={`${pathOf(preview)}Z`}
						fill={palette.zone.fill}
						fillOpacity={palette.zone.fillOpacity}
						stroke={palette.zone.edge}
						strokeWidth={2.5}
						strokeDasharray="7 4.5"
						vectorEffect="non-scaling-stroke"
					/>
				)}
				{planPoints.map(([x, y], n) => (
					<g key={n} transform={`translate(${x} ${y}) scale(${unit})`}>
						{n === 0 && drawing.tool === "shape" && points.length >= 3 && (
							<circle r={START_RING} fill="none" strokeWidth={2.5} className="stroke-ink" />
						)}
						<circle r={POINT} strokeWidth={2} className="fill-island stroke-ink" />
					</g>
				))}
				{snapped && (
					<g transform={`translate(${snapped.plan[0]} ${snapped.plan[1]}) scale(${unit})`}>
						<circle r={13} fill="none" strokeWidth={5} className="stroke-island" />
						<circle r={13} fill="none" strokeWidth={2.5} className="stroke-ink" />
					</g>
				)}
			</g>
			<g
				id={crossId}
				role="button"
				tabIndex={0}
				aria-roledescription="drawing cross"
				aria-label={`Drawing cross at longitude ${coordinate(cross[0])}, latitude ${coordinate(cross[1])}. Arrow keys move it; Space adds a ${drawing.tool === "rectangle" ? "corner" : "point"}${drawing.tool === "shape" ? "; Enter finishes" : ""}; Escape cancels.`}
				data-map-keys
				transform={`translate(${crossPlan[0]} ${crossPlan[1]}) scale(${unit})`}
				className="group/cross"
				style={{ outline: "none" }}
				onKeyDown={onCrossKey}>
				<g pointerEvents="none">
					<path d={`M${-CROSS} 0H${CROSS}M0 ${-CROSS}V${CROSS}`} strokeWidth={5} className="stroke-island" />
					<path d={`M${-CROSS} 0H${CROSS}M0 ${-CROSS}V${CROSS}`} strokeWidth={2} className="stroke-ink" />
					<circle
						r={CROSS + 5}
						fill="none"
						strokeWidth={3}
						className="stroke-focus opacity-0 group-focus-visible/cross:opacity-100"
					/>
				</g>
			</g>
		</g>
	);
}
