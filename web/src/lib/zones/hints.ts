import {
	type DraftZone,
	openLength,
	partsOf,
	type PolygonRings,
	type Position,
	type Ring,
	type VertexAddress
} from "./geometry";

/**
 * Help while editing: snapping to exact points, tracing a neighbour's edge, and local hints about problems.
 * None of it is authoritative. The server validates topology without tolerance (contract "Geometry"), so
 * hints are labelled "Found while editing", and snapping only ever copies an existing number pair: a point
 * computed on a segment is not exactly on it in floating point, and would make a sliver the server refuses.
 *
 * Hints work in longitude and latitude directly. Crossing and containment are unchanged by the plan's
 * projection, which is affine for one site, so nothing here goes through the plan.
 */

type XY = readonly [number, number];

/* ── Snapping ─────────────────────────────────────────────────────────────── */

/** Where a snap candidate comes from: a draft zone's point, or the site boundary's. */
export type SnapSource =
	| ({ readonly kind: "zone"; readonly zoneId: string } & VertexAddress)
	| ({ readonly kind: "site"; readonly feature: number } & VertexAddress);

export type SnapCandidate = {
	readonly position: Position;
	/** Where the point is drawn, in plan units, for measuring distance on screen. */
	readonly plan: XY;
	readonly source: SnapSource;
};

export type SnapIndex = {
	readonly cellSize: number;
	readonly items: readonly SnapCandidate[];
	/** Each cell's candidates, as indexes into `items` in the order they were added. */
	readonly cells: ReadonlyMap<string, readonly number[]>;
};

const cellKey = (x: number, y: number) => `${x},${y}`;

/**
 * A grid over every candidate, so finding the nearest point under a pointer looks at a few cells rather
 * than up to 20,000 points (the contract's package bound). `cellSize` is in plan units; the snap radius on
 * screen, converted at the current zoom, is a good choice.
 */
export function createSnapIndex(candidates: Iterable<SnapCandidate>, cellSize: number): SnapIndex {
	const size = cellSize > 0 && Number.isFinite(cellSize) ? cellSize : 1;
	const items = [...candidates];
	const cells = new Map<string, number[]>();
	items.forEach((candidate, order) => {
		const key = cellKey(Math.floor(candidate.plan[0] / size), Math.floor(candidate.plan[1] / size));
		const cell = cells.get(key);
		if (cell) cell.push(order);
		else cells.set(key, [order]);
	});
	return { cellSize: size, items, cells };
}

/**
 * The candidate nearest a plan point within `radius` plan units, or null. Ties go to the candidate added
 * first, so the same pointer always snaps to the same point. `skip` leaves out the point being moved.
 */
export function nearestCandidate(
	index: SnapIndex,
	[px, py]: XY,
	radius: number,
	skip?: (candidate: SnapCandidate) => boolean
): SnapCandidate | null {
	const reach = Math.ceil(radius / index.cellSize);
	const cx = Math.floor(px / index.cellSize);
	const cy = Math.floor(py / index.cellSize);
	let best = -1;
	let bestDistance = radius * radius;
	for (let x = cx - reach; x <= cx + reach; x++) {
		for (let y = cy - reach; y <= cy + reach; y++) {
			for (const order of index.cells.get(cellKey(x, y)) ?? []) {
				const candidate = index.items[order]!;
				if (skip?.(candidate)) continue;
				const dx = candidate.plan[0] - px;
				const dy = candidate.plan[1] - py;
				const distance = dx * dx + dy * dy;
				if (distance < bestDistance || (distance === bestDistance && (best < 0 || order < best))) {
					best = order;
					bestDistance = distance;
				}
			}
		}
	}
	return best < 0 ? null : index.items[best]!;
}

/** Every open-ring point of the given zones, and of the site boundary's rings, as snap candidates. */
export function snapCandidates(
	zones: readonly DraftZone[],
	site: readonly PolygonRings[],
	project: (position: Position) => XY
): SnapCandidate[] {
	const candidates: SnapCandidate[] = [];
	for (const zone of zones) {
		partsOf(zone.geometry).forEach((rings, part) =>
			rings.forEach((ring, ringIndex) => {
				for (let index = 0; index < openLength(ring); index++) {
					const position = ring[index]!;
					candidates.push({
						position,
						plan: project(position),
						source: { kind: "zone", zoneId: zone.zone_id, part, ring: ringIndex, index }
					});
				}
			})
		);
	}
	site.forEach((rings, feature) =>
		rings.forEach((ring, ringIndex) => {
			for (let index = 0; index < openLength(ring); index++) {
				const position = ring[index]!;
				candidates.push({
					position,
					plan: project(position),
					source: { kind: "site", feature, part: 0, ring: ringIndex, index }
				});
			}
		})
	);
	return candidates;
}

/* ── Tracing ──────────────────────────────────────────────────────────────── */

/**
 * The points strictly between two points of one ring, walking forward (1) or backward (−1) through the open
 * ring and round its start. They are the ring's own position arrays, so a zone that traces its neighbour's
 * edge shares exactly the same number pairs and leaves no sliver. Empty when the two are neighbours.
 */
export function traceRing(ring: Ring, from: number, to: number, direction: 1 | -1): Position[] {
	const length = openLength(ring);
	if (length === 0 || from === to) return [];
	const between: Position[] = [];
	for (
		let index = (from + direction + length) % length;
		index !== to;
		index = (index + direction + length) % length
	) {
		between.push(ring[index]!);
		if (between.length > length) return [];
	}
	return between;
}

/* ── Hints ────────────────────────────────────────────────────────────────── */

function orientation(a: XY, b: XY, c: XY): number {
	const value = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
	return value > 0 ? 1 : value < 0 ? -1 : 0;
}

function onSegment(a: XY, b: XY, p: XY): boolean {
	return (
		Math.min(a[0], b[0]) <= p[0] &&
		p[0] <= Math.max(a[0], b[0]) &&
		Math.min(a[1], b[1]) <= p[1] &&
		p[1] <= Math.max(a[1], b[1])
	);
}

/** Whether two segments meet anywhere, crossing or touching. */
export function segmentsMeet(a: XY, b: XY, c: XY, d: XY): boolean {
	const o1 = orientation(a, b, c);
	const o2 = orientation(a, b, d);
	const o3 = orientation(c, d, a);
	const o4 = orientation(c, d, b);
	if (o1 !== o2 && o3 !== o4) return true;
	return (
		(o1 === 0 && onSegment(a, b, c)) ||
		(o2 === 0 && onSegment(a, b, d)) ||
		(o3 === 0 && onSegment(c, d, a)) ||
		(o4 === 0 && onSegment(c, d, b))
	);
}

/**
 * Where a ring's edge meets itself: pairs of edges that are not neighbours yet cross or touch, named by the
 * point each starts at. A repeated point in a row is one point here, so a doubled point is not a crossing;
 * edges that only fold back on a neighbour (a collinear spike) are left to the server.
 */
export function ringCrossings(ring: Ring): { index: number; other: number }[] {
	// Drop consecutive repeats, remembering where each kept point came from.
	const points: XY[] = [];
	const origin: number[] = [];
	const length = openLength(ring);
	for (let index = 0; index < length; index++) {
		const point = ring[index]!;
		const previous = points[points.length - 1];
		if (previous && previous[0] === point[0] && previous[1] === point[1]) continue;
		points.push(point);
		origin.push(index);
	}
	while (points.length > 1) {
		const first = points[0]!;
		const last = points[points.length - 1]!;
		if (first[0] !== last[0] || first[1] !== last[1]) break;
		points.pop();
		origin.pop();
	}
	const n = points.length;
	if (n < 4) return [];
	const segments = points.map((start, index) => {
		const end = points[(index + 1) % n]!;
		return {
			index,
			start,
			end,
			minX: Math.min(start[0], end[0]),
			maxX: Math.max(start[0], end[0]),
			minY: Math.min(start[1], end[1]),
			maxY: Math.max(start[1], end[1])
		};
	});
	// Sweep along x: only segments whose x ranges overlap are compared.
	const order = [...segments].sort((a, b) => a.minX - b.minX);
	const found: { index: number; other: number }[] = [];
	for (let i = 0; i < order.length; i++) {
		const s = order[i]!;
		for (let j = i + 1; j < order.length && order[j]!.minX <= s.maxX; j++) {
			const t = order[j]!;
			const gap = Math.abs(s.index - t.index);
			if (gap <= 1 || gap === n - 1) continue;
			if (t.minY > s.maxY || t.maxY < s.minY) continue;
			if (segmentsMeet(s.start, s.end, t.start, t.end)) {
				const [a, b] = s.index < t.index ? [s.index, t.index] : [t.index, s.index];
				found.push({ index: origin[a]!, other: origin[b]! });
			}
		}
	}
	return found.sort((a, b) => a.index - b.index || a.other - b.other);
}

/** Where a point is against a ring: inside, outside, or on its edge. */
function placeInRing(point: XY, ring: Ring): "inside" | "outside" | "edge" {
	const length = openLength(ring);
	let inside = false;
	for (let i = 0, j = length - 1; i < length; j = i++) {
		const a = ring[i]!;
		const b = ring[j]!;
		if (orientation(a, b, point) === 0 && onSegment(a, b, point)) return "edge";
		if (
			a[1] > point[1] !== b[1] > point[1] &&
			point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
		)
			inside = !inside;
	}
	return inside ? "inside" : "outside";
}

/** Whether a polygon covers a point: inside or on its outer edge, and not inside any hole. */
export function polygonCovers(rings: PolygonRings, point: XY): boolean {
	const [outer, ...holes] = rings;
	if (!outer || placeInRing(point, outer) === "outside") return false;
	return holes.every(hole => placeInRing(point, hole) !== "inside");
}

export type ZoneHint =
	| { code: "self_intersection"; zoneId: string; address: VertexAddress }
	| { code: "hole_outside"; zoneId: string; address: VertexAddress }
	| { code: "outside_site"; zoneId: string; address: VertexAddress };

/**
 * Local hints for one zone (WUI-5): an edge that meets itself, a hole with a point outside its outer edge,
 * and points outside the site boundary. Each names the first point where it was found. Overlaps between
 * parts or zones, and areas too small or collinear, are left to the server.
 */
export function zoneHints(zone: DraftZone, site: readonly PolygonRings[] = []): ZoneHint[] {
	const hints: ZoneHint[] = [];
	partsOf(zone.geometry).forEach((rings, part) => {
		rings.forEach((ring, ringIndex) => {
			const crossing = ringCrossings(ring)[0];
			if (crossing)
				hints.push({
					code: "self_intersection",
					zoneId: zone.zone_id,
					address: { part, ring: ringIndex, index: crossing.other }
				});
			if (ringIndex > 0) {
				const outer = rings[0]!;
				for (let index = 0; index < openLength(ring); index++) {
					if (placeInRing(ring[index]!, outer) === "outside") {
						hints.push({
							code: "hole_outside",
							zoneId: zone.zone_id,
							address: { part, ring: ringIndex, index }
						});
						break;
					}
				}
			}
		});
	});
	if (site.length > 0) {
		search: for (const [part, rings] of partsOf(zone.geometry).entries()) {
			for (const [ringIndex, ring] of rings.entries()) {
				for (let index = 0; index < openLength(ring); index++) {
					const point = ring[index]!;
					if (!site.some(polygon => polygonCovers(polygon, point))) {
						hints.push({
							code: "outside_site",
							zoneId: zone.zone_id,
							address: { part, ring: ringIndex, index }
						});
						break search;
					}
				}
			}
		}
	}
	return hints;
}
