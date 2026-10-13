import { type KeyboardEvent, memo, type ReactNode, useId } from "react";

import { cx } from "@/lib/cx";
import { MAP_PALETTES, mapChromeTheme, type MapPalette, type MapPaletteName } from "@/lib/map-palette";
import {
	type PlanPoint,
	type PlanShape,
	type PlanZone,
	type ProjectedSite,
	toPlan,
	zonePath,
	zonePathDecimals
} from "@/lib/plan";

/**
 * A site plan as SVG: the ground, the site, its surfaces, paths, structures, equipment and trees, the
 * zones, and observation markers, all in the colours of one map palette (`contracts/map-palettes.json`).
 * Nothing here holds state, so a plan renders on the server for thumbnails, the auth hero and print, and
 * `MapFrame` wraps the same drawing for zoom, pan and selection.
 *
 * Geometry is in plan units from `projectSite`. Hairlines (edges, zone dashes, the grid), path outlines and
 * the hatch keep their size on screen at every zoom; paths and trees are sized in metres and scale with the
 * plan; labels and markers keep their size on screen while the plan zooms under them.
 */

export type ZonePlanStyle = {
	/** focus draws the dashes heavier; dim fades a zone that does not match a filter. */
	emphasis?: "focus" | "dim";
	/** 45° hatching in the zone edge colour: the session's zone, a boundary being edited or one that changed. */
	hatched?: boolean;
	/** Show this zone's name pill. Defaults to the plan's `showLabels`. */
	label?: boolean;
	/** Coverage dots after the name, one per round: filled met the target, hollow is below it. */
	dots?: boolean[];
};

export type PlanObservation = {
	id: string;
	lng: number;
	lat: number;
	selected?: boolean;
	/** Drawn faintly: outside the current filter, kept for context. */
	dim?: boolean;
	/** The marker's accessible name when it is a button, such as "OBS-0244, Woodland edge, Round 3". */
	label?: string;
};

export type PlanLayers = { zones: boolean; observations: boolean; trees: boolean };

/** Zoom and pan, in plan units: the plan is scaled by `zoom` about its origin, then moved by (x, y). */
export type PlanCamera = { x: number; y: number; zoom: number };

export type SitePlanProps = {
	site: ProjectedSite;
	palette: MapPaletteName;
	/** Per-zone styling, keyed by zone id ("zone-a"). Zones without an entry draw plainly. */
	zones?: Record<string, ZonePlanStyle>;
	observations?: PlanObservation[];
	/** Zone name pills. On by default; thumbnails turn them off. */
	showLabels?: boolean;
	/** Layer toggles from the map's Layers menu. Every layer shows unless turned off here. */
	layers?: Partial<PlanLayers>;
	/** The plan's name for assistive technology, such as "Riverside · Day plan". A summary follows it. */
	title: string;
	/** "thumbnail" draws finer zone dashes for plans a few centimetres wide. */
	detail?: "full" | "thumbnail";
	className?: string;
	/** Part of the plan to show, in plan units. Defaults to the whole frame. */
	viewBox?: readonly [x: number, y: number, width: number, height: number];
	/** "meet" shows the whole view box; "slice" fills the element and crops the edges. */
	fit?: "meet" | "slice";
	camera?: PlanCamera;
	/**
	 * Screen pixels per plan unit at the camera's zoom, when the frame knows its size. Zone outlines keep the
	 * precision this calls for; without it a plan unit is taken as a pixel at zoom 1.
	 */
	pixelsPerUnit?: number;
	/** Ease camera moves over the `camera` duration. MapFrame turns it off while a drag is under way. */
	animateCamera?: boolean;
	/**
	 * Enlarges zone pills and markers beyond their plan size, so they stay legible when a small frame draws
	 * the plan at a small scale. MapFrame sets it from its width; 1 draws them at plan size.
	 */
	labelScale?: number;
	/** Makes each marker a button that reports its id. Without it the plan is a single image. */
	onSelectObservation?: (id: string) => void;
	/** A marker button took keyboard focus, so the frame can bring it into view. */
	onFocusObservation?: (id: string) => void;
	/** Extra layers above everything else, in plan units (vertex handles, a placed point). */
	children?: ReactNode;
	/** The children hold controls (an editing layer's handles), so the plan is a group, not an image. */
	interactiveChildren?: boolean;
};

/* ── Drawing constants, in plan units unless marked px ───────────────────── */

/** Hairlines, in px: they keep their width at every zoom and in a thumbnail. */
const STROKE = {
	grid: 1,
	site: 1.5,
	surface: 1,
	built: 1.25,
	tree: 1
} as const;

/** The outline drawn on each side of a path, outside its width on the ground, in plan units at zoom 1. */
const PATH_EDGE = 2;

/** Zone outlines, in px: a dashed edge, heavier for the focused or hatched zone, finer in a thumbnail. */
const ZONE_EDGE = {
	full: { plain: { width: 2, dash: "8 5" }, focus: { width: 3, dash: "7 4.5" } },
	thumbnail: { plain: { width: 1, dash: "3 2" }, focus: { width: 1.5, dash: "3 2" } }
} as const;

/**
 * 45° hatching as Project 8 draws it: dashed lines `spacing` apart, each dash and gap adding up to the tile's
 * height so the dashes run on unbroken from tile to tile.
 */
const HATCH = { spacing: 6, dash: 8, gap: 4, width: 1.4, opacity: 0.6 } as const;

const DIM_OPACITY = 0.35;

/**
 * Zone name pill, measured from Project 7: 14.5-unit text at 600 on a pill 29 tall, then the coverage dots,
 * which sit a little further from the name than from the pill's end.
 */
const PILL = {
	fontSize: 14.5,
	height: 29,
	padX: 14,
	dotRadius: 5.8,
	dotPitch: 18,
	dotGap: 16,
	dotStroke: 2,
	dotPadEnd: 11
} as const;

/** Observation markers: a dot in a ring with a core; the selected one is larger with an outer ring. */
const MARKER = {
	plain: { radius: 8, ring: 2.6, core: 2.8 },
	selected: { radius: 12.5, ring: 3.5, core: 4.2, outer: 21, outerWidth: 2.4 },
	/** The pressable circle around a marker; markers sit close together, so it stops short of 44 px. */
	hit: 15
} as const;

/** Grid lines, by how dark the palette's ground is. Opacity only: the colour is the palette's site edge. */
const GRID_OPACITY = { light: { major: 0.2, minor: 0.05 }, dark: { major: 0.45, minor: 0.15 } } as const;

/** Round grid spacings in metres; the plan takes the one nearest 50 units for its major lines. */
const GRID_STEPS_M = [1, 2, 5, 10, 25, 50, 100, 250];

/**
 * Advance widths of Geologica at 600, in ems, for printable ASCII, measured from the self-hosted font and
 * grouped by width. SVG cannot size a pill to its text before layout, and the plan renders on the server,
 * so pills are sized from these. A character outside the table counts as 0.62 em.
 */
const GLYPH_WIDTHS: readonly (readonly [chars: string, em: number])[] = [
	[" '", 0.24],
	[",ij", 0.28],
	[".l", 0.29],
	[";", 0.3],
	[":", 0.31],
	["I|", 0.32],
	["!", 0.34],
	["()[]{}", 0.36],
	["-", 0.39],
	["f", 0.4],
	["r", 0.43],
	['"t', 0.44],
	["/\\1", 0.46],
	["`z", 0.5],
	["?s", 0.51],
	["J", 0.52],
	["c", 0.53],
	["_v", 0.55],
	["L7", 0.56],
	["*Tay", 0.57],
	["3", 0.58],
	["FZekx25", 0.59],
	["4", 0.6],
	["g", 0.61],
	["o8", 0.62],
	["ESYu9", 0.63],
	["#hn", 0.64],
	["$+<=>P^~6", 0.65],
	["Bbdpq", 0.66],
	["RV", 0.68],
	["X0", 0.69],
	["C", 0.7],
	["A", 0.71],
	["K", 0.72],
	["D", 0.73],
	["GU", 0.75],
	["&", 0.76],
	["H", 0.77],
	["N", 0.78],
	["w", 0.82],
	["OQ", 0.83],
	["@", 0.84],
	["M", 0.94],
	["m", 0.97],
	["W", 1.03],
	["%", 1.04]
];

const ADVANCE: ReadonlyMap<string, number> = new Map(
	GLYPH_WIDTHS.flatMap(([chars, em]) => [...chars].map(char => [char, em] as const))
);

function textWidth(text: string, fontSize: number): number {
	let ems = 0;
	for (const char of text) ems += ADVANCE.get(char) ?? 0.62;
	return ems * fontSize;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

const round = (value: number) => Math.round(value * 100) / 100;

function ringPath(points: readonly PlanPoint[]): string {
	return `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join("L")}Z`;
}

function polygonPath(rings: readonly (readonly PlanPoint[])[]): string {
	return rings.map(ringPath).join("");
}

function linePath(points: readonly PlanPoint[]): string {
	return `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join("L")}`;
}

function surfaceSwatch(palette: MapPalette, kind: PlanShape["kind"]): { fill: string; edge: string } | null {
	switch (kind) {
		case "grass":
		case "mulch":
		case "dirt":
		case "blacktop":
		case "path":
			return palette.surfaces[kind];
		default:
			return null;
	}
}

function gridSpacing(metresPerUnit: number): { major: number; minor: number } {
	const target = 50 * metresPerUnit;
	const metres = GRID_STEPS_M.reduce((best, step) =>
		Math.abs(Math.log(step / target)) < Math.abs(Math.log(best / target)) ? step : best
	);
	const major = metres / metresPerUnit;
	return { major, minor: major / 4 };
}

function gridPath(spacing: number, x0: number, y0: number, x1: number, y1: number, skip?: number): string {
	const parts: string[] = [];
	const onMajor = (value: number) => skip !== undefined && Math.abs(value / skip - Math.round(value / skip)) < 1e-6;
	for (let x = Math.ceil(x0 / spacing) * spacing; x <= x1; x += spacing) {
		if (!onMajor(x)) parts.push(`M${round(x)} ${round(y0)}V${round(y1)}`);
	}
	for (let y = Math.ceil(y0 / spacing) * spacing; y <= y1; y += spacing) {
		if (!onMajor(y)) parts.push(`M${round(x0)} ${round(y)}H${round(x1)}`);
	}
	return parts.join("");
}

function summary(site: ProjectedSite, title: string, observations: readonly PlanObservation[], showZones: boolean) {
	const parts = [title];
	if (showZones && site.zones.length > 0) {
		const names = site.zones.map(zone => zone.name).join(", ");
		parts.push(site.zones.length === 1 ? `One zone: ${names}` : `${site.zones.length} zones: ${names}`);
	}
	if (observations.length > 0) {
		parts.push(observations.length === 1 ? "1 observation" : `${observations.length} observations`);
	}
	return parts.join(". ");
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function ZoneLabel({
	zone,
	palette,
	dots,
	scale,
	cameraClass
}: {
	zone: PlanZone;
	palette: MapPalette;
	dots: boolean[] | undefined;
	scale: number;
	cameraClass: string | undefined;
}) {
	const nameWidth = textWidth(zone.name, PILL.fontSize);
	const end =
		dots && dots.length > 0
			? PILL.dotGap + (dots.length - 1) * PILL.dotPitch + PILL.dotRadius * 2 + PILL.dotPadEnd
			: PILL.padX;
	const width = PILL.padX + nameWidth + end;
	const left = -width / 2;
	const [x, y] = zone.labelAnchor;
	return (
		<g className={cameraClass} style={{ transform: `translate(${round(x)}px, ${round(y)}px) scale(${scale})` }}>
			<rect
				x={round(left)}
				y={-PILL.height / 2}
				width={round(width)}
				height={PILL.height}
				rx={PILL.height / 2}
				fill={palette.zoneLabel.fill}
			/>
			<text
				x={round(left + PILL.padX)}
				y={0}
				dominantBaseline="central"
				fontSize={PILL.fontSize}
				fontWeight={600}
				fill={palette.zoneLabel.text}>
				{zone.name}
			</text>
			{dots?.map((met, index) => {
				const cx = left + PILL.padX + nameWidth + PILL.dotGap + PILL.dotRadius + index * PILL.dotPitch;
				return met ? (
					<circle key={index} cx={round(cx)} cy={0} r={PILL.dotRadius} fill={palette.zone.edge} />
				) : (
					<circle
						key={index}
						cx={round(cx)}
						cy={0}
						r={PILL.dotRadius - PILL.dotStroke / 2}
						fill="none"
						stroke={palette.zone.edge}
						strokeWidth={PILL.dotStroke}
					/>
				);
			})}
		</g>
	);
}

function Marker({ palette, selected }: { palette: MapPalette; selected: boolean }) {
	const { fill, ring, selected: halo } = palette.observation;
	if (selected) {
		const size = MARKER.selected;
		return (
			<>
				<circle
					r={size.outer}
					fill="none"
					stroke={halo}
					strokeWidth={size.outerWidth}
					className="animate-fade-in"
				/>
				<circle r={size.radius} fill={fill} stroke={ring} strokeWidth={size.ring} />
				<circle r={size.core} fill={ring} />
			</>
		);
	}
	const size = MARKER.plain;
	return (
		<>
			<circle r={size.radius} fill={fill} stroke={ring} strokeWidth={size.ring} />
			<circle r={size.core} fill={halo} />
		</>
	);
}

/**
 * Everything under the zones: the ground, the grid, the site, its surfaces, paths, structures, equipment and
 * trees. It changes only with the site, the palette and the zoom, so it is memoised: dragging a zone's point
 * redraws the zones layer, never this.
 */
const PlanBackground = memo(function PlanBackground({
	features,
	width,
	height,
	metresPerUnit,
	paletteName,
	detail,
	zoom,
	showTrees
}: {
	/** The site's features, by reference: an editor that swaps the zones keeps this array and its memo. */
	features: readonly PlanShape[];
	width: number;
	height: number;
	metresPerUnit: number;
	paletteName: MapPaletteName;
	detail: "full" | "thumbnail";
	zoom: number;
	showTrees: boolean;
}) {
	const palette = MAP_PALETTES[paletteName];
	// The ground reaches well past the frame, so letterboxing and panning never show an edge.
	const groundX0 = -width;
	const groundY0 = -height;
	const groundX1 = width * 2;
	const groundY1 = height * 2;
	const grid = gridSpacing(metresPerUnit);
	const gridOpacity = GRID_OPACITY[palette.tiles];

	const surfaces = features.filter(
		(shape): shape is Extract<PlanShape, { type: "polygon" }> =>
			shape.type === "polygon" && surfaceSwatch(palette, shape.kind) !== null
	);
	const lines = features.filter((shape): shape is Extract<PlanShape, { type: "line" }> => shape.type === "line");
	const built = features.filter(
		(shape): shape is Extract<PlanShape, { type: "polygon" }> =>
			shape.type === "polygon" && (shape.kind === "structure" || shape.kind === "equipment")
	);
	const boundaries = features.filter(
		(shape): shape is Extract<PlanShape, { type: "polygon" }> => shape.type === "polygon" && shape.kind === "site"
	);
	const trees = features.filter(shape => shape.kind === "tree");

	return (
		<>
			<rect
				x={groundX0}
				y={groundY0}
				width={groundX1 - groundX0}
				height={groundY1 - groundY0}
				fill={palette.background}
			/>
			{/* A thumbnail keeps only the major lines; the minor ones would close up into a tint. */}
			{detail === "full" && (
				<path
					d={gridPath(grid.minor, groundX0, groundY0, groundX1, groundY1, grid.major)}
					stroke={palette.site.edge}
					strokeOpacity={gridOpacity.minor}
					strokeWidth={STROKE.grid}
					vectorEffect="non-scaling-stroke"
					fill="none"
				/>
			)}
			<path
				d={gridPath(grid.major, groundX0, groundY0, groundX1, groundY1)}
				stroke={palette.site.edge}
				strokeOpacity={gridOpacity.major}
				strokeWidth={STROKE.grid}
				vectorEffect="non-scaling-stroke"
				fill="none"
			/>

			{boundaries.map(shape => (
				<path
					key={shape.id}
					d={polygonPath(shape.rings)}
					fillRule="evenodd"
					fill={palette.site.fill}
					stroke={palette.site.edge}
					strokeWidth={STROKE.site}
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
				/>
			))}

			{surfaces.map(shape => {
				const swatch = surfaceSwatch(palette, shape.kind)!;
				return (
					<path
						key={shape.id}
						d={polygonPath(shape.rings)}
						fillRule="evenodd"
						fill={swatch.fill}
						stroke={swatch.edge}
						strokeWidth={STROKE.surface}
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
					/>
				);
			})}

			{/* Every path's edge first, then every fill, so crossings and junctions merge. */}
			{lines.map(shape => (
				<path
					key={`${shape.id}-edge`}
					d={linePath(shape.points)}
					fill="none"
					stroke={palette.path.line}
					// The path is metres wide and zooms; its outline keeps its width on screen.
					strokeWidth={round(shape.width + (PATH_EDGE * 2) / zoom)}
					strokeLinejoin="miter"
				/>
			))}
			{lines.map(shape => (
				<path
					key={shape.id}
					d={linePath(shape.points)}
					fill="none"
					stroke={palette.surfaces.path.fill}
					strokeWidth={round(shape.width)}
					strokeLinejoin="miter"
				/>
			))}

			{built.map(shape => {
				const swatch = shape.kind === "structure" ? palette.structure : palette.equipment;
				return (
					<path
						key={shape.id}
						d={polygonPath(shape.rings)}
						fillRule="evenodd"
						fill={swatch.fill}
						stroke={swatch.edge}
						strokeWidth={STROKE.built}
						strokeLinejoin="round"
						vectorEffect="non-scaling-stroke"
					/>
				);
			})}

			{showTrees && (
				<g opacity={palette.tree.opacity}>
					{trees.map(shape =>
						shape.type === "circle" ? (
							<circle
								key={shape.id}
								cx={round(shape.center[0])}
								cy={round(shape.center[1])}
								r={round(shape.radius)}
								fill={palette.tree.fill}
								stroke={palette.tree.edge}
								strokeWidth={STROKE.tree}
								vectorEffect="non-scaling-stroke"
							/>
						) : shape.type === "polygon" ? (
							<path
								key={shape.id}
								d={polygonPath(shape.rings)}
								fill={palette.tree.fill}
								stroke={palette.tree.edge}
								strokeWidth={STROKE.tree}
								vectorEffect="non-scaling-stroke"
							/>
						) : null
					)}
				</g>
			)}
		</>
	);
});

/* ── The plan ─────────────────────────────────────────────────────────────── */

export function SitePlan({
	site,
	palette: paletteName,
	zones: zoneStyles = {},
	observations = [],
	showLabels = true,
	layers,
	title,
	detail = "full",
	className,
	viewBox,
	fit = "meet",
	camera = { x: 0, y: 0, zoom: 1 },
	pixelsPerUnit,
	animateCamera = false,
	labelScale = 1,
	onSelectObservation,
	onFocusObservation,
	children,
	interactiveChildren = false
}: SitePlanProps) {
	const palette = MAP_PALETTES[paletteName];
	const show: PlanLayers = { zones: true, observations: true, trees: true, ...layers };
	const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
	const hatchId = `plan-hatch-${uid}`;

	const [vx, vy, vw, vh] = viewBox ?? [0, 0, site.width, site.height];
	const cameraClass = animateCamera
		? "transition-transform duration-(--ct-duration-camera) ease-standard"
		: undefined;
	// Pills and markers keep their size on screen while the plan zooms under them.
	const counterScale = labelScale / camera.zoom;

	const zoneEdge = ZONE_EDGE[detail];
	const zoneDecimals = zonePathDecimals(pixelsPerUnit ?? camera.zoom);
	const anyHatched = site.zones.some(zone => zoneStyles[zone.id]?.hatched);
	// Markers are buttons only with a selection to report; the plan is a group whenever it holds controls.
	const markersInteractive = Boolean(onSelectObservation);
	const interactive = markersInteractive || interactiveChildren;
	const shownObservations = show.observations ? observations : [];
	// Faint markers first, the selected one last, so the selection is never under another marker.
	const markerOrder = [...shownObservations].sort(
		(a, b) =>
			Number(Boolean(b.dim)) - Number(Boolean(a.dim)) || Number(Boolean(a.selected)) - Number(Boolean(b.selected))
	);

	const handleMarkerKey = (event: KeyboardEvent<SVGGElement>, id: string) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onSelectObservation?.(id);
		}
	};

	return (
		<svg
			viewBox={`${round(vx)} ${round(vy)} ${round(vw)} ${round(vh)}`}
			preserveAspectRatio={`xMidYMid ${fit}`}
			role={interactive ? "group" : "img"}
			aria-label={summary(site, title, shownObservations, show.zones)}
			// The marker focus ring is a Contour token; this scope keeps it legible on a dark palette.
			data-theme={mapChromeTheme(paletteName)}
			className={cx("block font-sans select-none", className)}
			style={{ backgroundColor: palette.background }}>
			{anyHatched && (
				<defs>
					<pattern
						id={hatchId}
						width={HATCH.spacing}
						height={HATCH.dash + HATCH.gap}
						patternUnits="userSpaceOnUse"
						// Like the zone dashes, the hatch keeps its size on screen while the plan zooms.
						patternTransform={`rotate(45) scale(${round(1 / camera.zoom)})`}>
						{/* Centred in the tile: a line on the tile's edge would lose half its width to the clip. */}
						<line
							x1={HATCH.spacing / 2}
							y1={0}
							x2={HATCH.spacing / 2}
							y2={HATCH.dash + HATCH.gap}
							stroke={palette.zone.edge}
							strokeWidth={HATCH.width}
							strokeDasharray={`${HATCH.dash} ${HATCH.gap}`}
							strokeOpacity={HATCH.opacity}
						/>
					</pattern>
				</defs>
			)}

			<g
				className={cameraClass}
				style={{ transform: `translate(${round(camera.x)}px, ${round(camera.y)}px) scale(${camera.zoom})` }}>
				<g aria-hidden="true">
					<PlanBackground
						features={site.features}
						width={site.width}
						height={site.height}
						metresPerUnit={site.metresPerUnit}
						paletteName={paletteName}
						detail={detail}
						zoom={camera.zoom}
						showTrees={show.trees}
					/>

					{show.zones &&
						site.zones.map(zone => {
							const style = zoneStyles[zone.id] ?? {};
							const edge = style.emphasis === "focus" || style.hatched ? zoneEdge.focus : zoneEdge.plain;
							return (
								<path
									key={zone.id}
									data-zone={zone.id}
									d={zonePath(zone.parts, zoneDecimals)}
									fillRule="nonzero"
									fill={style.hatched ? `url(#${hatchId})` : palette.zone.fill}
									fillOpacity={style.hatched ? 1 : palette.zone.fillOpacity}
									stroke={palette.zone.edge}
									strokeWidth={edge.width}
									strokeDasharray={edge.dash}
									strokeLinejoin="round"
									vectorEffect="non-scaling-stroke"
									opacity={style.emphasis === "dim" ? DIM_OPACITY : undefined}
								/>
							);
						})}
				</g>

				{show.zones && (
					<g aria-hidden="true">
						{site.zones.map(zone => {
							const style = zoneStyles[zone.id] ?? {};
							if (!(style.label ?? showLabels)) return null;
							return (
								<g key={zone.id} opacity={style.emphasis === "dim" ? DIM_OPACITY : undefined}>
									<ZoneLabel
										zone={zone}
										palette={palette}
										dots={style.dots}
										scale={counterScale}
										cameraClass={cameraClass}
									/>
								</g>
							);
						})}
					</g>
				)}

				{markerOrder.length > 0 && (
					<g aria-hidden={markersInteractive ? undefined : true}>
						{markerOrder.map(observation => {
							const [x, y] = toPlan([observation.lng, observation.lat], site.frame);
							const selected = Boolean(observation.selected);
							const placement = {
								transform: `translate(${round(x)}px, ${round(y)}px) scale(${counterScale})`
							};
							if (!markersInteractive) {
								return (
									<g
										key={observation.id}
										className={cameraClass}
										style={placement}
										opacity={observation.dim ? DIM_OPACITY : undefined}>
										<Marker palette={palette} selected={selected} />
									</g>
								);
							}
							return (
								<g
									key={observation.id}
									role="button"
									tabIndex={0}
									aria-label={observation.label ?? observation.id}
									aria-pressed={selected}
									className={cx("group/marker cursor-pointer", cameraClass)}
									// The ring below is the focus indicator; an outline would draw the group's box.
									style={{ ...placement, outline: "none" }}
									opacity={observation.dim ? DIM_OPACITY : undefined}
									onClick={() => onSelectObservation?.(observation.id)}
									onFocus={() => onFocusObservation?.(observation.id)}
									onKeyDown={event => handleMarkerKey(event, observation.id)}>
									<circle r={MARKER.hit} fill="transparent" />
									<Marker palette={palette} selected={selected} />
									<circle
										r={(selected ? MARKER.selected.outer : MARKER.plain.radius) + 5}
										fill="none"
										strokeWidth={3}
										vectorEffect="non-scaling-stroke"
										className="stroke-focus opacity-0 group-focus-visible/marker:opacity-100"
									/>
								</g>
							);
						})}
					</g>
				)}

				{children}
			</g>
		</svg>
	);
}
