import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Coordinate } from "../domain/observation";
import { metresPerPixel } from "./clustering";
import { coveringZones, nearEdge } from "./geometry";
import type { SiteZone } from "./sample-site";

/**
 * MOB-31: the placement candidates (`coveringZones`, over the shared `zoneCovers`) against the contract
 * cases (`contracts/zones/geometry.cases.json`, `coverage_cases`), compared as unordered sets and with
 * the save rule, then shared vertices beyond them, and the UI-only near-edge hint's threshold at the
 * zooms an observer uses.
 */

const position = z.tuple([z.number(), z.number()]);
const ring = z.array(position).min(4);
const geometry = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: z.array(ring).min(1) }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(z.array(ring).min(1)).min(1) }),
]);
const casesSchema = z.object({
  geometries: z.record(z.string(), z.unknown()),
  coverage_cases: z
    .array(
      z.object({
        id: z.string(),
        zones: z.array(z.string()).min(1),
        point: position,
        covering: z.array(z.string()),
        selected: z.string(),
        accepted: z.boolean(),
      }),
    )
    .min(1),
});

const cases = casesSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../../contracts/zones/geometry.cases.json", import.meta.url), "utf8"),
  ),
);

/** A zone from one rings array per part, with its box worked out (never used for attribution). */
function zone(id: string, parts: readonly (readonly (readonly Coordinate[])[])[]): SiteZone {
  const outers = parts.flatMap((part) => part[0] ?? []);
  const xs = outers.map(([x]) => x);
  const ys = outers.map(([, y]) => y);
  const [west, south, east, north] = [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];
  const [first = [], ...more] = parts;
  const centre: Coordinate = [(west + east) / 2, (south + north) / 2];
  return {
    id,
    zoneId: `zone:${id}`,
    label: id,
    centre,
    displayAnchor: centre,
    west,
    south,
    east,
    north,
    polygon: first,
    ...(more.length > 0 ? { moreParts: more } : {}),
  };
}

/** The contract geometry named `name`, as a collector zone. */
function contractZone(name: string): SiteZone {
  const parsed = geometry.parse(cases.geometries[name]);
  return zone(name, parsed.type === "Polygon" ? [parsed.coordinates] : parsed.coordinates);
}

const ids = (zones: readonly SiteZone[]) => zones.map((item) => item.id).sort();

describe("coverage_cases", () => {
  for (const scenario of cases.coverage_cases) {
    it(scenario.id, () => {
      // Given the case's zones, in its own order.
      const zones = scenario.zones.map(contractZone);
      // When the collector asks which zones cover the point.
      const covering = coveringZones(scenario.point, zones);
      // Then the set matches the contract, and the chosen zone is accepted only when it covers the point.
      expect(ids(covering)).toEqual([...scenario.covering].sort());
      expect(covering.some((item) => item.id === scenario.selected)).toBe(scenario.accepted);
    });
  }
});

/** The next double above a positive `value`, or below a negative one (one unit in the last place). */
function nextUp(value: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) + 1n);
  return view.getFloat64(0);
}

describe("shared vertices and boundaries beyond the contract cases", () => {
  const a: Coordinate = [-76.48613, 42.44801];
  const b: Coordinate = [-76.48407, 42.44897];
  // Two triangles sharing the diagonal a–b, which is not axis-aligned and not exactly representable.
  const below = zone("below", [[[a, [b[0], a[1]], b, a]]]);
  const above = zone("above", [[[a, b, [a[0], b[1]], a]]]);

  it("a point on the diagonal's own vertices is in both triangles", () => {
    expect(ids(coveringZones(a, [below, above]))).toEqual(["above", "below"]);
    expect(ids(coveringZones(b, [above, below]))).toEqual(["above", "below"]);
  });

  it("three zones meeting at one vertex all cover it, and only it", () => {
    const left = zone("left", [
      [
        [
          [0, 0],
          [0.005, 0],
          [0.005, 0.01],
          [0, 0.01],
          [0, 0],
        ],
      ],
    ]);
    const lowerRight = zone("lower-right", [
      [
        [
          [0.005, 0],
          [0.01, 0],
          [0.01, 0.005],
          [0.005, 0.005],
          [0.005, 0],
        ],
      ],
    ]);
    const upperRight = zone("upper-right", [
      [
        [
          [0.005, 0.005],
          [0.01, 0.005],
          [0.01, 0.01],
          [0.005, 0.01],
          [0.005, 0.005],
        ],
      ],
    ]);
    const zones = [left, lowerRight, upperRight];
    expect(ids(coveringZones([0.005, 0.005], zones))).toEqual([
      "left",
      "lower-right",
      "upper-right",
    ]);
    expect(ids(coveringZones([nextUp(0.005), 0.005], zones))).toEqual([
      "lower-right",
      "upper-right",
    ]);
  });

  it("an open ring and a closed ring of the same shape cover the same points", () => {
    const closed = contractZone("square");
    const open = zone("open", [[(closed.polygon?.[0] ?? []).slice(0, -1)]]);
    for (const point of [
      [0, 0],
      [0, 0.005],
      [0.005, 0.005],
      [0.01, 0.01],
      [0.010000000001, 0.005],
    ] as Coordinate[])
      expect(coveringZones(point, [open]).length).toBe(coveringZones(point, [closed]).length);
  });

  it("a zone without a drawn boundary covers nothing: its box never stands in", () => {
    const boxOnly: SiteZone = {
      id: "box",
      zoneId: "zone:box",
      label: "Box",
      centre: [0.005, 0.005],
      displayAnchor: [0.005, 0.005],
      west: 0,
      south: 0,
      east: 0.01,
      north: 0.01,
      polygon: [],
    };
    expect(coveringZones([0.005, 0.005], [boxOnly])).toEqual([]);
    expect(nearEdge([0.005, 0.005], [boxOnly], 1)).toBeNull();
  });
});

describe("nearEdge", () => {
  // Two lawns sharing the meridian at `edge`, near the Riverside site.
  const latitude = 42.448;
  const edge = -76.485;
  const west = zone("west", [
    [
      [
        [-76.486, 42.4475],
        [edge, 42.4475],
        [edge, 42.4485],
        [-76.486, 42.4485],
        [-76.486, 42.4475],
      ],
    ],
  ]);
  const east = zone("east", [
    [
      [
        [edge, 42.4475],
        [-76.484, 42.4475],
        [-76.484, 42.4485],
        [edge, 42.4485],
        [edge, 42.4475],
      ],
    ],
  ]);
  const metresPerDegree = 111320 * Math.cos((latitude * Math.PI) / 180);
  /** A point `metres` west of the shared edge, inside the west lawn. */
  const westOfEdge = (metres: number): Coordinate => [edge - metres / metresPerDegree, latitude];

  for (const zoom of [18, 20.5, 22]) {
    it(`flags the other zone's edge within 8 points at zoom ${zoom}, and nothing beyond`, () => {
      const perPoint = metresPerPixel(zoom, latitude);
      const limit = perPoint * 8;
      // Inside the west lawn, close to the east lawn: the east lawn is the one to check.
      expect(nearEdge(westOfEdge(limit * 0.9), [west, east], perPoint)?.id).toBe("east");
      expect(nearEdge(westOfEdge(limit * 0.9), [east, west], perPoint)?.id).toBe("east");
      expect(nearEdge(westOfEdge(limit * 1.1), [west, east], perPoint)).toBeNull();
      // The hint never changes the candidates.
      expect(ids(coveringZones(westOfEdge(limit * 0.9), [west, east]))).toEqual(["west"]);
    });
  }

  it("names the covering zone when only its own edge is close (a gap or the site beyond)", () => {
    const perPoint = metresPerPixel(20.5, latitude);
    expect(nearEdge(westOfEdge(perPoint * 4), [west], perPoint)?.id).toBe("west");
  });

  it("counts hole edges", () => {
    const holed = contractZone("holed");
    // 8 points are 10 cm here. A tenth of a micro-degree (about 1 cm) west of the hole's west edge
    // (x = 0.003) is close to it; the middle of the solid band (x = 0.0015) is 167 m from every edge.
    const perPoint = 0.0125;
    expect(nearEdge([0.003 - 0.0000001, 0.005], [holed], perPoint)?.id).toBe("holed");
    expect(nearEdge([0.0015, 0.005], [holed], perPoint)).toBeNull();
  });
});
