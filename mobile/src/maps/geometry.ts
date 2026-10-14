import type { LngLatBounds } from "@maplibre/maplibre-react-native";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { Coordinate } from "../domain/observation";
import { metresPerPixel } from "./clustering";
import type { SiteZone } from "./sample-site";

/**
 * Plane geometry for one playground. Sites are a few hundred metres across, so every calculation
 * here treats longitude and latitude as a flat grid scaled by the latitude's cosine: the error at
 * that size is far below a finger's width, and the functions stay pure and testable without a map.
 */

import { type PolygonRings, ZoneGeometryError, zoneCovers, zoneParts } from "./zone-boundaries";

export type { PolygonRings, Ring } from "./zone-boundaries";
export { pointInPolygon, pointInZone, zoneAt, zoneParts, zoneRings } from "./zone-boundaries";

/* ── Covering zones and the near-edge hint (MOB-31) ──────────────────────────────────────────── */

/** The zone's parts, or none when it has no usable full boundary: a box never stands in for one. */
function drawnParts(zone: SiteZone): readonly PolygonRings[] {
  try {
    return zoneParts(zone);
  } catch (error) {
    if (error instanceof ZoneGeometryError) return [];
    throw error;
  }
}

/**
 * Every zone whose full boundary covers the point, by the server's closed coverage (`zoneCovers`):
 * outer edges, vertices and hole edges count, a hole's inside does not. The order is the package's
 * and means nothing: on a shared edge the observer chooses (contract "Point attribution").
 */
export function coveringZones(point: Coordinate, zones: readonly SiteZone[]): SiteZone[] {
  return zones.filter((zone) => drawnParts(zone).length > 0 && zoneCovers(point, zone));
}

/** Metres from the point to the nearest edge of any of a zone's rings, holes included. */
function edgeDistanceMetres(point: Coordinate, zone: SiteZone): number {
  const scaleX = 111320 * Math.cos((point[1] * Math.PI) / 180);
  const scaleY = 110540;
  let nearest = Number.POSITIVE_INFINITY;
  for (const rings of drawnParts(zone))
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[j];
        const b = ring[i];
        if (!a || !b) continue;
        const ax = (a[0] - point[0]) * scaleX;
        const ay = (a[1] - point[1]) * scaleY;
        const dx = (b[0] - a[0]) * scaleX;
        const dy = (b[1] - a[1]) * scaleY;
        const length = dx * dx + dy * dy;
        const t = length === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length));
        nearest = Math.min(nearest, Math.hypot(ax + t * dx, ay + t * dy));
      }
  return nearest;
}

/**
 * A zone whose edge is within `thresholdPoints` screen points of the point at the map's scale, for the
 * UI-only hint "Close to the edge of Slide. Zoom in to check." A zone that does not cover the point comes
 * first (the point may belong to it), then the nearest. It never changes candidates or validity.
 */
export function nearEdge(
  point: Coordinate,
  zones: readonly SiteZone[],
  metresPerPoint: number,
  thresholdPoints = 8,
): SiteZone | null {
  const limit = metresPerPoint * thresholdPoints;
  const covering = new Set(coveringZones(point, zones));
  let best: {
    readonly zone: SiteZone;
    readonly distance: number;
    readonly covers: boolean;
  } | null = null;
  for (const zone of zones) {
    const distance = edgeDistanceMetres(point, zone);
    if (distance > limit) continue;
    const covers = covering.has(zone);
    const better =
      !best || (best.covers && !covers) || (best.covers === covers && distance < best.distance);
    if (better) best = { zone, distance, covers };
  }
  return best?.zone ?? null;
}

/** West, south, east, north of a set of positions, or `null` when there are none. */
function extent(points: readonly Coordinate[]): LngLatBounds | null {
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    west = Math.min(west, x);
    south = Math.min(south, y);
    east = Math.max(east, x);
    north = Math.max(north, y);
  }
  return Number.isFinite(west) ? [west, south, east, north] : null;
}

/** West, south, east, north of a zone's outer rings. */
export function zoneBounds(zone: SiteZone): LngLatBounds {
  return (
    extent(zoneParts(zone).flatMap((rings) => rings[0] ?? [])) ?? [
      zone.west,
      zone.south,
      zone.east,
      zone.north,
    ]
  );
}

/** Metres between two nearby points. */
export function distanceMetres(a: Coordinate, b: Coordinate): number {
  const latitude = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * 111320 * Math.cos(latitude);
  const dy = (b[1] - a[1]) * 110540;
  return Math.hypot(dx, dy);
}

/**
 * A shape covering the site with the zone cut out of it. Filled with the plan's background at low
 * opacity, it dims everything except the zone being collected, so the eye goes straight to it. The
 * zone's own holes are dimmed too (each a part of its own), so a hole never looks inside the zone.
 */
export function zoneSpotlight(
  zone: SiteZone,
  site: LngLatBounds,
  margin = 0.01,
): Feature<MultiPolygon> {
  const [west, south, east, north] = site;
  const outer: Coordinate[] = [
    [west - margin, south - margin],
    [east + margin, south - margin],
    [east + margin, north + margin],
    [west - margin, north + margin],
    [west - margin, south - margin],
  ];
  const closed = (ring: readonly Coordinate[]): Coordinate[] => {
    const copy = [...ring];
    const first = copy[0];
    const last = copy[copy.length - 1];
    if (first && last && (first[0] !== last[0] || first[1] !== last[1])) copy.push(first);
    return copy;
  };
  const parts = zoneParts(zone);
  const cutOuts = parts.map((rings) => closed(rings[0] ?? []));
  const holes = parts.flatMap((rings) => rings.slice(1).map((hole) => [closed(hole)]));
  return {
    type: "Feature",
    properties: { kind: "spotlight", zone: zone.id },
    geometry: { type: "MultiPolygon", coordinates: [[outer, ...cutOuts], ...holes] },
  };
}

/** One zone's outline as a feature, closed, for the focus outline layer. */
export function zoneFeature(zone: SiteZone): Feature<Polygon | MultiPolygon> {
  const parts = zoneParts(zone).map((rings) =>
    rings.map((ring) => {
      const closed = [...ring];
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first && last && (first[0] !== last[0] || first[1] !== last[1])) closed.push(first);
      return closed;
    }),
  );
  const properties = { kind: "zone", id: zone.id, label: zone.label };
  return parts.length === 1
    ? { type: "Feature", properties, geometry: { type: "Polygon", coordinates: parts[0] ?? [] } }
    : { type: "Feature", properties, geometry: { type: "MultiPolygon", coordinates: parts } };
}

export type ScaleBar = {
  /** The bar's length on screen, in points. */
  readonly pixels: number;
  readonly metres: number;
  /** "0–10 m", as the scale chip reads. */
  readonly label: string;
};

const SCALE_STEPS = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/** The longest round distance whose bar fits in `maxPixels`, so the bar is honest and readable. */
export function scaleBar(zoom: number, latitude: number, maxPixels = 88): ScaleBar {
  const perPixel = metresPerPixel(zoom, latitude);
  const fits = SCALE_STEPS.filter((step) => step / perPixel <= maxPixels);
  const metres = fits[fits.length - 1] ?? SCALE_STEPS[0] ?? 1;
  const pixels = metres / perPixel;
  const distance = metres >= 1000 ? `${metres / 1000} km` : `${metres} m`;
  return { pixels, metres, label: `0–${distance}` };
}

/**
 * How finely a point can be placed at this zoom: the ground covered by one point of the screen, in
 * words. "1 pt ≈ 4 cm" tells an observer whether zooming in would make the point any better.
 */
export function placementPrecision(zoom: number, latitude: number): string {
  const metres = metresPerPixel(zoom, latitude);
  if (metres < 1) return `1 pt ≈ ${Math.max(1, Math.round(metres * 100))} cm`;
  return `1 pt ≈ ${metres < 10 ? metres.toFixed(1) : Math.round(metres)} m`;
}

/** Below this ground resolution the cross is finer than a child's footprint: a sensible minimum. */
export const PRECISE_METRES_PER_PIXEL = 0.12;

/** Six decimals is about 11 cm of latitude: finer than a hand-placed point can be. */
export function formatCoordinate([longitude, latitude]: Coordinate): string {
  const lat = `${Math.abs(latitude).toFixed(6)}° ${latitude >= 0 ? "N" : "S"}`;
  const lng = `${Math.abs(longitude).toFixed(6)}° ${longitude >= 0 ? "E" : "W"}`;
  return `${lat}, ${lng}`;
}
