/**
 * Zone geometry as the contract carries it: GeoJSON Polygon or MultiPolygon, 2D `[longitude, latitude]` in
 * EPSG:4326 (`docs/plan/zone-boundaries/contract.md`, Geometry). Longitude and latitude are the only source
 * of truth. The site plan's projection is for drawing; nothing here derives a coordinate from it.
 *
 * Everything is pure and immutable. An edit returns a new geometry that shares every untouched ring and
 * position with the old one, so a position the manager did not move keeps the very same number pair.
 */

export type Position = readonly [lng: number, lat: number];
/** A closed ring: the last position repeats the first. */
export type Ring = readonly Position[];
/** One polygon: its outer edge, then its holes. */
export type PolygonRings = readonly Ring[];

export type ZoneGeometry =
	| { readonly type: "Polygon"; readonly coordinates: PolygonRings }
	| { readonly type: "MultiPolygon"; readonly coordinates: readonly PolygonRings[] };

/**
 * Inclusive input bounds, counting every ring, part and closing position (contract "Input bounds"). A unit
 * test holds them to `contracts/zones/geometry.cases.json` `limit_cases`.
 */
export const ZONE_LIMITS = {
	zones: 250,
	zonePositions: 2000,
	packagePositions: 20_000,
	draftBytes: 4_194_304
} as const;

/** A problem found while reading geometry, with an RFC 6901 pointer into the geometry. */
export type GeometryIssue = { code: "invalid_structure"; path: string; message: string };

export type GeometryRead = { ok: true; geometry: ZoneGeometry } | { ok: false; issues: GeometryIssue[] };

/* ── Reading ──────────────────────────────────────────────────────────────── */

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function readPosition(value: unknown, path: string, issues: GeometryIssue[]): value is Position {
	if (!Array.isArray(value) || value.length !== 2) {
		issues.push({ code: "invalid_structure", path, message: "A point needs exactly a longitude and a latitude." });
		return false;
	}
	const [lng, lat] = value as unknown[];
	if (!isFiniteNumber(lng) || !isFiniteNumber(lat)) {
		issues.push({ code: "invalid_structure", path, message: "A point's longitude and latitude must be numbers." });
		return false;
	}
	if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
		issues.push({
			code: "invalid_structure",
			path,
			message: "A point is outside the range of longitude and latitude."
		});
		return false;
	}
	return true;
}

/** Positions that differ, counting a repeat of an earlier position once. */
export function distinctCount(ring: Ring): number {
	const seen = new Set<string>();
	for (const [lng, lat] of ring) seen.add(`${lng},${lat}`);
	return seen.size;
}

function readRing(value: unknown, path: string, issues: GeometryIssue[]): value is Ring {
	if (!Array.isArray(value)) {
		issues.push({ code: "invalid_structure", path, message: "An edge must be a list of points." });
		return false;
	}
	let ok = true;
	value.forEach((position, index) => {
		if (!readPosition(position, `${path}/${index}`, issues)) ok = false;
	});
	if (!ok) return false;
	const ring = value as Ring;
	if (ring.length < 4) {
		issues.push({
			code: "invalid_structure",
			path,
			message: "An edge needs at least three points and its closing point."
		});
		return false;
	}
	const first = ring[0]!;
	const last = ring[ring.length - 1]!;
	if (first[0] !== last[0] || first[1] !== last[1]) {
		issues.push({ code: "invalid_structure", path, message: "An edge must end where it starts." });
		return false;
	}
	if (distinctCount(ring) < 3) {
		issues.push({ code: "invalid_structure", path, message: "An edge needs at least three different points." });
		return false;
	}
	return true;
}

function readPolygon(value: unknown, path: string, issues: GeometryIssue[]): value is PolygonRings {
	if (!Array.isArray(value) || value.length === 0) {
		issues.push({ code: "invalid_structure", path, message: "A shape needs an outer edge." });
		return false;
	}
	let ok = true;
	value.forEach((ring, index) => {
		if (!readRing(ring, `${path}/${index}`, issues)) ok = false;
	});
	return ok;
}

/**
 * Reads a zone geometry strictly: it is returned exactly as given (the same arrays and numbers), or not at
 * all, with every problem named. Nothing is closed, dropped, rounded or repaired. This is the contract's
 * structural validity: finite 2D in-range coordinates, non-empty components, and closed rings of at least
 * four positions with three distinct vertices. Topology (crossings, holes outside their edge, overlaps) is
 * the server's to validate.
 */
export function readZoneGeometry(value: unknown): GeometryRead {
	const issues: GeometryIssue[] = [];
	if (typeof value !== "object" || value === null) {
		return { ok: false, issues: [{ code: "invalid_structure", path: "", message: "A zone needs a shape." }] };
	}
	const { type, coordinates } = value as { type?: unknown; coordinates?: unknown };
	if (type === "Polygon") {
		if (readPolygon(coordinates, "/coordinates", issues))
			return { ok: true, geometry: { type, coordinates: coordinates as PolygonRings } };
		return { ok: false, issues };
	}
	if (type === "MultiPolygon") {
		if (!Array.isArray(coordinates) || coordinates.length === 0) {
			issues.push({
				code: "invalid_structure",
				path: "/coordinates",
				message: "A shape needs at least one part."
			});
			return { ok: false, issues };
		}
		let ok = true;
		coordinates.forEach((polygon, index) => {
			if (!readPolygon(polygon, `/coordinates/${index}`, issues)) ok = false;
		});
		if (ok) return { ok: true, geometry: { type, coordinates: coordinates as readonly PolygonRings[] } };
		return { ok: false, issues };
	}
	return {
		ok: false,
		issues: [{ code: "invalid_structure", path: "/type", message: "A zone's shape must be an area." }]
	};
}

/* ── Walking ──────────────────────────────────────────────────────────────── */

/** The polygons of a geometry: a Polygon's one, or each part of a MultiPolygon. */
export function partsOf(geometry: ZoneGeometry): readonly PolygonRings[] {
	return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

/** Every position, closing ones included: what the contract's bounds count. */
export function positionCount(geometry: ZoneGeometry): number {
	let count = 0;
	for (const part of partsOf(geometry)) for (const ring of part) count += ring.length;
	return count;
}

export type Extent = { west: number; south: number; east: number; north: number };

/** The longitude/latitude box around every position. Loops, so a large shape never overflows the stack. */
export function extentOf(geometries: Iterable<ZoneGeometry>): Extent | null {
	let west = Infinity;
	let south = Infinity;
	let east = -Infinity;
	let north = -Infinity;
	for (const geometry of geometries) {
		for (const part of partsOf(geometry)) {
			for (const ring of part) {
				for (const [lng, lat] of ring) {
					if (lng < west) west = lng;
					if (lng > east) east = lng;
					if (lat < south) south = lat;
					if (lat > north) north = lat;
				}
			}
		}
	}
	return west <= east ? { west, south, east, north } : null;
}

/** Whether two geometries hold the same type, structure and numbers. */
export function sameGeometry(a: ZoneGeometry, b: ZoneGeometry): boolean {
	if (a === b) return true;
	if (a.type !== b.type) return false;
	const partsA = partsOf(a);
	const partsB = partsOf(b);
	if (partsA.length !== partsB.length) return false;
	for (let p = 0; p < partsA.length; p++) {
		const ringsA = partsA[p]!;
		const ringsB = partsB[p]!;
		if (ringsA === ringsB) continue;
		if (ringsA.length !== ringsB.length) return false;
		for (let r = 0; r < ringsA.length; r++) {
			const ringA = ringsA[r]!;
			const ringB = ringsB[r]!;
			if (ringA === ringB) continue;
			if (ringA.length !== ringB.length) return false;
			for (let i = 0; i < ringA.length; i++) {
				const pa = ringA[i]!;
				const pb = ringB[i]!;
				if (pa !== pb && !(Object.is(pa[0], pb[0]) && Object.is(pa[1], pb[1]))) return false;
			}
		}
	}
	return true;
}

/* ── Addresses ────────────────────────────────────────────────────────────── */

/** A ring of a zone: part 0 for a Polygon; ring 0 is the outer edge, later rings are holes. */
export type RingAddress = { readonly part: number; readonly ring: number };
/** A point of a ring, by its place in the open ring: the closing position is never addressed. */
export type VertexAddress = RingAddress & { readonly index: number };

export function ringAt(geometry: ZoneGeometry, { part, ring }: RingAddress): Ring | undefined {
	return partsOf(geometry)[part]?.[ring];
}

/** Points in a ring without its closing repeat. */
export function openLength(ring: Ring): number {
	return Math.max(0, ring.length - 1);
}

export function vertexAt(geometry: ZoneGeometry, address: VertexAddress): Position | undefined {
	const ring = ringAt(geometry, address);
	if (!ring || address.index < 0 || address.index >= openLength(ring)) return undefined;
	return ring[address.index];
}

/** Every ring of a geometry with its address, in order: each part's outer edge, then its holes. */
export function ringAddresses(geometry: ZoneGeometry): RingAddress[] {
	const addresses: RingAddress[] = [];
	partsOf(geometry).forEach((rings, part) => rings.forEach((_, ring) => addresses.push({ part, ring })));
	return addresses;
}

/* ── Immutable edits ──────────────────────────────────────────────────────── */

/** The geometry with one ring replaced. Every other part and ring is the same object as before. */
export function replaceRing(geometry: ZoneGeometry, { part, ring }: RingAddress, next: Ring): ZoneGeometry {
	const swap = (rings: PolygonRings): PolygonRings =>
		rings.map((current, index) => (index === ring ? next : current));
	if (geometry.type === "Polygon") {
		if (part !== 0) return geometry;
		return { type: "Polygon", coordinates: swap(geometry.coordinates) };
	}
	return {
		type: "MultiPolygon",
		coordinates: geometry.coordinates.map((rings, index) => (index === part ? swap(rings) : rings))
	};
}

/**
 * Moves points of one ring. Moving the first point moves the closing position to the identical pair, so the
 * ring stays closed. Untouched positions keep their very arrays and numbers.
 */
export function moveVertices(
	geometry: ZoneGeometry,
	address: RingAddress,
	moves: ReadonlyMap<number, Position>
): ZoneGeometry {
	const ring = ringAt(geometry, address);
	if (!ring || moves.size === 0) return geometry;
	const last = ring.length - 1;
	const next = ring.map((position, index) => moves.get(index === last ? 0 : index) ?? position);
	return replaceRing(geometry, address, next);
}

export function moveVertex(geometry: ZoneGeometry, address: VertexAddress, position: Position): ZoneGeometry {
	return moveVertices(geometry, address, new Map([[address.index, position]]));
}

/** Inserts a point after `address.index` (before the closing position when it is the last point). */
export function insertVertex(geometry: ZoneGeometry, address: VertexAddress, position: Position): ZoneGeometry {
	const ring = ringAt(geometry, address);
	if (!ring || address.index < 0 || address.index >= openLength(ring)) return geometry;
	const next = [...ring.slice(0, address.index + 1), position, ...ring.slice(address.index + 1)];
	return replaceRing(geometry, address, next);
}

export type EditResult = { ok: true; geometry: ZoneGeometry } | { ok: false; reason: "too_few_points" | "not_found" };

/**
 * Removes a point while its ring keeps at least four positions and three different points. Removing the
 * first point makes the next one first and closes the ring on it.
 */
export function removeVertex(geometry: ZoneGeometry, address: VertexAddress): EditResult {
	const ring = ringAt(geometry, address);
	if (!ring || address.index < 0 || address.index >= openLength(ring)) return { ok: false, reason: "not_found" };
	const open = ring.slice(0, -1).filter((_, index) => index !== address.index);
	const next = [...open, open[0]!];
	if (next.length < 4 || distinctCount(next) < 3) return { ok: false, reason: "too_few_points" };
	return { ok: true, geometry: replaceRing(geometry, address, next) };
}

/** Removes a hole. The outer edge (ring 0) is never removed this way. */
export function removeHole(geometry: ZoneGeometry, { part, ring }: RingAddress): EditResult {
	const rings = partsOf(geometry)[part];
	if (!rings || ring < 1 || ring >= rings.length) return { ok: false, reason: "not_found" };
	const nextRings = rings.filter((_, index) => index !== ring);
	if (geometry.type === "Polygon") return { ok: true, geometry: { type: "Polygon", coordinates: nextRings } };
	return {
		ok: true,
		geometry: {
			type: "MultiPolygon",
			coordinates: geometry.coordinates.map((current, index) => (index === part ? nextRings : current))
		}
	};
}

/** Removes a part of a zone with several. The zone keeps its type and its identity. */
export function removePart(geometry: ZoneGeometry, part: number): EditResult {
	if (geometry.type !== "MultiPolygon" || part < 0 || part >= geometry.coordinates.length)
		return { ok: false, reason: "not_found" };
	if (geometry.coordinates.length < 2) return { ok: false, reason: "too_few_points" };
	return {
		ok: true,
		geometry: { type: "MultiPolygon", coordinates: geometry.coordinates.filter((_, index) => index !== part) }
	};
}

/** Metres per degree of latitude, and of longitude at the equator: the plan uses the same figure. */
export const METRES_PER_DEGREE = 111_320;

/**
 * A position moved a fixed distance on the ground, east and north in metres, using its own latitude. Arrow
 * keys move a point 10 cm, and 1 m with Shift (WUI-8).
 */
export function nudge([lng, lat]: Position, east: number, north: number): Position {
	const cos = Math.cos((lat * Math.PI) / 180);
	return [lng + east / (METRES_PER_DEGREE * cos), lat + north / METRES_PER_DEGREE];
}

/**
 * The closed ring of a rectangle aligned to longitude and latitude, from two opposite corners. Every corner
 * takes its numbers from the two given positions exactly. Counter-clockwise from the south-west corner.
 */
export function rectangleRing(a: Position, b: Position): Ring {
	const west = Math.min(a[0], b[0]);
	const east = Math.max(a[0], b[0]);
	const south = Math.min(a[1], b[1]);
	const north = Math.max(a[1], b[1]);
	return [
		[west, south],
		[east, south],
		[east, north],
		[west, north],
		[west, south]
	];
}

/* ── Draft zones and their structural checks ─────────────────────────────── */

/** A zone as a draft carries it on the wire (contract "Manager drafts", zone entries). */
export type DraftZone = {
	readonly zone_id: string;
	readonly zone_code: string;
	readonly zone_label: string;
	readonly geometry: ZoneGeometry;
};

export type StructureIssueCode =
	| "invalid_structure"
	| "too_complex"
	| "empty_label"
	| "long_label"
	| "invalid_code"
	| "duplicate_code"
	| "duplicate_zone_id"
	| "invalid_zone_id"
	| "long_change_note";

/** A local problem that stops a save: what, which zones, and where (an RFC 6901 pointer into the draft). */
export type StructureIssue = { code: StructureIssueCode; zoneIds: string[]; path: string };

export const LABEL_MAX = 200;
export const CODE_MAX = 100;
export const CHANGE_NOTE_MAX = 2000;
const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
const LOWER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Unicode code points, the unit the contract counts labels and notes in. */
export function codePoints(text: string): number {
	return Array.from(text).length;
}

/** Whether a code fits the contract: case-sensitive ASCII, 1–100 characters, a letter or digit first. */
export function validCode(code: string): boolean {
	return code.length >= 1 && code.length <= CODE_MAX && CODE_PATTERN.test(code);
}

/**
 * The checks that run on every change and block saving (WUI-5): readable structure, the contract's bounds,
 * labels, codes, identities and the change note. Topology is the server's to judge.
 */
export function structureIssues(zones: readonly DraftZone[], changeNote = ""): StructureIssue[] {
	const issues: StructureIssue[] = [];
	if (zones.length > ZONE_LIMITS.zones) issues.push({ code: "too_complex", zoneIds: [], path: "/zones" });
	let total = 0;
	const codes = new Map<string, string[]>();
	const ids = new Map<string, number>();
	zones.forEach((zone, index) => {
		const path = `/zones/${index}`;
		const read = readZoneGeometry(zone.geometry);
		if (!read.ok) {
			issues.push({
				code: "invalid_structure",
				zoneIds: [zone.zone_id],
				path: `${path}/geometry${read.issues[0]!.path}`
			});
		} else {
			const count = positionCount(read.geometry);
			total += count;
			if (count > ZONE_LIMITS.zonePositions)
				issues.push({ code: "too_complex", zoneIds: [zone.zone_id], path: `${path}/geometry` });
		}
		const label = zone.zone_label.trim();
		if (label === "") issues.push({ code: "empty_label", zoneIds: [zone.zone_id], path: `${path}/zone_label` });
		else if (codePoints(label) > LABEL_MAX)
			issues.push({ code: "long_label", zoneIds: [zone.zone_id], path: `${path}/zone_label` });
		if (!validCode(zone.zone_code))
			issues.push({ code: "invalid_code", zoneIds: [zone.zone_id], path: `${path}/zone_code` });
		if (!LOWER_UUID.test(zone.zone_id))
			issues.push({ code: "invalid_zone_id", zoneIds: [zone.zone_id], path: `${path}/zone_id` });
		codes.set(zone.zone_code, [...(codes.get(zone.zone_code) ?? []), zone.zone_id]);
		ids.set(zone.zone_id, (ids.get(zone.zone_id) ?? 0) + 1);
	});
	if (total > ZONE_LIMITS.packagePositions) issues.push({ code: "too_complex", zoneIds: [], path: "/zones" });
	for (const [, owners] of codes)
		if (owners.length > 1) issues.push({ code: "duplicate_code", zoneIds: owners, path: "/zones" });
	for (const [id, count] of ids)
		if (count > 1) issues.push({ code: "duplicate_zone_id", zoneIds: [id], path: "/zones" });
	if (codePoints(changeNote.trim()) > CHANGE_NOTE_MAX)
		issues.push({ code: "long_change_note", zoneIds: [], path: "/change_note" });
	return issues;
}

/** The UTF-8 size of a draft replacement body, which the contract bounds at {@link ZONE_LIMITS.draftBytes}. */
export function draftBodyBytes(zones: readonly DraftZone[], changeNote: string): number {
	return new TextEncoder().encode(JSON.stringify({ zones, change_note: changeNote })).length;
}

/** The draft as the server stores it: labels trimmed and identities lowercased, shapes exactly as given. */
export function normalizeDraftZones(zones: readonly DraftZone[]): DraftZone[] {
	return zones.map(zone => ({
		zone_id: zone.zone_id.toLowerCase(),
		zone_code: zone.zone_code,
		zone_label: zone.zone_label.trim(),
		geometry: zone.geometry
	}));
}

/** Whether two zone lists are the same draft: the same zones in order, after the server's normalisation. */
export function sameZones(a: readonly DraftZone[], b: readonly DraftZone[]): boolean {
	if (a === b) return true;
	if (a.length !== b.length) return false;
	return a.every((zone, index) => {
		const other = b[index]!;
		return (
			zone === other ||
			(zone.zone_id.toLowerCase() === other.zone_id.toLowerCase() &&
				zone.zone_code === other.zone_code &&
				zone.zone_label.trim() === other.zone_label.trim() &&
				sameGeometry(zone.geometry, other.geometry))
		);
	});
}
