"use client";

import { type Dispatch, type KeyboardEvent, type PointerEvent, useEffect, useLayoutEffect, useRef } from "react";

import { usePlanCamera } from "@/components/map/MapFrame";
import { fromPlan, type PlanFrame, type PlanPoint } from "@/lib/plan";
import { type DraftZone, openLength, type Position, type RingAddress, ringAt } from "@/lib/zones/geometry";
import { nearestCandidate, type SnapCandidate, type SnapIndex } from "@/lib/zones/hints";

import { type EditorAction, eventTime, planMidpoint, pointName } from "./state";

/**
 * The selected ring's points as handles on the plan (UI plan 5.5). They are map chrome, not map data: an
 * island fill with an ink ring, themed by the plan's palette. Each has a 44 px target and a name ("Point 12
 * of 214, North meadow, outer edge"). The ring is one tab stop: only the current point takes Tab, and the
 * keys move within the ring.
 *
 * - Drag a handle to move its point; it snaps to an exact point of another zone or of the site boundary
 *   within 10 px, unless Alt (Option) is held. The drag is drawn at most once a frame, and is one step.
 * - Arrow keys move the point 10 cm, with Shift 1 m; `[` and `]`, Home and End move between points.
 * - Delete or Backspace removes the point; I inserts one after it, at the middle of the edge.
 * - Escape cancels a drag, or returns focus to the zone in the Zones list.
 * - Above about 300 points in view, the points draw as plain dots: "Zoom in to edit points, or use the
 *   points table." The current point keeps its handle, so the keys still work.
 */

/** Visible handles past this many become plain dots. */
export const DENSE_POINTS = 300;
/** Screen pixels. */
const HIT = 22;
const DOT = 7;
const SELECTED_DOT = 9;
const FOCUS = 14;
const MIDPOINT = 5;
const MIDPOINT_HIT = 12;
/** An edge shorter than this on screen has no midpoint handle. */
const MIDPOINT_MIN_EDGE = 24;
export const SNAP_PX = 10;
/** Arrow keys: 10 cm, and 1 m with Shift (WUI-8). */
const NUDGE_M = 0.1;
const NUDGE_SHIFT_M = 1;

export type RingHandlesProps = {
	zone: DraftZone;
	ring: RingAddress;
	/** The ring as drawn, without its closing repeat. */
	points: readonly PlanPoint[];
	/** The point in focus, or null with only the ring selected (the first point then takes Tab). */
	selected: number | null;
	frame: PlanFrame;
	dispatch: Dispatch<EditorAction>;
	/** Builds the snap index for a drag, leaving out the zone being moved; null with snapping off. */
	snapIndex: (zoneId: string, start: Position) => SnapIndex | null;
	/** The snap target under a drag, for its marker and its announcement. */
	onSnap: (candidate: SnapCandidate | null) => void;
	/** Escape on a handle: return focus to the zone's row. */
	onEscape: () => void;
	/** Reports whether the points are drawn as plain dots. */
	onDenseChange: (dense: boolean) => void;
	/** Moves on when focus should go to the current handle (the keys moved the selection, or a zone opened). */
	focusToken: number;
	/** True once for each token: the editor keeps what was handled, so a request survives the handles mounting. */
	claimFocus: (token: number) => boolean;
	requestFocus: () => void;
};

export function handleId(zoneId: string, { part, ring }: RingAddress, index: number): string {
	return `point-${zoneId}-${part}-${ring}-${index}`;
}

type Drag = { pointerId: number; index: number; snap: SnapIndex | null; start: Position };

export function RingHandles({
	zone,
	ring,
	points,
	selected,
	frame,
	dispatch,
	snapIndex,
	onSnap,
	onEscape,
	onDenseChange,
	focusToken,
	claimFocus,
	requestFocus
}: RingHandlesProps) {
	const camera = usePlanCamera();
	// Pointer capture lives on the ring's group, which outlives any one handle while a drag redraws them.
	const rootRef = useRef<SVGGElement>(null);
	const dragRef = useRef<Drag | null>(null);
	const pendingRef = useRef<Position | null>(null);
	const frameRequest = useRef<number | null>(null);
	const positions = ringAt(zone.geometry, ring) ?? [];
	const count = openLength(positions);
	const current = selected !== null && selected < count ? selected : 0;
	const unit = 1 / camera.pixelsPerUnit;

	const margin = HIT * unit;
	const { view } = camera;
	const visible: number[] = [];
	points.forEach(([x, y], index) => {
		if (x >= view.minX - margin && x <= view.maxX + margin && y >= view.minY - margin && y <= view.maxY + margin)
			visible.push(index);
	});
	const dense = visible.length > DENSE_POINTS;

	useEffect(() => onDenseChange(dense), [dense, onDenseChange]);

	// Focus follows a selection the keys moved, once the handle is drawn.
	useLayoutEffect(() => {
		if (!claimFocus(focusToken)) return;
		document.getElementById(handleId(zone.zone_id, ring, current))?.focus({ preventScroll: true });
	}, [focusToken, claimFocus, zone.zone_id, ring, current]);

	useEffect(
		() => () => {
			if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
		},
		[]
	);

	const address = (index: number) => ({ ...ring, index });

	function flush() {
		if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
		frameRequest.current = null;
		const position = pendingRef.current;
		pendingRef.current = null;
		if (position) dispatch({ type: "drag-move", position });
	}

	// A second finger turns the press into a pinch: the point goes back where it was, and the plan zooms.
	const { onPinchStart } = camera;
	useEffect(
		() =>
			onPinchStart(() => {
				if (!dragRef.current) return;
				dragRef.current = null;
				pendingRef.current = null;
				if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
				frameRequest.current = null;
				onSnap(null);
				dispatch({ type: "cancel-move" });
			}),
		[onPinchStart, onSnap, dispatch]
	);

	function startDrag(event: PointerEvent<SVGGElement>, index: number, insert: boolean) {
		if (event.pointerType === "mouse" && event.button !== 0) return;
		// The handle owns this press: the frame must not pan under it.
		event.stopPropagation();
		event.preventDefault();
		rootRef.current?.setPointerCapture(event.pointerId);
		const start = positions[index]!;
		if (insert) {
			const position = planMidpoint(start, positions[(index + 1) % count]!, frame);
			dispatch({ type: "begin-insert", zoneId: zone.zone_id, address: address(index), position });
			dragRef.current = {
				pointerId: event.pointerId,
				index: index + 1,
				snap: snapIndex(zone.zone_id, position),
				start: position
			};
			requestFocus();
		} else {
			dispatch({ type: "begin-move", zoneId: zone.zone_id, address: address(index) });
			dragRef.current = { pointerId: event.pointerId, index, snap: snapIndex(zone.zone_id, start), start };
			document.getElementById(handleId(zone.zone_id, ring, index))?.focus({ preventScroll: true });
		}
	}

	function moveDrag(event: PointerEvent<SVGGElement>) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		event.stopPropagation();
		const plan = camera.clientToPlan(event.clientX, event.clientY);
		if (!plan) return;
		const candidate =
			drag.snap && !event.altKey
				? nearestCandidate(
						drag.snap,
						plan,
						SNAP_PX * unit,
						entry => entry.position[0] === drag.start[0] && entry.position[1] === drag.start[1]
					)
				: null;
		onSnap(candidate);
		// A snap copies the target's exact pair; otherwise the pointer's place, at full precision.
		pendingRef.current = candidate ? candidate.position : fromPlan(plan, frame);
		frameRequest.current ??= requestAnimationFrame(() => {
			frameRequest.current = null;
			flush();
		});
	}

	function endDrag(event: PointerEvent<SVGGElement>, cancelled: boolean) {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		event.stopPropagation();
		dragRef.current = null;
		onSnap(null);
		if (cancelled) {
			pendingRef.current = null;
			flush();
			dispatch({ type: "cancel-move" });
			return;
		}
		flush();
		dispatch({ type: "end-move", at: eventTime() });
	}

	function onKeyDown(event: KeyboardEvent<SVGGElement>, index: number) {
		if (event.ctrlKey || event.metaKey) return;
		const step = event.shiftKey ? NUDGE_SHIFT_M : NUDGE_M;
		const nudge = (east: number, north: number) =>
			dispatch({ type: "nudge", zoneId: zone.zone_id, address: address(index), east, north, at: eventTime() });
		const select = (next: number) => {
			dispatch({ type: "select-point", zoneId: zone.zone_id, address: address(next) });
			requestFocus();
		};
		switch (event.key) {
			case "ArrowLeft":
				nudge(-step, 0);
				break;
			case "ArrowRight":
				nudge(step, 0);
				break;
			case "ArrowUp":
				nudge(0, step);
				break;
			case "ArrowDown":
				nudge(0, -step);
				break;
			case "[":
				select((index - 1 + count) % count);
				break;
			case "]":
				select((index + 1) % count);
				break;
			case "Home":
				select(0);
				break;
			case "End":
				select(count - 1);
				break;
			case "Delete":
			case "Backspace":
				dispatch({ type: "remove-point", zoneId: zone.zone_id, address: address(index), at: eventTime() });
				requestFocus();
				break;
			case "i":
			case "I": {
				if (event.altKey) return;
				const position = planMidpoint(positions[index]!, positions[(index + 1) % count]!, frame);
				dispatch({
					type: "insert-point",
					zoneId: zone.zone_id,
					address: address(index),
					position,
					at: eventTime()
				});
				requestFocus();
				break;
			}
			case "Escape":
				if (dragRef.current) {
					dragRef.current = null;
					pendingRef.current = null;
					onSnap(null);
					dispatch({ type: "cancel-move" });
				} else onEscape();
				break;
			case "Enter":
			case " ":
				dispatch({ type: "select-point", zoneId: zone.zone_id, address: address(index) });
				break;
			default:
				return;
		}
		event.preventDefault();
		event.stopPropagation();
	}

	const handle = (index: number) => {
		const [x, y] = points[index]!;
		const isSelected = index === selected;
		return (
			<g
				key={index}
				id={handleId(zone.zone_id, ring, index)}
				role="button"
				tabIndex={index === current ? 0 : -1}
				aria-label={pointName(zone, address(index))}
				aria-pressed={isSelected}
				data-map-keys
				transform={`translate(${x} ${y}) scale(${unit})`}
				className="group/handle cursor-move touch-none"
				// The ring below is the focus indicator; an outline would draw the group's box.
				style={{ outline: "none" }}
				onFocus={() => {
					if (!isSelected) dispatch({ type: "select-point", zoneId: zone.zone_id, address: address(index) });
					camera.showPoint([x, y]);
				}}
				onPointerDown={event => startDrag(event, index, false)}
				onKeyDown={event => onKeyDown(event, index)}>
				<circle r={HIT} fill="transparent" />
				<circle
					r={isSelected ? SELECTED_DOT : DOT}
					strokeWidth={2.5}
					className={isSelected ? "fill-ink stroke-island" : "fill-island stroke-ink"}
				/>
				<circle
					r={FOCUS}
					fill="none"
					strokeWidth={3}
					className="stroke-focus opacity-0 group-focus-visible/handle:opacity-100"
				/>
			</g>
		);
	};

	const midpoints: number[] = [];
	if (!dense) {
		for (let index = 0; index < count; index++) {
			const [ax, ay] = points[index]!;
			const [bx, by] = points[(index + 1) % count]!;
			const mx = (ax + bx) / 2;
			const my = (ay + by) / 2;
			if (Math.hypot(bx - ax, by - ay) * camera.pixelsPerUnit < MIDPOINT_MIN_EDGE) continue;
			if (mx < view.minX || mx > view.maxX || my < view.minY || my > view.maxY) continue;
			midpoints.push(index);
		}
	}

	// One keyed list, so a handle keeps its element (and its focus) as the view and the selection change.
	const shown = dense ? [current] : visible.includes(current) ? visible : [...visible, current].sort((a, b) => a - b);

	return (
		<g
			ref={rootRef}
			onPointerMove={moveDrag}
			onPointerUp={event => endDrag(event, false)}
			onPointerCancel={event => endDrag(event, true)}
			// A touch is captured by the handle it starts on; moving that capture here makes the handle report a
			// loss, which bubbles up. Only the group's own loss ends the drag.
			onLostPointerCapture={event => {
				if (event.target === rootRef.current) endDrag(event, false);
			}}>
			{/* Midpoints sit under the points, so a point always wins where their targets overlap. */}
			<g aria-hidden="true">
				{midpoints.map(index => {
					const [ax, ay] = points[index]!;
					const [bx, by] = points[(index + 1) % count]!;
					return (
						<g
							key={index}
							transform={`translate(${(ax + bx) / 2} ${(ay + by) / 2}) scale(${unit})`}
							className="cursor-copy touch-none"
							onPointerDown={event => startDrag(event, index, true)}>
							<circle r={MIDPOINT_HIT} fill="transparent" />
							<circle r={MIDPOINT} strokeWidth={1.5} className="fill-island stroke-ink" />
						</g>
					);
				})}
			</g>
			{dense && (
				<path
					aria-hidden="true"
					d={visible
						.map(index => {
							const [x, y] = points[index]!;
							const r = 2.5 * unit;
							return `M${x - r} ${y - r}h${r * 2}v${r * 2}h${-r * 2}Z`;
						})
						.join("")}
					className="fill-ink"
				/>
			)}
			{count > 0 && <g>{shown.map(handle)}</g>}
		</g>
	);
}
