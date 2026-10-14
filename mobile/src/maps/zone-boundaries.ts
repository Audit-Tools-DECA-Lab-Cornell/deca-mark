import type { Coordinate } from "../domain/observation";
import type { SiteZone } from "./sample-site";
export type Ring = readonly Coordinate[];
export type PolygonRings = readonly Ring[];
export class ZoneGeometryError extends Error {
  readonly name = "ZoneGeometryError";
  constructor() {
    super("The zone has no usable full boundary.");
  }
}
/** Full zone geometry is required; a navigation box never establishes coverage. */
export function zoneRings(zone: SiteZone): PolygonRings {
  if (zone.polygon && zone.polygon.length > 0 && (zone.polygon[0]?.length ?? 0) >= 3)
    return zone.polygon;
  throw new ZoneGeometryError();
}

/** Every part of a zone: its shape, then any further parts of a MultiPolygon drawing. */
export function zoneParts(zone: SiteZone): readonly PolygonRings[] {
  const first = zoneRings(zone);
  if (!zone.polygon || first !== zone.polygon) return [first];
  return [first, ...(zone.moreParts ?? []).filter((part) => (part[0]?.length ?? 0) >= 3)];
}

/** Ray casting on one ring. A point exactly on an edge may fall either way, as for any ray cast. */
function inRing(point: Coordinate, ring: Ring): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const [xi, yi] = a;
    const [xj, yj] = b;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(point: Coordinate, rings: PolygonRings): boolean {
  const [outer, ...holes] = rings;
  if (!outer || !inRing(point, outer)) return false;
  return !holes.some((hole) => inRing(point, hole));
}

export function pointInZone(point: Coordinate, zone: SiteZone): boolean {
  return zoneParts(zone).some((rings) => pointInPolygon(point, rings));
}

const EPSILON = 2 ** -53;
// Shewchuk's first orient2d error bound: a sign outside it is certain.
const ORIENTATION_BOUND = (3 + 16 * EPSILON) * EPSILON;

/** A finite double as an integer times a power of two, exactly. */
function exactParts(value: number): { mantissa: bigint; exponent: number } {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const high = view.getUint32(0);
  const sign = high >>> 31 === 1 ? -1n : 1n;
  const biased = (high >>> 20) & 0x7ff;
  const fraction = (BigInt(high & 0xfffff) << 32n) | BigInt(view.getUint32(4));
  if (biased === 0) return { mantissa: sign * fraction, exponent: -1074 };
  return { mantissa: sign * (fraction | (1n << 52n)), exponent: biased - 1075 };
}

function exactOrientation(a: Coordinate, b: Coordinate, point: Coordinate): number {
  const ax = exactParts(a[0]);
  const ay = exactParts(a[1]);
  const bx = exactParts(b[0]);
  const by = exactParts(b[1]);
  const px = exactParts(point[0]);
  const py = exactParts(point[1]);
  let least = 0;
  for (const part of [ax, ay, bx, by, px, py])
    if (part.mantissa !== 0n) least = Math.min(least, part.exponent);
  const integer = (part: ReturnType<typeof exactParts>) =>
    part.mantissa << BigInt(part.exponent - least);
  const det =
    (integer(ax) - integer(px)) * (integer(by) - integer(py)) -
    (integer(ay) - integer(py)) * (integer(bx) - integer(px));
  return det > 0n ? 1 : det < 0n ? -1 : 0;
}

/** 1 left of a→b, -1 right, 0 exactly on the line, without a membership tolerance. */
function orientation(a: Coordinate, b: Coordinate, point: Coordinate): number {
  const left = (a[0] - point[0]) * (b[1] - point[1]);
  const right = (a[1] - point[1]) * (b[0] - point[0]);
  const det = left - right;
  const bound = ORIENTATION_BOUND * (Math.abs(left) + Math.abs(right));
  // The bound assumes no underflow; subnormal products can give collinear points a false sign.
  if (bound >= 2 ** -1022) {
    if (det > bound) return 1;
    if (-det > bound) return -1;
  }
  return exactOrientation(a, b, point);
}

function onSegment(point: Coordinate, a: Coordinate, b: Coordinate): boolean {
  if (point[0] < Math.min(a[0], b[0]) || point[0] > Math.max(a[0], b[0])) return false;
  if (point[1] < Math.min(a[1], b[1]) || point[1] > Math.max(a[1], b[1])) return false;
  return orientation(a, b, point) === 0;
}

/** Boundary, inside or outside by exact orientation and winding number; either ring direction works. */
function ringPlace(point: Coordinate, ring: Ring): "boundary" | "inside" | "outside" {
  let winding = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    if (!a || !b) continue;
    if (onSegment(point, a, b)) return "boundary";
    if (a[1] <= point[1]) {
      if (b[1] > point[1] && orientation(a, b, point) > 0) winding += 1;
    } else if (b[1] <= point[1] && orientation(a, b, point) < 0) winding -= 1;
  }
  return winding === 0 ? "outside" : "inside";
}

/** Closed coverage, matching the server: hole boundaries count, hole interiors do not. */
export function zoneCovers(point: Coordinate, zone: SiteZone): boolean {
  return zoneParts(zone).some(([outer, ...holes]) => {
    if (!outer) return false;
    const place = ringPlace(point, outer);
    return (
      place === "boundary" ||
      (place === "inside" && holes.every((hole) => ringPlace(point, hole) !== "inside"))
    );
  });
}

/** The zone a point falls in, the session's own zone first when zones overlap. */
export function zoneAt(
  point: Coordinate,
  zones: readonly SiteZone[],
  preferred?: SiteZone | null,
): SiteZone | null {
  if (preferred && pointInZone(point, preferred)) return preferred;
  return zones.find((zone) => pointInZone(point, zone)) ?? null;
}
