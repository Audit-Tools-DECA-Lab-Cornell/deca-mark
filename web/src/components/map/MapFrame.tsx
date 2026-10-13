"use client";

import {
	createContext,
	type KeyboardEvent,
	type PointerEvent,
	type ReactNode,
	type Ref,
	useCallback,
	useContext,
	useEffect,
	useId,
	useImperativeHandle,
	useMemo,
	useRef,
	useState
} from "react";

import { Checkbox } from "@/components/contour/Checkbox";
import { IconButton } from "@/components/contour/IconButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/contour/Popover";
import { Segmented } from "@/components/contour/Segmented";
import { cx } from "@/lib/cx";
import { MAP_PALETTE_ORDER, MAP_PALETTES, mapChromeTheme, type MapPaletteName, useMapPalette } from "@/lib/map-palette";
import {
	fromPlan,
	type LngLat,
	type PlanBounds,
	type PlanPoint,
	type ProjectedSite,
	scaleChip,
	toPlan
} from "@/lib/plan";

import { type PlanCamera, type PlanLayers, type PlanObservation, SitePlan, type ZonePlanStyle } from "./SitePlan";

/**
 * A site plan in its frame (System 9): the overlay label at the top left, zoom and Layers at the top right,
 * the scale chip at the bottom left. The frame zooms with the buttons, + and −, or Ctrl/⌘ and the wheel, and
 * pans by dragging or with the arrow keys once zoomed in. Selecting a marker reports its id; when the
 * selection changes to a marker out of view, the plan eases it into view. Layers switches the map palette
 * (separate from the screen theme) and turns zones, observations and trees on and off.
 *
 * In `edit` and `draw` modes the frame hosts an editing layer (the zone editor): it pans at any zoom and as
 * far as any point of the plan, zooms to 1 cm of ground per pixel, pinches with two pointers, keeps the page
 * from scrolling under a touch, and reports a plain click on the plan. Children read the camera through
 * {@link usePlanCamera}. A focused child marked `data-map-keys` owns the arrow, Delete and Escape keys, so
 * the frame does not pan while a handle has focus.
 */

/** Whether the frame only shows the plan (`pan`) or hosts an editing layer. */
export type MapMode = "pan" | "edit" | "draw";

/** What an editing layer needs from the frame's camera. */
export type PlanCameraState = {
	camera: PlanCamera;
	/** Screen pixels per plan unit at the current zoom. */
	pixelsPerUnit: number;
	/** A pointer's position on the plan, in plan units, or null before the frame has a size. */
	clientToPlan: (clientX: number, clientY: number) => PlanPoint | null;
	/** The part of the plan in view, in plan units. */
	view: PlanBounds;
	/** Eases the camera so a plan point is comfortably in view, when it is not. */
	showPoint: (point: PlanPoint) => void;
	/**
	 * Calls `cancel` when a second finger lands and the press becomes a pinch, so a layer drops the drag or
	 * the drawing gesture its first finger started (the frame zooms instead). Returns the unsubscribe.
	 */
	onPinchStart: (cancel: () => void) => () => void;
};

const PlanCameraContext = createContext<PlanCameraState | null>(null);

/** The camera of the MapFrame this layer is drawn in. */
export function usePlanCamera(): PlanCameraState {
	const value = useContext(PlanCameraContext);
	if (!value) throw new Error("usePlanCamera needs a MapFrame around it.");
	return value;
}

/** Camera moves a page can ask of its frame, through the `controller` prop. */
export type MapController = {
	/** Fits a part of the plan in view, as close as the zoom allows. */
	fitBounds: (bounds: PlanBounds) => void;
	showPoint: (point: PlanPoint) => void;
};

export type MapFrameProps = {
	site: ProjectedSite;
	/** The overlay label's first line. Defaults to "Riverside · Day plan", naming the palette on show. */
	title?: string;
	/** The overlay label's second line. Defaults to "Map v3". */
	subtitle?: ReactNode;
	/** The map package version in the scale chip, such as "v3". */
	mapVersion: string;
	/**
	 * Pins the palette, for a gallery or an example drawn in one palette. Without it the frame shows the
	 * reader's choice, which the Layers menu changes for every map on the page.
	 */
	palette?: MapPaletteName;
	zones?: Record<string, ZonePlanStyle>;
	observations?: PlanObservation[];
	selectedId?: string | null;
	onSelectObservation?: (id: string) => void;
	/** Frame height in pixels. Without it the frame keeps the plan's proportions. */
	height?: number;
	/** island: a frame on the page (r 24). panel: a frame inside an island (r 20). */
	surface?: "island" | "panel";
	/**
	 * Placement is armed: a 2 px accent border, the overlay label in accent, panning off, and a tap on the
	 * plan reports where it landed through `onPlace`.
	 */
	armed?: boolean;
	/** Replaces the overlay label's content, such as "Tap where the play happened / One tap places the point". */
	banner?: ReactNode;
	onPlace?: (position: LngLat) => void;
	/** Zoom, pan and Layers. Off draws a still frame (print, previews) with the label and the scale chip only. */
	controls?: boolean;
	/** Zone name pills; on by default. */
	showLabels?: boolean;
	className?: string;
	/** Extra layers in plan units, drawn above the plan (vertex handles, a placed point). */
	children?: ReactNode;
	/** `edit` and `draw` host an editing layer; see above. */
	mode?: MapMode;
	/** A plain click or tap on the plan in `edit` or `draw` mode, at its plan position. */
	onPlanClick?: (point: PlanPoint, modifiers: { altKey: boolean; shiftKey: boolean }) => void;
	controller?: Ref<MapController>;
	/** The screen-reader hint after the frame's name. Defaults to the zoom and pan keys. */
	keysHint?: string;
};

/** Below 1 the whole plan sits smaller in the frame, with ground around it. */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
/** While editing, the closest zoom shows this much ground per screen pixel (WUI-8): 1 cm. */
const EDIT_METRES_PER_PIXEL = 0.01;
/** Each press of +, −, or a zoom button. */
const ZOOM_STEP = 1.5;
/** How far an arrow key moves the plan, as a share of the frame. */
const PAN_STEP = 0.1;
/** Pixels a pointer moves before a press becomes a drag (and stops being a click). */
const DRAG_THRESHOLD = 4;
/** A selected marker this close to the frame's edge, in plan units, is brought into view. */
const VIEW_MARGIN = 28;
/** Zone pills and markers never draw smaller than this many pixels per plan unit (pill text ≥ 13 px). */
const MIN_LABEL_SCALE = 0.9;

const AT_REST: PlanCamera = { x: 0, y: 0, zoom: 1 };

type Size = { width: number; height: number };

/** How the plan sits in the frame: pixels per plan unit, and where plan (0, 0) lands at zoom 1. */
function layoutOf(size: Size, site: ProjectedSite) {
	const scale = Math.min(size.width / site.width, size.height / site.height);
	return {
		scale,
		offsetX: (size.width - site.width * scale) / 2,
		offsetY: (size.height - site.height * scale) / 2
	};
}

/** How far the camera may zoom and move. */
type Limits = {
	min: number;
	max: number;
	/** Pan anywhere a plan point can reach the frame's centre. */ free: boolean;
};

/**
 * Keeps the zoom in range and the plan in sight: zoomed in, the plan always covers the frame; zoomed out, it
 * always sits wholly inside it. Free limits (while editing) let any plan point reach the centre instead.
 */
function clampCamera(camera: PlanCamera, site: ProjectedSite, limits: Limits): PlanCamera {
	const zoom = Math.min(limits.max, Math.max(limits.min, camera.zoom));
	const clampAxis = (value: number, extent: number) => {
		if (limits.free) return Math.min(extent / 2, Math.max(extent / 2 - extent * zoom, value));
		const slack = extent * (1 - zoom);
		return Math.min(Math.max(0, slack), Math.max(Math.min(0, slack), value));
	};
	return { zoom, x: clampAxis(camera.x, site.width), y: clampAxis(camera.y, site.height) };
}

/** Zooms by `factor` about a point in frame units, keeping that point still. */
function zoomAbout(
	camera: PlanCamera,
	factor: number,
	[qx, qy]: PlanPoint,
	site: ProjectedSite,
	limits: Limits
): PlanCamera {
	const zoom = Math.min(limits.max, Math.max(limits.min, camera.zoom * factor));
	const ratio = zoom / camera.zoom;
	return clampCamera({ zoom, x: qx - (qx - camera.x) * ratio, y: qy - (qy - camera.y) * ratio }, site, limits);
}

/** The camera that brings a plan point into view, or null when it is already comfortably visible. */
function cameraToShow(
	camera: PlanCamera,
	[px, py]: PlanPoint,
	site: ProjectedSite,
	size: Size | null,
	limits: Limits
): PlanCamera | null {
	const layout = size ? layoutOf(size, site) : { scale: 1, offsetX: 0, offsetY: 0 };
	const minX = -layout.offsetX / layout.scale + VIEW_MARGIN;
	const minY = -layout.offsetY / layout.scale + VIEW_MARGIN;
	const maxX = site.width + layout.offsetX / layout.scale - VIEW_MARGIN;
	const maxY = site.height + layout.offsetY / layout.scale - VIEW_MARGIN;
	const sx = px * camera.zoom + camera.x;
	const sy = py * camera.zoom + camera.y;
	if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) return null;
	return clampCamera(
		{ zoom: camera.zoom, x: site.width / 2 - px * camera.zoom, y: site.height / 2 - py * camera.zoom },
		site,
		limits
	);
}

/** The camera that fits a part of the plan in the frame, centred, as close as the limits allow. */
function cameraToFit(bounds: PlanBounds, site: ProjectedSite, size: Size | null, limits: Limits): PlanCamera {
	const layout = size ? layoutOf(size, site) : { scale: 1, offsetX: 0, offsetY: 0 };
	const visibleWidth = size ? size.width / layout.scale : site.width;
	const visibleHeight = size ? size.height / layout.scale : site.height;
	const width = Math.max(bounds.maxX - bounds.minX, 1e-9);
	const height = Math.max(bounds.maxY - bounds.minY, 1e-9);
	const zoom = Math.min(
		limits.max,
		Math.max(limits.min, Math.min(visibleWidth / width, visibleHeight / height) * 0.8)
	);
	const cx = (bounds.minX + bounds.maxX) / 2;
	const cy = (bounds.minY + bounds.maxY) / 2;
	return clampCamera({ zoom, x: site.width / 2 - cx * zoom, y: site.height / 2 - cy * zoom }, site, limits);
}

type Drag = { pointerId: number; startX: number; startY: number; lastX: number; lastY: number; active: boolean };

/** Two pointers down in edit or draw mode: a pinch, measured from where it last was. */
type Pinch = { distance: number; midX: number; midY: number };

export function MapFrame({
	site,
	title,
	subtitle,
	mapVersion,
	palette: pinnedPalette,
	zones,
	observations = [],
	selectedId = null,
	onSelectObservation,
	height,
	surface = "island",
	armed = false,
	banner,
	onPlace,
	controls = true,
	showLabels = true,
	className,
	children,
	mode = "pan",
	onPlanClick,
	controller,
	keysHint
}: MapFrameProps) {
	const [chosenPalette, setPalette] = useMapPalette();
	const paletteName = pinnedPalette ?? chosenPalette;
	const palette = MAP_PALETTES[paletteName];
	// The label, buttons and scale chip sit on the map, so they follow its palette rather than the screen.
	const chromeTheme = mapChromeTheme(paletteName);
	const [camera, setCamera] = useState<PlanCamera>(AT_REST);
	// Buttons, keys and selection ease the camera; a drag or the wheel moves it directly.
	const [easing, setEasing] = useState(true);
	const [dragging, setDragging] = useState(false);
	const [layers, setLayers] = useState<PlanLayers>({ zones: true, observations: true, trees: true });
	const [size, setSize] = useState<Size | null>(null);
	const frameRef = useRef<HTMLDivElement>(null);
	const dragRef = useRef<Drag | null>(null);
	const pointersRef = useRef(new Map<number, { x: number; y: number }>());
	const pinchRef = useRef<Pinch | null>(null);
	const pinchListeners = useRef(new Set<() => void>());
	const onPinchStart = useCallback((cancel: () => void) => {
		pinchListeners.current.add(cancel);
		return () => {
			pinchListeners.current.delete(cancel);
		};
	}, []);
	const editing = mode !== "pan";
	// Placement armed, or a drawing tool on: the frame and its label turn accent, as the collector's armed map does.
	const accentFrame = armed || mode === "draw";
	const ids = useId();
	const hintId = `${ids}-hint`;

	const label = title ?? `${site.name} · ${palette.label} plan`;
	const detail = subtitle ?? `Map ${mapVersion}`;

	// While editing, the closest zoom is set by ground resolution, not by the fitted frame.
	const fitScale = size ? layoutOf(size, site).scale : 1;
	const limits = useMemo<Limits>(
		() =>
			editing
				? {
						min: MIN_ZOOM,
						max: Math.max(MAX_ZOOM, site.metresPerUnit / (fitScale * EDIT_METRES_PER_PIXEL)),
						free: true
					}
				: { min: MIN_ZOOM, max: MAX_ZOOM, free: false },
		[editing, site.metresPerUnit, fitScale]
	);

	// The frame's size decides the scale bar and how a drag maps to plan units.
	useEffect(() => {
		const frame = frameRef.current;
		if (!frame || typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
		});
		observer.observe(frame);
		return () => observer.disconnect();
	}, []);

	// When the selection changes to a marker out of view, ease it in. Adjusted during render, not in an effect,
	// so the move starts in the same paint as the new selection.
	const [shownSelection, setShownSelection] = useState(selectedId);
	if (selectedId !== shownSelection) {
		setShownSelection(selectedId);
		const target = observations.find(observation => observation.id === selectedId);
		if (target) {
			const next = cameraToShow(camera, toPlan([target.lng, target.lat], site.frame), site, size, limits);
			if (next) {
				setEasing(true);
				setCamera(next);
			}
		}
	}

	/** Brings a marker into view when it takes keyboard focus outside the visible part of the plan. */
	const showObservation = (id: string) => {
		const target = observations.find(observation => observation.id === id);
		if (!target) return;
		const point = toPlan([target.lng, target.lat], site.frame);
		setEasing(true);
		setCamera(current => cameraToShow(current, point, site, size, limits) ?? current);
	};

	const showPoint = useCallback(
		(point: PlanPoint) => {
			setEasing(true);
			setCamera(current => cameraToShow(current, point, site, size, limits) ?? current);
		},
		[site, size, limits]
	);

	useImperativeHandle(
		controller,
		() => ({
			fitBounds: bounds => {
				setEasing(true);
				setCamera(cameraToFit(bounds, site, size, limits));
			},
			showPoint
		}),
		[site, size, limits, showPoint]
	);

	/**
	 * A point on screen in frame units (the plan's units at zoom 1). Measured inside the frame's border,
	 * where the plan is drawn, so a 1 or 2 px edge never offsets it.
	 */
	const frameUnits = useCallback(
		(clientX: number, clientY: number): PlanPoint | null => {
			const frame = frameRef.current;
			if (!frame) return null;
			const rect = frame.getBoundingClientRect();
			const width = frame.clientWidth;
			const height = frame.clientHeight;
			if (width === 0 || height === 0) return null;
			const layout = layoutOf({ width, height }, site);
			return [
				(clientX - rect.left - frame.clientLeft - layout.offsetX) / layout.scale,
				(clientY - rect.top - frame.clientTop - layout.offsetY) / layout.scale
			];
		},
		[site]
	);

	const zoomBy = useCallback(
		(factor: number) => {
			setEasing(true);
			setCamera(current => zoomAbout(current, factor, [site.width / 2, site.height / 2], site, limits));
		},
		[site, limits]
	);

	// Ctrl or ⌘ with the wheel (and a trackpad pinch, which arrives the same way) zooms about the pointer. A
	// plain wheel scrolls the page. React's wheel listener is passive, so this one is attached by hand.
	useEffect(() => {
		const frame = frameRef.current;
		if (!frame || !controls) return;
		const onWheel = (event: WheelEvent) => {
			if (!event.ctrlKey && !event.metaKey) return;
			event.preventDefault();
			const point = frameUnits(event.clientX, event.clientY);
			if (!point) return;
			const factor = Math.exp(-event.deltaY * 0.0025);
			setEasing(false);
			setCamera(current => zoomAbout(current, factor, point, site, limits));
		};
		frame.addEventListener("wheel", onWheel, { passive: false });
		return () => frame.removeEventListener("wheel", onWheel);
	}, [controls, frameUnits, site, limits]);

	// Drags and pinches move the camera at most once a frame.
	const pendingRef = useRef<{ dx: number; dy: number; factor: number; about: PlanPoint | null } | null>(null);
	const frameRequest = useRef<number | null>(null);
	const scheduleCamera = (dx: number, dy: number, factor = 1, about: PlanPoint | null = null) => {
		const pending = pendingRef.current ?? { dx: 0, dy: 0, factor: 1, about: null };
		pendingRef.current = {
			dx: pending.dx + dx,
			dy: pending.dy + dy,
			factor: pending.factor * factor,
			about: about ?? pending.about
		};
		if (frameRequest.current !== null) return;
		frameRequest.current = requestAnimationFrame(() => {
			frameRequest.current = null;
			const move = pendingRef.current;
			pendingRef.current = null;
			if (!move) return;
			setCamera(current => {
				const moved = clampCamera({ ...current, x: current.x + move.dx, y: current.y + move.dy }, site, limits);
				return move.factor !== 1 && move.about
					? zoomAbout(moved, move.factor, move.about, site, limits)
					: moved;
			});
		});
	};
	useEffect(
		() => () => {
			if (frameRequest.current !== null) cancelAnimationFrame(frameRequest.current);
		},
		[]
	);

	const canPan = controls && !armed && (editing || camera.zoom > 1);

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		// Keys typed in the Layers menu reach here through the React tree; only the frame's own keys count.
		if (!controls || !event.currentTarget.contains(event.target as Node)) return;
		// A handle or cross that owns its keys: the arrows move it, not the plan.
		if ((event.target as Element).closest("[data-map-keys]")) return;
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		const panX = site.width * PAN_STEP;
		const panY = site.height * PAN_STEP;
		const pan = (dx: number, dy: number) => {
			setEasing(true);
			setCamera(current => clampCamera({ ...current, x: current.x + dx, y: current.y + dy }, site, limits));
		};
		// With nowhere to pan, an arrow key returns before preventDefault and scrolls the page as usual.
		if (event.key.startsWith("Arrow") && !canPan) return;
		switch (event.key) {
			case "+":
			case "=":
				zoomBy(ZOOM_STEP);
				break;
			case "-":
			case "_":
				zoomBy(1 / ZOOM_STEP);
				break;
			case "ArrowLeft":
				pan(panX, 0);
				break;
			case "ArrowRight":
				pan(-panX, 0);
				break;
			case "ArrowUp":
				pan(0, panY);
				break;
			case "ArrowDown":
				pan(0, -panY);
				break;
			default:
				return;
		}
		event.preventDefault();
	};

	/*
	 * Fingers in edit and draw modes are counted on the way down to the layers (the capture phase), because a
	 * handle or a drawing tool keeps its own presses from bubbling here. A second finger turns the press into
	 * a pinch: the layers drop what the first finger started, and neither finger reaches them until the pinch
	 * ends, so a pinch never moves a point or draws a shape.
	 */
	const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
		if (!editing || !controls || !event.currentTarget.contains(event.target as Node)) return;
		if ((event.target as Element).closest("[data-map-overlay]")) return;
		// The first pointer of its kind: any still counted lost their release (outside the window, say).
		if (event.isPrimary) pointersRef.current.clear();
		pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointersRef.current.size < 2) return;
		event.stopPropagation();
		// A third finger joins the pinch without changing it.
		if (pinchRef.current) return;
		const [a, b] = [...pointersRef.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
		pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), midX: (a.x + b.x) / 2, midY: (a.y + b.y) / 2 };
		dragRef.current = null;
		for (const cancel of pinchListeners.current) cancel();
		event.currentTarget.setPointerCapture(event.pointerId);
		setEasing(false);
		setDragging(true);
	};

	const onPointerMoveCapture = (event: PointerEvent<HTMLDivElement>) => {
		if (!editing || !pointersRef.current.has(event.pointerId)) return;
		pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
		const pinch = pinchRef.current;
		if (!pinch) return;
		event.stopPropagation();
		if (pointersRef.current.size < 2) return;
		const [a, b] = [...pointersRef.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
		const distance = Math.hypot(a.x - b.x, a.y - b.y);
		const midX = (a.x + b.x) / 2;
		const midY = (a.y + b.y) / 2;
		const scale = size ? layoutOf(size, site).scale : 1;
		scheduleCamera(
			(midX - pinch.midX) / scale,
			(midY - pinch.midY) / scale,
			pinch.distance > 0 ? distance / pinch.distance : 1,
			frameUnits(midX, midY)
		);
		pinchRef.current = { distance, midX, midY };
	};

	const onPointerEndCapture = (event: PointerEvent<HTMLDivElement>) => {
		if (!editing || !pointersRef.current.delete(event.pointerId) || !pinchRef.current) return;
		// A pinch's fingers lifting end the pinch: not a drag, a click or a drawn point.
		event.stopPropagation();
		if (pointersRef.current.size < 2) {
			pinchRef.current = null;
			setDragging(false);
		}
	};

	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		// Presses in the Layers menu reach here through the React tree from its portal: they are not the plan's.
		if (!controls || !event.currentTarget.contains(event.target as Node)) return;
		// The overlay controls handle their own presses.
		if ((event.target as Element).closest("[data-map-overlay]")) return;
		if (event.button !== 0) return;
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			lastX: event.clientX,
			lastY: event.clientY,
			active: false
		};
	};

	const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId || !canPan) return;
		if (!drag.active) {
			if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
			// Capture only once this is a drag, so a plain press still clicks the marker under it.
			drag.active = true;
			event.currentTarget.setPointerCapture(event.pointerId);
			setDragging(true);
			setEasing(false);
		}
		const scale = size ? layoutOf(size, site).scale : 1;
		const dx = (event.clientX - drag.lastX) / scale;
		const dy = (event.clientY - drag.lastY) / scale;
		drag.lastX = event.clientX;
		drag.lastY = event.clientY;
		if (editing) scheduleCamera(dx, dy);
		else setCamera(current => clampCamera({ ...current, x: current.x + dx, y: current.y + dy }, site, limits));
	};

	const endDrag = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		dragRef.current = null;
		if (drag.active) {
			setDragging(false);
			return;
		}
		if (cancelled) return;
		const point = frameUnits(event.clientX, event.clientY);
		if (!point) return;
		const onPlan: PlanPoint = [(point[0] - camera.x) / camera.zoom, (point[1] - camera.y) / camera.zoom];
		if (armed && onPlace) onPlace(fromPlan(onPlan, site.frame));
		else if (editing && onPlanClick) onPlanClick(onPlan, { altKey: event.altKey, shiftKey: event.shiftKey });
	};

	const layout = size ? layoutOf(size, site) : null;
	const scale = scaleChip(
		layout ? layout.scale * site.width : site.width,
		site.width * site.metresPerUnit,
		camera.zoom
	);

	const labelScale = layout ? Math.max(1, MIN_LABEL_SCALE / layout.scale) : 1;

	const cameraState = useMemo<PlanCameraState>(() => {
		const scale = layout?.scale ?? 1;
		const toPlanUnits = (fx: number, fy: number): PlanPoint => [
			(fx - camera.x) / camera.zoom,
			(fy - camera.y) / camera.zoom
		];
		const [minX, minY] = toPlanUnits(-(layout?.offsetX ?? 0) / scale, -(layout?.offsetY ?? 0) / scale);
		const [maxX, maxY] = toPlanUnits(
			((size?.width ?? site.width) - (layout?.offsetX ?? 0)) / scale,
			((size?.height ?? site.height) - (layout?.offsetY ?? 0)) / scale
		);
		return {
			camera,
			pixelsPerUnit: scale * camera.zoom,
			clientToPlan: (clientX, clientY) => {
				const point = frameUnits(clientX, clientY);
				return point ? toPlanUnits(point[0], point[1]) : null;
			},
			view: { minX, minY, maxX, maxY },
			showPoint,
			onPinchStart
		};
	}, [
		camera,
		layout?.scale,
		layout?.offsetX,
		layout?.offsetY,
		size,
		site.width,
		site.height,
		frameUnits,
		showPoint,
		onPinchStart
	]);

	const shownObservations = observations.map(observation => ({
		...observation,
		selected: observation.id === selectedId
	}));

	const setLayer = (key: keyof PlanLayers) => (checked: boolean) =>
		setLayers(current => ({ ...current, [key]: checked }));

	return (
		<div
			ref={frameRef}
			role={controls ? "group" : undefined}
			aria-roledescription={controls ? "map" : undefined}
			aria-label={controls ? label : undefined}
			aria-describedby={controls ? hintId : undefined}
			tabIndex={controls ? 0 : undefined}
			onKeyDown={onKeyDown}
			onPointerDownCapture={onPointerDownCapture}
			onPointerMoveCapture={onPointerMoveCapture}
			onPointerUpCapture={onPointerEndCapture}
			onPointerCancelCapture={onPointerEndCapture}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={event => endDrag(event, false)}
			onPointerCancel={event => endDrag(event, true)}
			className={cx(
				"@container relative isolate overflow-hidden",
				surface === "island" ? "rounded-island" : "rounded-panel",
				accentFrame ? "border-2 border-accent" : "border border-line",
				canPan && (dragging ? "cursor-grabbing touch-none" : "cursor-grab touch-none"),
				// While editing nothing under the map scrolls, zooms or opens a callout on a long press.
				editing && !canPan && "touch-none",
				editing && "[-webkit-touch-callout:none]",
				mode === "draw" && "cursor-crosshair",
				armed && onPlace && "cursor-crosshair",
				className
			)}
			style={{
				backgroundColor: palette.background,
				...(height ? { height } : { aspectRatio: `${site.width} / ${site.height}` })
			}}>
			<SitePlan
				site={site}
				palette={paletteName}
				zones={zones}
				observations={shownObservations}
				showLabels={showLabels}
				layers={layers}
				title={label}
				className="absolute inset-0 size-full"
				camera={camera}
				pixelsPerUnit={layout ? layout.scale * camera.zoom : undefined}
				animateCamera={easing && !dragging}
				labelScale={labelScale}
				onSelectObservation={controls ? onSelectObservation : undefined}
				onFocusObservation={controls ? showObservation : undefined}
				interactiveChildren={editing}>
				<PlanCameraContext.Provider value={cameraState}>{children}</PlanCameraContext.Provider>
			</SitePlan>

			{/* The label and the controls share one row, so a narrow frame wraps the label rather than overlapping. */}
			<div
				data-theme={chromeTheme}
				className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-3">
				<div
					data-map-overlay
					className={cx(
						"pointer-events-auto min-w-0 max-w-80 rounded-thumb border px-4 py-2 shadow-ledge",
						accentFrame ? "border-accent bg-accent text-on-accent" : "border-line bg-island text-ink"
					)}>
					{banner ?? (
						<>
							<p className="type-small font-semibold">{label}</p>
							{/* A phone-width frame keeps only the first line, so the plan stays visible. */}
							<p
								className={cx(
									"type-small @max-sm:hidden",
									accentFrame ? "text-on-accent" : "text-ink-2"
								)}>
								{detail}
							</p>
						</>
					)}
				</div>

				{controls && (
					<div data-map-overlay className="pointer-events-auto flex shrink-0 gap-2">
						<IconButton
							icon="plus"
							label="Zoom in"
							variant="map"
							className="shadow-ledge"
							disabled={camera.zoom >= limits.max}
							onClick={() => zoomBy(ZOOM_STEP)}
						/>
						<IconButton
							icon="minus"
							label="Zoom out"
							variant="map"
							className="shadow-ledge"
							disabled={camera.zoom <= limits.min}
							onClick={() => zoomBy(1 / ZOOM_STEP)}
						/>
						<Popover>
							<PopoverTrigger asChild>
								<IconButton
									icon="layers"
									label="Map layers"
									variant="map"
									active
									className="shadow-ledge"
								/>
							</PopoverTrigger>
							{/* Portalled to the page, so the menu takes the screen theme like any other menu. */}
							<PopoverContent align="end" className="w-72">
								<LayersMenu
									idPrefix={ids}
									palette={pinnedPalette ? undefined : paletteName}
									onPaletteChange={setPalette}
									layers={layers}
									onLayerChange={setLayer}
								/>
							</PopoverContent>
						</Popover>
					</div>
				)}
			</div>

			<div
				data-map-overlay
				data-theme={chromeTheme}
				className="absolute bottom-3 left-3 inline-flex items-center gap-4 rounded-pill border border-line bg-island px-4 py-1.5 text-ink shadow-ledge">
				<span className="flex flex-col items-center gap-0.5" aria-hidden="true">
					<span className="type-mono-data">{scale.label}</span>
					<span className="block h-0.5 bg-ink" style={{ width: scale.px }} />
				</span>
				<span className="type-mono-data" aria-hidden="true">
					Map {mapVersion} · north ↑
				</span>
				<span className="sr-only">
					Scale bar {scale.label}. Map {mapVersion}. North is up.
				</span>
			</div>

			{controls && (
				<p id={hintId} className="sr-only">
					{keysHint ??
						"Zoom with plus and minus, or Control and the mouse wheel. Once zoomed in, drag or use the arrow keys to move the plan."}
				</p>
			)}
		</div>
	);
}

/** The Layers menu: the map palette (its own setting, separate from the screen theme) and the layer toggles. */
function LayersMenu({
	idPrefix,
	palette,
	onPaletteChange,
	layers,
	onLayerChange
}: {
	idPrefix: string;
	/** The palette choice; left out when the frame's palette is pinned. */
	palette: MapPaletteName | undefined;
	onPaletteChange: (name: MapPaletteName) => void;
	layers: PlanLayers;
	onLayerChange: (key: keyof PlanLayers) => (checked: boolean) => void;
}) {
	return (
		<div className="flex flex-col gap-4">
			{palette && (
				<div className="flex flex-col gap-2 border-b border-rule pb-4">
					<p className="type-mono-label text-ink-2">Map palette</p>
					<Segmented
						label="Map palette"
						value={palette}
						onValueChange={value => onPaletteChange(value as MapPaletteName)}
						options={MAP_PALETTE_ORDER.map(name => ({ value: name, label: MAP_PALETTES[name].label }))}
						fullWidth
					/>
					<p className="type-small text-ink-2">Separate from the screen theme.</p>
				</div>
			)}
			<div className="flex flex-col gap-1">
				<p className="type-mono-label text-ink-2">Layers</p>
				<Checkbox
					id={`${idPrefix}-zones`}
					checked={layers.zones}
					onCheckedChange={onLayerChange("zones")}
					className="py-2">
					Zones
				</Checkbox>
				<Checkbox
					id={`${idPrefix}-observations`}
					checked={layers.observations}
					onCheckedChange={onLayerChange("observations")}
					className="py-2">
					Observations
				</Checkbox>
				<Checkbox
					id={`${idPrefix}-trees`}
					checked={layers.trees}
					onCheckedChange={onLayerChange("trees")}
					className="py-2">
					Trees
				</Checkbox>
			</div>
		</div>
	);
}
