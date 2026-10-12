"use client";

import {
	type Dispatch,
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useReducer,
	useRef,
	useState
} from "react";

import { Button } from "@/components/contour/Button";
import { Island } from "@/components/contour/Island";
import { Kbd } from "@/components/contour/Kbd";
import { Segmented } from "@/components/contour/Segmented";
import { type MapController, MapFrame } from "@/components/map/MapFrame";
import type { ZonePlanStyle } from "@/components/map/SitePlan";
import { type MapPaletteName, useMapPalette } from "@/lib/map-palette";
import { type PlanPoint, pointInParts, type ProjectedSite, toPlan, zoneBounds } from "@/lib/plan";
import { type DraftZone, partsOf, type PolygonRings, type Position, ringAt, vertexAt } from "@/lib/zones/geometry";
import { createSnapIndex, type SnapCandidate, snapCandidates } from "@/lib/zones/hints";

import { traceOption } from "./drawing";
import { DrawLayer } from "./DrawLayer";
import { EditorLayer, ProblemPills, SnapMarker } from "./EditorCanvas";
import { RingHandles } from "./Handles";
import { PointsTable } from "./PointsTable";
import { type EditorProblem, editorProblems } from "./problems";
import { ProblemsIsland } from "./ProblemsIsland";
import { planZone } from "./projection";
import {
	createEditorState,
	type EditorAction,
	editorReducer,
	eventTime,
	ringName,
	type Tool,
	zoneChange,
	zoneName
} from "./state";
import { Toolbar } from "./Toolbar";
import { ZoneList, zoneRowId } from "./ZoneList";
import { ZoneProperties } from "./ZoneProperties";

/**
 * The zone editor (UI plan 5.3–5.6): the plan with the draft's zones, a toolbar, and the Zones, Selected
 * zone, Points and Problems islands. It edits zones in memory; it never saves or sends anything by itself.
 * Whoever renders it decides what happens to the zones it reports through `onZonesChange`.
 *
 * Longitude and latitude stay the only source of truth: the plan's projection draws the zones, and is used
 * backwards only for a point the manager moves or adds.
 */

export type ZoneEditorProps = {
	/** The base map version's plan. Its own zones are not drawn; the draft's are. */
	site: ProjectedSite;
	/** The site boundary's polygons, in longitude and latitude, for snapping and the outside-site hint. */
	siteBoundary: readonly PolygonRings[];
	zones: readonly DraftZone[];
	/** The base version's zones, for "New", "Changed" and "Unchanged". Defaults to `zones`. */
	baseZones?: readonly DraftZone[];
	/** The base version's name, such as "v1". */
	baseVersion: string;
	mapTitle: string;
	mapSubtitle: string;
	palette?: MapPaletteName;
	onZonesChange?: (zones: readonly DraftZone[]) => void;
	/** Content above the islands, such as a note about what the page is. */
	children?: ReactNode;
};

const TYPING = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

export const EDITOR_KEYS_HINT =
	"Select a zone, then press Tab to reach its points. Arrow keys move a point 10 centimetres, or 1 metre with Shift. Square brackets move between points, Home and End to the first and last. Delete removes a point and I adds one after it. Escape returns to the Zones list. P draws a shape and R a rectangle at a cross that the arrow keys move: Space adds a point, Enter finishes, T follows an edge, Escape cancels; V returns to selecting. With the plan itself in focus, plus and minus zoom and the arrow keys move the plan.";

/** The keys of the plan, for sighted keyboard users; screen readers hear them in the frame's hint. */
const KEYS: readonly (readonly [keys: readonly string[], what: string])[] = [
	[["Tab"], "From the plan to the selected zone's current point"],
	[["←", "↑", "→", "↓"], "Move the point 10 cm; with Shift, 1 m"],
	[["[", "]"], "Previous and next point; Home and End for the first and last"],
	[["Delete"], "Remove the point; a ring keeps three"],
	[["I"], "Add a point after it, at the middle of the edge"],
	[["Esc"], "Back to the zone in the Zones list"],
	[["Ctrl", "Z"], "Undo; with Shift, redo (⌘ on a Mac)"],
	[["+", "−"], "Zoom, with the plan itself in focus"],
	[["V"], "Select"],
	[["P"], "Draw a shape at the cross: Space adds a point, Enter finishes, Backspace removes the last"],
	[["R"], "Draw a rectangle at the cross: Space sets each corner"],
	[["T"], "While drawing, follow the edge between the last two points; again for the other way round"]
];

const TOOL_OPTIONS = [
	{ value: "select", label: "Select" },
	{ value: "shape", label: "Draw shape" },
	{ value: "rectangle", label: "Draw rectangle" }
] as const;

const DRAW_BANNER: Record<"shape" | "rectangle", [title: string, detail: string]> = {
	shape: ["Draw shape", "Click to add points. Click the first point, or press Enter, to finish."],
	rectangle: ["Draw rectangle", "Drag across the plan, or click one corner and then the other."]
};

function EditorKeys() {
	return (
		<details className="type-small text-ink-2">
			<summary className="flex min-h-touch cursor-pointer items-center type-body font-semibold text-ink">
				Keys on the plan
			</summary>
			<dl className="grid gap-x-4 gap-y-2 pb-2 sm:grid-cols-[max-content_1fr]">
				{KEYS.map(([keys, what]) => (
					<div key={what} className="contents">
						<dt className="flex flex-wrap gap-1">
							{keys.map(key => (
								<Kbd key={key}>{key}</Kbd>
							))}
						</dt>
						<dd>{what}</dd>
					</div>
				))}
			</dl>
		</details>
	);
}

/** Remove a hole or a part (UI plan 5.4). The zone keeps its identity; undo brings either back. */
function ShapeActions({ zone, dispatch }: { zone: DraftZone; dispatch: Dispatch<EditorAction> }) {
	const parts = partsOf(zone.geometry);
	const holes = parts.flatMap((rings, part) => rings.slice(1).map((_, index) => ({ part, ring: index + 1 })));
	if (holes.length === 0 && parts.length < 2) return null;
	return (
		<div className="flex flex-wrap gap-2">
			{holes.map(address => {
				const name = ringName(zone, address);
				return (
					<Button
						key={`${address.part}:${address.ring}`}
						variant="outline"
						size="sm"
						icon="minus"
						onClick={() =>
							dispatch({ type: "remove-hole", zoneId: zone.zone_id, ring: address, at: eventTime() })
						}>
						{`Remove ${name}`}
					</Button>
				);
			})}
			{parts.length > 1 &&
				parts.map((_, part) => (
					<Button
						key={part}
						variant="outline"
						size="sm"
						icon="minus"
						onClick={() => dispatch({ type: "remove-part", zoneId: zone.zone_id, part, at: eventTime() })}>
						{`Remove part ${part + 1}`}
					</Button>
				))}
			<p className="w-full type-small text-ink-2">{`${zoneName(zone)[0]!.toUpperCase()}${zoneName(zone).slice(1)} stays the same zone.`}</p>
		</div>
	);
}

export function ZoneEditor({
	site,
	siteBoundary,
	zones: initialZones,
	baseZones,
	baseVersion,
	mapTitle,
	mapSubtitle,
	palette,
	onZonesChange,
	children
}: ZoneEditorProps) {
	const [state, dispatch] = useReducer(editorReducer, undefined, () =>
		createEditorState(initialZones, baseZones ?? initialZones)
	);
	const mapRef = useRef<MapController>(null);
	// Focus requests for the handles: a handle takes focus when the token moves past the last one handled,
	// even if the ring's handles mount in the same render (opening a zone from the list).
	const [focusToken, setFocusToken] = useState(0);
	const focusHandled = useRef(0);
	const requestFocus = useCallback(() => setFocusToken(token => token + 1), []);
	const claimFocus = useCallback((token: number) => {
		if (focusHandled.current === token) return false;
		focusHandled.current = token;
		return true;
	}, []);
	const [dense, setDense] = useState(false);
	const [snapTarget, setSnapTarget] = useState<SnapCandidate | null>(null);
	const frame = site.frame;
	const [chosenPalette] = useMapPalette();
	const paletteName = palette ?? chosenPalette;
	const drawClick = useRef<((point: PlanPoint, modifiers: { altKey: boolean }) => void) | null>(null);
	const registerDrawClick = useCallback(
		(handler: ((point: PlanPoint, modifiers: { altKey: boolean }) => void) | null) => {
			drawClick.current = handler;
		},
		[]
	);
	const crossId = `${useId()}-cross`;
	const nameId = `${useId()}-zone-name`;
	const [crossToken, setCrossToken] = useState(0);
	const drawing = state.drawing;
	const trace = traceOption(drawing, state.zones, siteBoundary);

	useEffect(() => {
		onZonesChange?.(state.zones);
	}, [state.zones, onZonesChange]);

	/* ── Drawing the draft ─────────────────────────────────────────────── */

	const { gesture, selection } = state;
	const dragFrom = gesture ? gesture.before.find(zone => zone.zone_id === gesture.zoneId)?.geometry : undefined;
	const plan = useMemo<ProjectedSite>(
		() => ({
			...site,
			zones: state.zones.map(zone =>
				planZone(zone, frame, gesture && zone.zone_id === gesture.zoneId ? dragFrom : undefined)
			)
		}),
		[site, frame, state.zones, gesture, dragFrom]
	);
	const selectedZone = selection ? (state.zones.find(zone => zone.zone_id === selection.zoneId) ?? null) : null;
	const selectedPlanZone = selectedZone ? plan.zones.find(zone => zone.id === selectedZone.zone_id) : undefined;
	const zoneStyles = useMemo<Record<string, ZonePlanStyle>>(
		() =>
			Object.fromEntries(
				plan.zones.map(zone => [
					zone.id,
					selection
						? zone.id === selection.zoneId
							? { hatched: true, emphasis: "focus" }
							: { emphasis: "dim" }
						: {}
				])
			),
		[plan.zones, selection]
	);

	/* ── Problems: checked on settled zones, not on every frame of a drag ── */

	const settled = gesture ? gesture.before : state.zones;
	const problems = useMemo(() => editorProblems(settled, siteBoundary), [settled, siteBoundary]);
	const problemCounts = useMemo(() => {
		const counts = new Map<string, number>();
		for (const problem of problems)
			if (problem.zoneId) counts.set(problem.zoneId, (counts.get(problem.zoneId) ?? 0) + 1);
		return counts;
	}, [problems]);
	const pills = useMemo(
		() =>
			problems.flatMap(problem => {
				const zone = plan.zones.find(entry => entry.id === problem.zoneId);
				if (!zone) return [];
				const position = problem.address ? vertexAt(zone.geometry, problem.address) : undefined;
				return [{ number: problem.number, at: position ? toPlan(position, frame) : zone.labelAnchor }];
			}),
		[problems, plan.zones, frame]
	);
	const changes = useMemo(
		() => new Map(state.zones.map(zone => [zone.zone_id, zoneChange(zone, state.base)])),
		[state.zones, state.base]
	);

	/* ── Snapping ──────────────────────────────────────────────────────── */

	const snapIndex = useCallback(
		(zoneId: string, start: Position) => {
			if (!state.settings.snap) return null;
			const others = state.zones.filter(zone => zone.zone_id !== zoneId);
			const candidates = snapCandidates(others, siteBoundary, position => toPlan(position, frame)).filter(
				candidate => candidate.position[0] !== start[0] || candidate.position[1] !== start[1]
			);
			// Cells of 8 plan units: a handful per snap radius at any working zoom.
			return createSnapIndex(candidates, 8);
		},
		[state.settings.snap, state.zones, siteBoundary, frame]
	);

	/* ── Actions ───────────────────────────────────────────────────────── */

	const focusZoneRow = useCallback((zoneId: string) => document.getElementById(zoneRowId(zoneId))?.focus(), []);

	const fitZone = useCallback(
		(zoneId: string) => {
			const zone = plan.zones.find(entry => entry.id === zoneId);
			if (zone) mapRef.current?.fitBounds(zoneBounds(zone));
		},
		[plan.zones]
	);

	const showProblem = (problem: EditorProblem) => {
		if (!problem.zoneId) return;
		if (problem.address) {
			dispatch({ type: "select-point", zoneId: problem.zoneId, address: problem.address });
			const zone = state.zones.find(entry => entry.zone_id === problem.zoneId);
			const position = zone && vertexAt(zone.geometry, problem.address);
			if (position) mapRef.current?.showPoint(toPlan(position, frame));
			requestFocus();
		} else {
			dispatch({ type: "select-zone", zoneId: problem.zoneId });
			fitZone(problem.zoneId);
		}
	};

	const openZone = (zoneId: string) => {
		dispatch({ type: "select-zone", zoneId });
		fitZone(zoneId);
		requestFocus();
	};

	const onPlanClick = (point: PlanPoint, modifiers: { altKey: boolean }) => {
		if (state.tool !== "select") {
			drawClick.current?.(point, modifiers);
			return;
		}
		// The zone drawn last is on top, so it is the one a click picks.
		const hit = [...plan.zones].reverse().find(zone => pointInParts(point, zone.parts));
		dispatch({ type: "select-zone", zoneId: hit ? hit.id : null });
	};

	const selectedIndex = selection?.index ?? null;
	const removable = selectedZone && selection && selectedIndex !== null;

	/** A drawing tool chosen from the keyboard (or "Add a zone") puts focus on the cross. */
	const chooseTool = (tool: Tool, focusCross: boolean) => {
		dispatch({ type: "set-tool", tool });
		if (focusCross && tool !== "select") setCrossToken(token => token + 1);
	};

	// After the render that mounts the drawing layer, so the cross exists to take focus.
	useEffect(() => {
		if (crossToken > 0) document.getElementById(crossId)?.focus({ preventScroll: true });
	}, [crossToken, crossId]);

	const finishDrawing = () => dispatch({ type: "draw-finish", zoneId: crypto.randomUUID(), at: eventTime() });

	// A zone just drawn has no name yet: focus goes to its Name field.
	const lastStep = state.history.past[state.history.past.length - 1];
	const named = useRef<string | null>(null);
	useEffect(() => {
		const zoneId = selection?.zoneId;
		if (!zoneId || !lastStep?.label.startsWith("drew zone") || named.current === zoneId) return;
		if (!lastStep.after.some(zone => zone.zone_id === zoneId)) return;
		named.current = zoneId;
		document.getElementById(nameId)?.focus();
	}, [selection?.zoneId, lastStep, nameId]);

	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if ((event.target as HTMLElement).closest(TYPING)) return;
		const mod = event.metaKey || event.ctrlKey;
		const key = event.key.toLowerCase();
		if (mod && key === "z") {
			event.preventDefault();
			// While drawing, undo takes back the last point before anything already done.
			if (!event.shiftKey && drawing && drawing.points.length > 0) dispatch({ type: "draw-back" });
			else dispatch({ type: event.shiftKey ? "redo" : "undo" });
		} else if (event.ctrlKey && key === "y") {
			event.preventDefault();
			dispatch({ type: "redo" });
		} else if (!mod && !event.altKey && (key === "v" || key === "p" || key === "r")) {
			event.preventDefault();
			chooseTool(key === "v" ? "select" : key === "p" ? "shape" : "rectangle", true);
		}
	};

	const canUndo = state.history.past.length > 0;
	const canRedo = state.history.future.length > 0;
	const ring = selection && selectedZone ? ringAt(selectedZone.geometry, selection.ring) : undefined;
	const ringPoints =
		selection && selectedPlanZone ? selectedPlanZone.parts[selection.ring.part]?.[selection.ring.ring] : undefined;

	const announcement = state.announcement;

	return (
		<div className="flex flex-col gap-6" onKeyDown={onKeyDown}>
			{children}
			{/* Every step is announced politely: undo and redo, moves, refusals and their reasons. */}
			<p role="status" aria-live="polite" className="sr-only">
				{announcement ? `${announcement.text}${announcement.id % 2 ? "" : "​"}` : ""}
			</p>
			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
				<Island title="Plan" headingLevel={2} className="min-w-0">
					<div className="flex flex-col gap-4">
						<Toolbar
							tools={
								<Segmented
									label="Tool"
									value={state.tool}
									onValueChange={value => chooseTool(value as Tool, false)}
									options={TOOL_OPTIONS.map(option => ({ ...option }))}
								/>
							}
							actions={[
								{
									label: "Undo",
									icon: "undo-2",
									keys: "Control+Z",
									onPress: () => dispatch({ type: "undo" }),
									unavailable: canUndo ? null : "Undo turns on after a change."
								},
								{
									label: "Redo",
									keys: "Control+Shift+Z",
									onPress: () => dispatch({ type: "redo" }),
									unavailable: canRedo ? null : "Redo turns on after an undo."
								},
								...(drawing
									? [
											...(drawing.tool === "shape"
												? [
														{
															label: "Finish shape",
															icon: "check" as const,
															keys: "Enter",
															onPress: finishDrawing,
															unavailable:
																drawing.points.length >= 3
																	? null
																	: "Finish shape needs three points."
														}
													]
												: []),
											{
												label: "Remove last point",
												keys: "Backspace",
												onPress: () => dispatch({ type: "draw-back" }),
												unavailable:
													drawing.points.length > 0
														? null
														: "Remove last point needs a point."
											},
											...(drawing.tool === "shape"
												? [
														{
															label: trace
																? `Follow the edge of ${trace.edgeName}`
																: "Follow the edge",
															keys: "T",
															onPress: () =>
																trace &&
																dispatch({
																	type: "draw-trace",
																	between: trace.between,
																	direction: trace.direction,
																	edgeName: trace.edgeName
																}),
															unavailable: trace
																? null
																: "Follow the edge needs the last two points on one zone's edge or the site boundary."
														}
													]
												: []),
											{
												label: "Cancel drawing",
												icon: "x" as const,
												keys: "Escape",
												onPress: () => dispatch({ type: "draw-cancel" }),
												unavailable: null
											}
										]
									: [
											{
												label: "Fit zone",
												icon: "maximize" as const,
												onPress: () => selectedZone && fitZone(selectedZone.zone_id),
												unavailable: selectedZone ? null : "Fit zone needs a selected zone."
											},
											{
												label: "Remove point",
												icon: "minus" as const,
												keys: "Delete",
												onPress: () => {
													if (!removable) return;
													dispatch({
														type: "remove-point",
														zoneId: selectedZone.zone_id,
														address: { ...selection.ring, index: selectedIndex },
														at: eventTime()
													});
												},
												unavailable: removable ? null : "Remove point needs a selected point."
											}
										])
							]}
							snap={state.settings.snap}
							onSnapChange={value => dispatch({ type: "set-setting", key: "snap", value })}
							moveShared={state.settings.moveShared}
							onMoveSharedChange={value => dispatch({ type: "set-setting", key: "moveShared", value })}
						/>
						<MapFrame
							site={plan}
							mode={state.tool === "select" ? "edit" : "draw"}
							surface="panel"
							palette={palette}
							title={mapTitle}
							subtitle={dense ? "Zoom in to edit points, or use the points table." : mapSubtitle}
							banner={
								drawing ? (
									<>
										<p className="type-small font-semibold">{DRAW_BANNER[drawing.tool][0]}</p>
										<p className="type-small @max-sm:hidden">{DRAW_BANNER[drawing.tool][1]}</p>
									</>
								) : undefined
							}
							mapVersion={`${baseVersion} draft`}
							zones={zoneStyles}
							controller={mapRef}
							onPlanClick={onPlanClick}
							// A working height on every screen: on a phone the plan's own proportions leave the
							// label and the controls covering most of it.
							className="h-[min(72svh,42rem)] min-h-88"
							keysHint={EDITOR_KEYS_HINT}>
							<EditorLayer>
								<ProblemPills pills={pills} />
								{!drawing && selectedZone && selection && ring && ringPoints && (
									<RingHandles
										zone={selectedZone}
										ring={selection.ring}
										points={ringPoints}
										selected={selection.index}
										frame={frame}
										dispatch={dispatch}
										snapIndex={snapIndex}
										onSnap={setSnapTarget}
										onEscape={() => focusZoneRow(selectedZone.zone_id)}
										onDenseChange={setDense}
										focusToken={focusToken}
										claimFocus={claimFocus}
										requestFocus={requestFocus}
									/>
								)}
								<SnapMarker at={snapTarget ? snapTarget.plan : null} />
								{drawing && (
									<DrawLayer
										drawing={drawing}
										zones={state.zones}
										siteBoundary={siteBoundary}
										frame={frame}
										palette={paletteName}
										snap={state.settings.snap}
										dispatch={dispatch}
										registerClick={registerDrawClick}
										onFinish={finishDrawing}
										crossId={crossId}
									/>
								)}
							</EditorLayer>
						</MapFrame>
						<EditorKeys />
					</div>
				</Island>
				<div className="flex min-w-0 flex-col gap-6">
					<ZoneList
						zones={state.zones}
						changes={changes}
						problemCounts={problemCounts}
						selectedId={selection?.zoneId ?? null}
						onSelect={zoneId => dispatch({ type: "select-zone", zoneId })}
						onOpen={openZone}
						footer={
							<Button variant="outline" size="sm" icon="plus" onClick={() => chooseTool("shape", true)}>
								Add a zone
							</Button>
						}
					/>
					<ZoneProperties
						zone={selectedZone}
						existing={selectedZone ? state.base.has(selectedZone.zone_id) : false}
						baseVersion={baseVersion}
						dispatch={dispatch}
						labelInputId={nameId}
						shapeActions={selectedZone && <ShapeActions zone={selectedZone} dispatch={dispatch} />}
					/>
					{selectedZone && selection && (
						<PointsTable
							zone={selectedZone}
							ring={selection.ring}
							selected={selection.index}
							frame={frame}
							dispatch={dispatch}
							onShowOnMap={index => {
								dispatch({
									type: "select-point",
									zoneId: selectedZone.zone_id,
									address: { ...selection.ring, index }
								});
								requestFocus();
							}}
						/>
					)}
					<ProblemsIsland problems={problems} onShow={showProblem} />
				</div>
			</div>
		</div>
	);
}
