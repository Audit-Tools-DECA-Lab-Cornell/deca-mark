import { z } from "zod";

import { METRES_PER_DEGREE, partsOf, readZoneGeometry, type ZoneGeometry } from "./zones/geometry";

/**
 * Site plans as geometry. A site is a GeoJSON FeatureCollection in WGS84 (the layers of a map package
 * uploaded from QGIS). Drawing it projects every position onto a plan: x runs east and y runs south, in plan
 * units of a fixed number of metres, using the equirectangular approximation with longitude scaled by
 * cos(latitude). That is exact enough for a site a few hundred metres across, and it keeps the plan the same
 * on every screen.
 *
 * Everything here is pure, so the plan draws on the server, in the browser and in print alike.
 */

/** Every plan is drawn into a frame of this many units; a site without its own frame is fitted inside it. */
export const PLAN_WIDTH = 720;
export const PLAN_HEIGHT = 500;

/** Room left around a fitted site, as a share of its larger side. */
const FIT_PADDING = 0.06;

export type LngLat = readonly [lng: number, lat: number];
export type PlanPoint = readonly [x: number, y: number];

/* ── The site collection ──────────────────────────────────────────────────── */

export const SITE_KINDS = [
	"site",
	"grass",
	"mulch",
	"dirt",
	"blacktop",
	"path",
	"structure",
	"equipment",
	"tree",
	"zone"
] as const;

export type SiteKind = (typeof SITE_KINDS)[number];

/** The ground surfaces, each with a fill and an edge in the map palette. */
export type SurfaceKind = "grass" | "mulch" | "dirt" | "blacktop" | "path";

const position = z.tuple([z.number(), z.number()]);

const polygonCoordinates = z.array(z.array(position).min(4)).min(1);

const geometrySchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("Point"), coordinates: position }),
	z.object({ type: z.literal("LineString"), coordinates: z.array(position).min(2) }),
	z.object({ type: z.literal("Polygon"), coordinates: polygonCoordinates }),
	/** Zones only: a zone with several parts stays one zone. */
	z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(polygonCoordinates).min(1) })
]);

const propertiesSchema = z.object({
	kind: z.enum(SITE_KINDS),
	id: z.string().min(1),
	name: z.string().optional(),
	code: z.string().optional(),
	/** Paths drawn as lines: their width on the ground. */
	width_m: z.number().positive().optional(),
	/** Trees drawn as points: their crown radius. */
	radius_m: z.number().positive().optional(),
	/** Zones: the stable zone identity a map package carries. */
	zone_id: z.string().min(1).optional(),
	/** Zones: the point the server chose inside the zone (`ST_PointOnSurface`); the name pill sits on it. */
	display_anchor: position.optional(),
	/** Zones: the digest of the canonical shape, as the package lists it. */
	geometry_sha256: z.string().optional(),
	/** Fall Creek equipment keeps the QGIS layer's own kind ("swings", "picnic-table"). */
	source_kind: z.string().optional()
});

const frameSchema = z.object({
	origin: position,
	metresPerUnit: z.number().positive(),
	width: z.number().positive(),
	height: z.number().positive()
});

const featureSchema = z
	.object({ type: z.literal("Feature"), properties: propertiesSchema, geometry: geometrySchema })
	.superRefine((feature, context) => {
		// A zone's shape is read strictly (WUI-2): nothing about it is repaired on the way to the plan.
		if (feature.properties.kind === "zone") {
			const read = readZoneGeometry(feature.geometry);
			if (!read.ok)
				for (const issue of read.issues)
					context.addIssue({ code: "custom", message: issue.message, path: ["geometry", issue.path] });
		} else if (feature.geometry.type === "MultiPolygon") {
			context.addIssue({ code: "custom", message: "Only a zone keeps several parts.", path: ["geometry"] });
		}
	});

const collectionSchema = z.object({
	type: z.literal("FeatureCollection"),
	name: z.string().min(1),
	frame: frameSchema.optional(),
	features: z.array(featureSchema)
});

/**
 * Where a plan's unit grid sits on the ground: plan (0, 0) is `origin`, one unit is `metresPerUnit`, and the
 * frame is `width` × `height` units. A site drawn in plan units carries its own; others are fitted.
 */
export type PlanFrame = z.infer<typeof frameSchema>;
export type SiteFeature = z.infer<typeof collectionSchema>["features"][number];
export type SiteCollection = z.infer<typeof collectionSchema>;

/** Checks a site collection's shape, so a bad fixture or package fails where it is read, not where it is drawn. */
export function parseSite(data: unknown): SiteCollection {
	return collectionSchema.parse(data);
}

/* ── Projection ───────────────────────────────────────────────────────────── */

const cosOf = (latitude: number) => Math.cos((latitude * Math.PI) / 180);

/** A position on the ground to plan units in the given frame. */
export function toPlan([lng, lat]: LngLat, frame: PlanFrame): PlanPoint {
	const [originLng, originLat] = frame.origin;
	const x = ((lng - originLng) * METRES_PER_DEGREE * cosOf(originLat)) / frame.metresPerUnit;
	const y = ((originLat - lat) * METRES_PER_DEGREE) / frame.metresPerUnit;
	return [x, y];
}

/** Plan units back to a position on the ground. The inverse of {@link toPlan}. */
export function fromPlan([x, y]: PlanPoint, frame: PlanFrame): LngLat {
	const [originLng, originLat] = frame.origin;
	const lng = originLng + (x * frame.metresPerUnit) / (METRES_PER_DEGREE * cosOf(originLat));
	const lat = originLat - (y * frame.metresPerUnit) / METRES_PER_DEGREE;
	return [lng, lat];
}

function forEachPosition(feature: SiteFeature, visit: (position: LngLat) => void) {
	const { geometry } = feature;
	if (geometry.type === "Point") visit(geometry.coordinates);
	else if (geometry.type === "LineString") geometry.coordinates.forEach(visit);
	else if (geometry.type === "Polygon") for (const ring of geometry.coordinates) ring.forEach(visit);
	else for (const part of geometry.coordinates) for (const ring of part) ring.forEach(visit);
}

/**
 * The frame for a site that does not carry one: the site's extent with a little room around it, centred in a
 * {@link PLAN_WIDTH} × {@link PLAN_HEIGHT} frame, so every plan shares one shape and thumbnails line up.
 */
export function fitFrame(features: readonly SiteFeature[]): PlanFrame {
	// Loops, not Math.min(...spread): a spread of every position overflows the stack on a large site.
	let west = Infinity;
	let east = -Infinity;
	let south = Infinity;
	let north = -Infinity;
	for (const feature of features) {
		forEachPosition(feature, ([lng, lat]) => {
			if (lng < west) west = lng;
			if (lng > east) east = lng;
			if (lat < south) south = lat;
			if (lat > north) north = lat;
		});
	}
	if (west > east) throw new Error("A site needs at least one feature to fit a plan to.");
	const cos = cosOf((north + south) / 2);
	const widthMetres = (east - west) * METRES_PER_DEGREE * cos;
	const heightMetres = (north - south) * METRES_PER_DEGREE;
	const pad = Math.max(widthMetres, heightMetres, 1) * FIT_PADDING;
	const metresPerUnit = Math.max((widthMetres + pad * 2) / PLAN_WIDTH, (heightMetres + pad * 2) / PLAN_HEIGHT);
	const centreLng = (west + east) / 2;
	const centreLat = (north + south) / 2;
	return {
		origin: [
			centreLng - (PLAN_WIDTH / 2) * (metresPerUnit / (METRES_PER_DEGREE * cos)),
			centreLat + (PLAN_HEIGHT / 2) * (metresPerUnit / METRES_PER_DEGREE)
		],
		metresPerUnit,
		width: PLAN_WIDTH,
		height: PLAN_HEIGHT
	};
}

/* ── Plane geometry ───────────────────────────────────────────────────────── */

function signedArea(points: readonly PlanPoint[]): number {
	let sum = 0;
	for (let i = 0; i < points.length; i++) {
		const [x1, y1] = points[i]!;
		const [x2, y2] = points[(i + 1) % points.length]!;
		sum += x1 * y2 - x2 * y1;
	}
	return sum / 2;
}

/** The area-weighted centre of a polygon (its vertex average when it has no area). */
export function polygonCentroid(points: readonly PlanPoint[]): PlanPoint {
	const area = signedArea(points);
	if (Math.abs(area) < 1e-9) {
		const n = Math.max(points.length, 1);
		return [points.reduce((s, [x]) => s + x, 0) / n, points.reduce((s, [, y]) => s + y, 0) / n];
	}
	let cx = 0;
	let cy = 0;
	for (let i = 0; i < points.length; i++) {
		const [x1, y1] = points[i]!;
		const [x2, y2] = points[(i + 1) % points.length]!;
		const cross = x1 * y2 - x2 * y1;
		cx += (x1 + x2) * cross;
		cy += (y1 + y2) * cross;
	}
	return [cx / (6 * area), cy / (6 * area)];
}

/** Whether a point lies inside a polygon (even–odd rule). Works the same for plan points and lng/lat pairs. */
export function pointInPolygon(
	[px, py]: readonly [number, number],
	polygon: readonly (readonly [number, number])[]
): boolean {
	let inside = false;
	for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
		const [xi, yi] = polygon[i]!;
		const [xj, yj] = polygon[j]!;
		if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
	}
	return inside;
}

function distanceToSegment([px, py]: PlanPoint, [ax, ay]: PlanPoint, [bx, by]: PlanPoint): number {
	const dx = bx - ax;
	const dy = by - ay;
	const lengthSquared = dx * dx + dy * dy;
	const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
	return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToEdge(point: PlanPoint, polygon: readonly PlanPoint[]): number {
	let best = Infinity;
	for (let i = 0; i < polygon.length; i++) {
		best = Math.min(best, distanceToSegment(point, polygon[i]!, polygon[(i + 1) % polygon.length]!));
	}
	return best;
}

export type PlanBounds = { minX: number; minY: number; maxX: number; maxY: number };

/** The box around plan points. Loops, so a long list never overflows the stack. */
export function boundsOf(points: Iterable<PlanPoint>): PlanBounds {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const [x, y] of points) {
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	return { minX, minY, maxX, maxY };
}

/** A zone's projected parts: each part's rings, the outer edge first, without the closing repeat. */
export type PlanParts = readonly (readonly (readonly PlanPoint[])[])[];

/** Whether a point is inside one part: inside its outer edge and in no hole (even–odd over its rings). */
function inPart(point: PlanPoint, rings: readonly (readonly PlanPoint[])[]): boolean {
	let inside = false;
	for (const ring of rings) if (pointInPolygon(point, ring)) inside = !inside;
	return inside;
}

/**
 * Whether a zone's ring is drawn backwards. Outer edges are drawn winding one way and holes the other,
 * whichever way the rings wind in the data, so under `fill-rule="nonzero"` holes stay unfilled and parts
 * that overlap stay filled where they overlap (an even–odd fill over the whole zone would empty that patch).
 */
function drawnBackwards(ring: readonly PlanPoint[], index: number): boolean {
	const area = signedArea(ring);
	return index === 0 ? area < 0 : area > 0;
}

/** How many times a ring winds round a point, counted by the sign of its turns. */
function windingNumber([px, py]: PlanPoint, ring: readonly PlanPoint[]): number {
	let winding = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		const [xa, ya] = ring[j]!;
		const [xb, yb] = ring[i]!;
		const side = (xb - xa) * (py - ya) - (px - xa) * (yb - ya);
		if (ya <= py) {
			if (yb > py && side > 0) winding++;
		} else if (yb <= py && side < 0) winding--;
	}
	return winding;
}

/**
 * Whether a point lies inside a zone as {@link zonePath} draws it: in one of its parts and not in that part's
 * hole, and inside wherever parts overlap. It counts each ring's winding the way the ring is drawn, as the
 * browser's nonzero fill does, so a point the plan shows filled is the point that selects the zone.
 */
export function pointInParts(point: PlanPoint, parts: PlanParts): boolean {
	let winding = 0;
	for (const rings of parts)
		rings.forEach((ring, index) => {
			const turns = windingNumber(point, ring);
			winding += drawnBackwards(ring, index) ? -turns : turns;
		});
	return winding !== 0;
}

/**
 * Decimals for a zone outline at `pixelsPerUnit` screen pixels per plan unit: enough that every drawn point
 * lies within a twentieth of a pixel of its exact place, so at the editor's closest zoom (1 cm of ground per
 * pixel) an edge still meets its handles and snap markers.
 */
export function zonePathDecimals(pixelsPerUnit: number): number {
	return Math.min(9, Math.max(2, Math.ceil(Math.log10(Math.max(pixelsPerUnit, 1) * 20))));
}

/**
 * A zone's outline as SVG path data at `decimals`, one subpath per ring of every part, for
 * `fill-rule="nonzero"`: outer edges are walked one way and holes the other (see {@link drawnBackwards}).
 * Only the drawing changes; the zone's longitude and latitude are never touched.
 */
export function zonePath(parts: PlanParts, decimals = 2): string {
	const scale = 10 ** decimals;
	const at = (value: number) => Math.round(value * scale) / scale;
	let d = "";
	for (const rings of parts)
		rings.forEach((ring, index) => {
			const backwards = drawnBackwards(ring, index);
			for (let n = 0; n < ring.length; n++) {
				const [x, y] = ring[backwards ? ring.length - 1 - n : n]!;
				d += `${n === 0 ? "M" : "L"}${at(x)} ${at(y)}`;
			}
			d += "Z";
		});
	return d;
}

function distanceToRings(point: PlanPoint, rings: readonly (readonly PlanPoint[])[]): number {
	let best = Infinity;
	for (const ring of rings) best = Math.min(best, distanceToEdge(point, ring));
	return best;
}

/**
 * The area-weighted centre of a zone over every part, holes subtracted (the vertex average of its outer
 * edges when it has no area).
 */
export function partsCentroid(parts: PlanParts): PlanPoint {
	let area = 0;
	let cx = 0;
	let cy = 0;
	for (const rings of parts) {
		rings.forEach((ring, index) => {
			const ringArea = Math.abs(signedArea(ring));
			if (ringArea < 1e-12) return;
			const [x, y] = polygonCentroid(ring);
			const weight = index === 0 ? ringArea : -ringArea;
			area += weight;
			cx += x * weight;
			cy += y * weight;
		});
	}
	if (Math.abs(area) < 1e-9) {
		let n = 0;
		let sx = 0;
		let sy = 0;
		for (const rings of parts)
			for (const [x, y] of rings[0] ?? []) {
				sx += x;
				sy += y;
				n++;
			}
		return n > 0 ? [sx / n, sy / n] : [0, 0];
	}
	return [cx / area, cy / area];
}

/** A centre at least this share of its zone's narrower side from every edge is used as it is. */
const WELL_INSIDE = 0.3;

/**
 * The inside point farthest from every edge, holes included, in the zone's largest part: where a name pill
 * reads best in a long, bent or holed zone, where the centroid can fall near an edge, in a hole or outside.
 * A coarse grid search, then a finer one around the best cell. This places a label for a shape drawn in the
 * browser; a published zone's pill sits on the `display_anchor` the server chose instead.
 */
export function interiorAnchor(parts: PlanParts): PlanPoint {
	let rings = parts[0] ?? [];
	let largest = -1;
	for (const part of parts) {
		const area = Math.abs(signedArea(part[0] ?? []));
		if (area > largest) {
			largest = area;
			rings = part;
		}
	}
	const outer = rings[0] ?? [];
	const centroid = partsCentroid([rings]);
	let best: PlanPoint = centroid;
	let bestDistance = inPart(centroid, rings) ? distanceToRings(centroid, rings) : -1;
	let { minX, minY, maxX, maxY } = boundsOf(outer);
	// A round or square zone's centre is already well inside it: no search needed. A bent or holed zone,
	// whose centre lands near an edge, in a hole or outside, is searched. This keeps a site at the
	// contract's limits (250 zones) quick to draw.
	if (bestDistance >= Math.min(maxX - minX, maxY - minY) * WELL_INSIDE) return centroid;
	for (let pass = 0; pass < 2; pass++) {
		const steps = 16;
		const stepX = (maxX - minX) / steps;
		const stepY = (maxY - minY) / steps;
		for (let i = 0; i <= steps; i++) {
			for (let j = 0; j <= steps; j++) {
				const point: PlanPoint = [minX + i * stepX, minY + j * stepY];
				if (!inPart(point, rings)) continue;
				const distance = distanceToRings(point, rings);
				if (distance > bestDistance) {
					best = point;
					bestDistance = distance;
				}
			}
		}
		[minX, maxX, minY, maxY] = [best[0] - stepX, best[0] + stepX, best[1] - stepY, best[1] + stepY];
	}
	return best;
}

/* ── The projected site ───────────────────────────────────────────────────── */

type ShapeBase = { id: string; name?: string };

/** A projected feature, ready to draw. Polygons keep every ring; the first is the outer one. */
export type PlanShape =
	| (ShapeBase & {
			type: "polygon";
			kind: Exclude<SiteKind, "zone">;
			rings: PlanPoint[][];
			/** The QGIS layer's own kind, when the plan kind generalises it (Fall Creek equipment). */
			sourceKind?: string;
	  })
	| (ShapeBase & { type: "line"; kind: "path"; points: PlanPoint[]; /** Plan units. */ width: number })
	| (ShapeBase & { type: "circle"; kind: "tree"; center: PlanPoint; /** Plan units. */ radius: number });

/**
 * A zone on the plan. It stays one zone however many parts and holes it has, and it carries its longitude and
 * latitude exactly as read: `parts` is only for drawing and is never turned back into coordinates.
 */
export type PlanZone = {
	/** Styles and keys use this: the stable `zone_id` from a map package, else the source feature's id. */
	id: string;
	/** The stable zone identity, when the zone comes from a map package. */
	zoneId?: string;
	code?: string;
	name: string;
	/** Longitude and latitude, exactly as read. */
	geometry: ZoneGeometry;
	parts: PlanParts;
	centroid: PlanPoint;
	/** Where the name pill is centred. */
	labelAnchor: PlanPoint;
};

export type ProjectedSite = {
	name: string;
	frame: PlanFrame;
	/** Frame size in plan units. */
	width: number;
	height: number;
	metresPerUnit: number;
	/** Every feature except zones, in file order (the order QGIS draws them, bottom first). */
	features: PlanShape[];
	zones: PlanZone[];
	/** The extent of everything drawn, in plan units. */
	bounds: PlanBounds;
};

/** A path or tree without a size in the data draws at these. */
const DEFAULT_PATH_WIDTH_M = 2;
const DEFAULT_TREE_RADIUS_M = 3;

/** Drops a ring's closing point, which repeats the first. */
function openRing(ring: readonly PlanPoint[]): PlanPoint[] {
	const [first] = ring;
	const last = ring[ring.length - 1];
	return first && last && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : [...ring];
}

/** A zone's rings projected for drawing. The closing position is dropped by its count, not compared. */
export function projectParts(geometry: ZoneGeometry, frame: PlanFrame): PlanParts {
	return partsOf(geometry).map(rings =>
		rings.map(ring => {
			const open: PlanPoint[] = new Array(ring.length - 1);
			for (let i = 0; i < ring.length - 1; i++) open[i] = toPlan(ring[i]!, frame);
			return open;
		})
	);
}

export type ZoneInput = {
	id: string;
	zoneId?: string;
	code?: string;
	name: string;
	geometry: ZoneGeometry;
	/** The server's point inside the zone; the pill sits there. Without it the plan finds an inside point. */
	displayAnchor?: LngLat;
};

/** One zone projected onto a plan, ready to draw. */
export function projectZone(zone: ZoneInput, frame: PlanFrame): PlanZone {
	const parts = projectParts(zone.geometry, frame);
	return {
		id: zone.id,
		...(zone.zoneId ? { zoneId: zone.zoneId } : {}),
		...(zone.code ? { code: zone.code } : {}),
		name: zone.name,
		geometry: zone.geometry,
		parts,
		centroid: partsCentroid(parts),
		labelAnchor: zone.displayAnchor ? toPlan(zone.displayAnchor, frame) : interiorAnchor(parts)
	};
}

/** The plan box around a zone's outer edges. */
export function zoneBounds(zone: Pick<PlanZone, "parts">): PlanBounds {
	return boundsOf(
		(function* () {
			for (const rings of zone.parts) yield* rings[0] ?? [];
		})()
	);
}

/**
 * Projects a site onto its plan: polygons as point lists, paths as lines with a width, trees as circles, and
 * zones with every part and hole and the label anchor their pills need. Sizes in metres become plan units.
 */
export function projectSite(collection: SiteCollection): ProjectedSite {
	const frame = collection.frame ?? fitFrame(collection.features);
	const project = (position: LngLat) => toPlan(position, frame);
	const units = (metres: number) => metres / frame.metresPerUnit;

	const features: PlanShape[] = [];
	const zones: PlanZone[] = [];
	let bounds: PlanBounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
	const grow = (points: Iterable<PlanPoint>) => {
		const box = boundsOf(points);
		bounds = {
			minX: Math.min(bounds.minX, box.minX),
			minY: Math.min(bounds.minY, box.minY),
			maxX: Math.max(bounds.maxX, box.maxX),
			maxY: Math.max(bounds.maxY, box.maxY)
		};
	};

	for (const { properties, geometry } of collection.features) {
		const base: ShapeBase = { id: properties.id, ...(properties.name ? { name: properties.name } : {}) };

		if (properties.kind === "zone") {
			if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") continue;
			const zone = projectZone(
				{
					id: properties.zone_id ?? properties.id,
					...(properties.zone_id ? { zoneId: properties.zone_id } : {}),
					...(properties.code ? { code: properties.code } : {}),
					name: properties.name ?? properties.id,
					geometry,
					...(properties.display_anchor ? { displayAnchor: properties.display_anchor } : {})
				},
				frame
			);
			zones.push(zone);
			const box = zoneBounds(zone);
			grow([
				[box.minX, box.minY],
				[box.maxX, box.maxY]
			]);
			continue;
		}

		if (geometry.type === "Polygon") {
			const rings = geometry.coordinates.map(ring => openRing(ring.map(project)));
			features.push({
				...base,
				type: "polygon",
				kind: properties.kind,
				rings,
				...(properties.source_kind ? { sourceKind: properties.source_kind } : {})
			});
			grow(rings[0]!);
		} else if (geometry.type === "LineString" && properties.kind === "path") {
			const points = geometry.coordinates.map(project);
			features.push({
				...base,
				type: "line",
				kind: "path",
				points,
				width: units(properties.width_m ?? DEFAULT_PATH_WIDTH_M)
			});
			grow(points);
		} else if (geometry.type === "Point" && properties.kind === "tree") {
			const center = project(geometry.coordinates);
			const radius = units(properties.radius_m ?? DEFAULT_TREE_RADIUS_M);
			features.push({ ...base, type: "circle", kind: "tree", center, radius });
			grow([
				[center[0] - radius, center[1] - radius],
				[center[0] + radius, center[1] + radius]
			]);
		}
	}

	return {
		name: collection.name,
		frame,
		width: frame.width,
		height: frame.height,
		metresPerUnit: frame.metresPerUnit,
		features,
		zones,
		bounds: bounds.minX <= bounds.maxX ? bounds : { minX: 0, minY: 0, maxX: frame.width, maxY: frame.height }
	};
}

/** The zone a point falls in, if any. Holes are not part of their zone. */
export function zoneAt(site: ProjectedSite, point: PlanPoint): PlanZone | undefined {
	return site.zones.find(zone => pointInParts(point, zone.parts));
}

/* ── Scale ────────────────────────────────────────────────────────────────── */

/** Round distances a scale bar may show, in metres. */
const SCALE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

/** The bar length a scale chip aims for, in CSS pixels. */
const SCALE_TARGET_PX = 56;

export type ScaleChip = { metres: number; label: string; px: number };

/**
 * The scale bar for a plan drawn `widthPx` wide across `planWidthMetres` of ground at `zoom`: the round
 * distance whose bar comes closest to a comfortable length, and that bar's length in pixels.
 */
export function scaleChip(widthPx: number, planWidthMetres: number, zoom = 1): ScaleChip {
	const pxPerMetre = (widthPx * zoom) / planWidthMetres;
	let metres = SCALE_STEPS[0]!;
	let bestFit = Infinity;
	for (const step of SCALE_STEPS) {
		const fit = Math.abs(Math.log((step * pxPerMetre) / SCALE_TARGET_PX));
		if (fit < bestFit) {
			bestFit = fit;
			metres = step;
		}
	}
	const label = metres >= 1000 ? `0–${metres / 1000} km` : `0–${metres} m`;
	return { metres, label, px: Math.round(metres * pxPerMetre) };
}
