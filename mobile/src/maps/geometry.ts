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

import {
  type PolygonRings,
  pointInPolygon,
  pointInZone,
  zoneParts,
  zoneRings,
} from "./zone-boundaries";

export type { PolygonRings, Ring } from "./zone-boundaries";
export { pointInPolygon, pointInZone, zoneAt, zoneParts, zoneRings } from "./zone-boundaries";

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

/**
 * The point a whole-zone record (an inventory) is stored at: the area centroid of the zone's first
 * part when it lies inside the zone, otherwise the zone's own centre, otherwise a point found inside
 * one of its parts, so the stored point is always one the observer would recognise as "in the zone".
 */
export function zoneAnchor(zone: SiteZone): Coordinate {
  const outer = zoneRings(zone)[0] ?? [];
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const a = outer[j];
    const b = outer[i];
    if (!a || !b) continue;
    const cross = a[0] * b[1] - b[0] * a[1];
    area += cross;
    cx += (a[0] + b[0]) * cross;
    cy += (a[1] + b[1]) * cross;
  }
  if (Math.abs(area) > Number.EPSILON) {
    const centroid: Coordinate = [cx / (3 * area), cy / (3 * area)];
    if (pointInZone(centroid, zone)) return centroid;
  }
  if (pointInZone(zone.centre, zone)) return zone.centre;
  for (const rings of zoneParts(zone)) {
    const inside = interiorPoint(rings);
    if (inside) return inside;
  }
  return zone.centre;
}

/**
 * A point inside a concave polygon (an L, a U) whose centroid falls outside it: the middle of the
 * widest stretch of the shape along a few horizontal lines across its own extent.
 */
function interiorPoint(rings: PolygonRings): Coordinate | null {
  const bounds = extent(rings[0] ?? []);
  if (!bounds) return null;
  const [west, south, east, north] = bounds;
  let best: { readonly point: Coordinate; readonly width: number } | null = null;
  for (const fraction of [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875]) {
    const y = south + (north - south) * fraction;
    const crossings: number[] = [];
    for (const ring of rings)
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i];
        const b = ring[j];
        if (!a || !b || a[1] > y === b[1] > y) continue;
        crossings.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
      }
    crossings.sort((left, right) => left - right);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = crossings[k] ?? west;
      const to = crossings[k + 1] ?? east;
      const point: Coordinate = [(from + to) / 2, y];
      if (to - from > (best?.width ?? 0) && pointInPolygon(point, rings))
        best = { point, width: to - from };
    }
  }
  return best?.point ?? null;
}

/** Metres between two nearby points. */
export function distanceMetres(a: Coordinate, b: Coordinate): number {
  const latitude = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * 111320 * Math.cos(latitude);
  const dy = (b[1] - a[1]) * 110540;
  return Math.hypot(dx, dy);
}

/**
 * A polygon covering the site with the zone cut out of it. Filled with the plan's background at
 * low opacity, it dims everything except the zone being collected, so the eye goes straight to it.
 */
export function zoneSpotlight(zone: SiteZone, site: LngLatBounds, margin = 0.01): Feature<Polygon> {
  const [west, south, east, north] = site;
  const outer: Coordinate[] = [
    [west - margin, south - margin],
    [east + margin, south - margin],
    [east + margin, north + margin],
    [west - margin, north + margin],
    [west - margin, south - margin],
  ];
  const holes = zoneParts(zone).map((rings) => {
    const hole = [...(rings[0] ?? [])];
    const first = hole[0];
    if (first) hole.push(first);
    return hole;
  });
  return {
    type: "Feature",
    properties: { kind: "spotlight", zone: zone.id },
    geometry: { type: "Polygon", coordinates: [outer, ...holes] },
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
