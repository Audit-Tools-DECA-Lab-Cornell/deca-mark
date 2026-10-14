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

function onRing(point: Coordinate, ring: Ring): boolean {
  return ring.some((a, index) => {
    const b = ring[(index + 1) % ring.length];
    if (!b) return false;
    return (
      (b[0] - a[0]) * (point[1] - a[1]) === (b[1] - a[1]) * (point[0] - a[0]) &&
      point[0] >= Math.min(a[0], b[0]) &&
      point[0] <= Math.max(a[0], b[0]) &&
      point[1] >= Math.min(a[1], b[1]) &&
      point[1] <= Math.max(a[1], b[1])
    );
  });
}

/** Closed coverage, matching the server: hole boundaries count, hole interiors do not. */
export function zoneCovers(point: Coordinate, zone: SiteZone): boolean {
  return zoneParts(zone).some(
    ([outer, ...holes]) =>
      outer !== undefined &&
      (onRing(point, outer) ||
        (inRing(point, outer) &&
          holes.every((hole) => onRing(point, hole) || !inRing(point, hole)))),
  );
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
