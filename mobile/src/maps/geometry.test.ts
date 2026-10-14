import { describe, expect, it } from "vitest";
import type { Coordinate } from "../domain/observation";
import { metresPerPixel } from "./clustering";
import {
  distanceMetres,
  formatCoordinate,
  placementPrecision,
  pointInZone,
  scaleBar,
  zoneAnchor,
  zoneAt,
  zoneBounds,
  zoneFeature,
  zoneSpotlight,
} from "./geometry";
import type { SiteZone } from "./sample-site";
import { siteZones } from "./sample-site";

const [zoneA, zoneB, zoneC] = siteZones as [SiteZone, SiteZone, SiteZone];

/** An L-shaped zone: its box centre lies outside the shape. */
const lShape: SiteZone = {
  zoneId: "practice:L",
  displayAnchor: [-76.4859, 42.4487],
  id: "L",
  label: "Zone L",
  centre: [-76.4855, 42.4485],
  west: -76.486,
  south: 42.448,
  east: -76.485,
  north: 42.449,
  polygon: [
    [
      [-76.486, 42.448],
      [-76.485, 42.448],
      [-76.485, 42.4483],
      [-76.4857, 42.4483],
      [-76.4857, 42.449],
      [-76.486, 42.449],
    ],
  ],
};

describe("zones", () => {
  it("finds the zone a point is in", () => {
    expect(pointInZone(zoneB.centre, zoneB)).toBe(true);
    expect(pointInZone(zoneB.centre, zoneA)).toBe(false);
    expect(zoneAt(zoneC.centre, siteZones)?.id).toBe("C");
    expect(zoneAt([-76.49, 42.44], siteZones)).toBeNull();
  });

  it("prefers the session's zone where zones overlap", () => {
    const overlap: SiteZone = {
      ...zoneC,
      id: "X",
      label: "Zone X",
      north: zoneB.north,
      polygon: zoneB.polygon,
    };
    const point = zoneB.centre;
    expect(zoneAt(point, [zoneB, overlap])?.id).toBe("B");
    expect(zoneAt(point, [zoneB, overlap], overlap)?.id).toBe("X");
  });

  it("uses the drawn polygon, not the box, when the package carries one", () => {
    const notch: Coordinate = [-76.4852, 42.4487];
    expect(notch[0] < lShape.east && notch[1] < lShape.north).toBe(true);
    expect(pointInZone(notch, lShape)).toBe(false);
    expect(pointInZone([-76.4859, 42.4487], lShape)).toBe(true);
  });

  it("stores a whole-zone record at a point inside the zone", () => {
    expect(pointInZone(zoneAnchor(zoneA), zoneA)).toBe(true);
    const anchor = zoneAnchor(lShape);
    expect(pointInZone(anchor, lShape)).toBe(true);
  });

  it("stores a two-part zone's record inside a part, not in the gap between them", () => {
    // A thin L whose centroid falls outside it, and a second part far to the north: the box's centre
    // lies in the gap, and lines across the whole zone's extent all pass north of the L.
    const at = (u: number, v: number): Coordinate => [-76.486 + u * 1e-4, 42.448 + v * 1e-4];
    const split: SiteZone = {
      zoneId: "practice:S",
      displayAnchor: at(0.5, 0.5),
      id: "S",
      label: "Zone S",
      centre: at(5, 50),
      west: at(0, 0)[0],
      south: at(0, 0)[1],
      east: at(10, 101)[0],
      north: at(10, 101)[1],
      polygon: [[at(0, 0), at(10, 0), at(10, 1), at(1, 1), at(1, 10), at(0, 10)]],
      moreParts: [[[at(0, 100), at(10, 100), at(10, 101), at(0, 101)]]],
    };
    expect(pointInZone(split.centre, split)).toBe(false);
    expect(pointInZone(zoneAnchor(split), split)).toBe(true);
  });

  it("bounds a zone by its outer ring", () => {
    expect(zoneBounds(lShape)).toEqual([-76.486, 42.448, -76.485, 42.449]);
  });

  it("cuts the zone out of the spotlight and closes every ring", () => {
    const spotlight = zoneSpotlight(zoneB, [-76.487, 42.4466, -76.483, 42.4494]);
    const [outer, hole] = spotlight.geometry.coordinates;
    expect(outer?.[0]).toEqual(outer?.[outer.length - 1]);
    expect(hole?.[0]).toEqual(hole?.[hole.length - 1]);
    const ring = zoneFeature(lShape).geometry.coordinates[0];
    expect(ring?.[0]).toEqual(ring?.[ring.length - 1]);
  });
});

describe("measuring", () => {
  it("measures short distances in metres", () => {
    const a: Coordinate = [-76.485, 42.448];
    expect(distanceMetres(a, [-76.485, 42.448 + 1 / 110540])).toBeCloseTo(1, 3);
    expect(distanceMetres(a, a)).toBe(0);
  });

  it("chooses an honest scale bar that fits", () => {
    for (const zoom of [16, 17.5, 19, 21]) {
      const bar = scaleBar(zoom, 42.448, 88);
      expect(bar.pixels).toBeLessThanOrEqual(88);
      expect(bar.pixels * metresPerPixel(zoom, 42.448)).toBeCloseTo(bar.metres, 6);
      expect(bar.label).toMatch(/^0–[\d.]+ (m|km)$/);
    }
    expect(scaleBar(21, 42.448).metres).toBeLessThan(scaleBar(16, 42.448).metres);
  });

  it("uses MapLibre's 512-point tiles for ground resolution", () => {
    // At the equator and zoom 0 the world's 40,075 km span 512 points.
    expect(metresPerPixel(0, 0)).toBeCloseTo(40075016.686 / 512, 3);
  });

  it("says how finely a point can be placed", () => {
    expect(placementPrecision(20, 42.448)).toMatch(/^1 pt ≈ \d+ cm$/);
    expect(placementPrecision(12, 42.448)).toMatch(/^1 pt ≈ [\d.]+ m$/);
  });

  it("writes coordinates with hemispheres to six decimals", () => {
    expect(formatCoordinate([-76.4850441, 42.4483125])).toBe("42.448313° N, 76.485044° W");
  });
});
