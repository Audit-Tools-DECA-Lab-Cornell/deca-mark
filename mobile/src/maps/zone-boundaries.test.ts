import { expect, it } from "vitest";
import { z } from "zod";
import authored from "../../../contracts/zones/geometry.cases.json";
import { type Coordinate, coordinateSchema } from "../domain/observation";
import type { SiteZone } from "./sample-site";
import { type PolygonRings, zoneCovers, zoneRings } from "./zone-boundaries";

const polygon = z.array(z.array(coordinateSchema));
const shape = z.discriminatedUnion("type", [
  z.object({ type: z.literal("Polygon"), coordinates: polygon }),
  z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(polygon) }),
]);
const cases = z
  .array(
    z.object({
      id: z.string(),
      zones: z.array(z.string()),
      point: coordinateSchema,
      covering: z.array(z.string()),
    }),
  )
  .parse(authored.coverage_cases);
const geometries = new Map(Object.entries(authored.geometries));
function zone(id: string): SiteZone {
  const geometry = shape.parse(geometries.get(id));
  const parts = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const first = parts[0];
  if (!first) throw new Error("Geometry has no parts");
  return {
    id,
    zoneId: id,
    label: id,
    centre: [0, 0],
    displayAnchor: [0, 0],
    west: 0,
    south: 0,
    east: 0.01,
    north: 0.01,
    polygon: first,
    moreParts: parts.slice(1),
  };
}
it.each(cases)("matches server closed coverage for $id", (scenario) => {
  expect(scenario.zones.filter((id) => zoneCovers(scenario.point, zone(id))).sort()).toEqual(
    [...scenario.covering].sort(),
  );
});
it("refuses empty full geometry rather than turning a navigation box into a boundary", () => {
  expect(() => zoneRings({ ...zone("square"), polygon: [] })).toThrow("full boundary");
});

/** Independent oracle: every finite double is an integer over the same denominator, 2^1100. */
function numerator(value: number): bigint {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const unsigned =
    exponent === 0 ? fraction << 26n : ((1n << 52n) | fraction) << BigInt(exponent + 25);
  return bits >> 63n === 0n ? unsigned : -unsigned;
}

function exactSide(a: Coordinate, b: Coordinate, point: Coordinate): number {
  const ax = numerator(a[0]);
  const ay = numerator(a[1]);
  const bx = numerator(b[0]);
  const by = numerator(b[1]);
  const px = numerator(point[0]);
  const py = numerator(point[1]);
  const determinant = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  return determinant > 0n ? 1 : determinant < 0n ? -1 : 0;
}

/** The next representable double toward positive infinity, including for negative coordinates. */
function nextUp(value: number): number {
  if (value === 0) return Number.MIN_VALUE;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  view.setBigUint64(0, view.getBigUint64(0) + (value > 0 ? 1n : -1n));
  return view.getFloat64(0);
}

function drawnZone(id: string, polygon: PolygonRings): SiteZone {
  return { ...zone("square"), id, zoneId: id, label: id, polygon, moreParts: [] };
}

function expectExactCandidates(
  point: Coordinate,
  a: Coordinate,
  b: Coordinate,
  left: SiteZone,
  right: SiteZone,
): void {
  const side = exactSide(a, b, point);
  const expected = side > 0 ? [left.id] : side < 0 ? [right.id] : [left.id, right.id].sort();
  expect(
    [left, right]
      .filter((candidate) => zoneCovers(point, candidate))
      .map(({ id }) => id)
      .sort(),
    `exact side ${side} at [${point[0]}, ${point[1]}]`,
  ).toEqual(expected);
}

it("follows the exact side of Fall Creek's shared diagonal for 399 samples and their next doubles", () => {
  const a: Coordinate = [-76.48613, 42.44801];
  const b: Coordinate = [-76.48407, 42.44897];
  const above = drawnZone("above", [[a, b, [a[0], b[1]], a]]);
  const below = drawnZone("below", [[a, [b[0], a[1]], b, a]]);
  for (let index = 1; index < 400; index += 1) {
    const fraction = index / 400;
    const point: Coordinate = [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction];
    for (const sample of [
      point,
      [point[0], nextUp(point[1])],
      [nextUp(point[0]), point[1]],
    ] as Coordinate[])
      expectExactCandidates(sample, a, b, above, below);
  }
});

it("follows the exact side across Kettner's 64 by 64 grid of adjacent doubles", () => {
  const a: Coordinate = [-11.5, -11.5];
  const b: Coordinate = [24, 24];
  const left = drawnZone("left", [[a, b, [a[0], b[1]], a]]);
  const right = drawnZone("right", [[a, [b[0], a[1]], b, a]]);
  for (let x = 0; x < 64; x += 1)
    for (let y = 0; y < 64; y += 1)
      expectExactCandidates([0.5 + x * 2 ** -53, 0.5 + y * 2 ** -53], a, b, left, right);
});

it("covers only the upper triangle one double above y = x at 0.0037", () => {
  const a: Coordinate = [0, 0];
  const b: Coordinate = [0.01, 0.01];
  const upper = drawnZone("upper", [[a, b, [a[0], b[1]], a]]);
  const lower = drawnZone("lower", [[a, [b[0], a[1]], b, a]]);
  const point: Coordinate = [0.0037, nextUp(0.0037)];
  expect(exactSide(a, b, point)).toBe(1);
  expectExactCandidates(point, a, b, upper, lower);
});

it("keeps exactly collinear points on both triangles when determinant products underflow", () => {
  const scale = 2 ** -541;
  const a: Coordinate = [-(2 ** 52) * scale, -3 * 2 ** 52 * scale];
  const b: Coordinate = [(2 ** 52 - 20) * scale, 3 * (2 ** 52 - 20) * scale];
  const point: Coordinate = [(2 ** 52 - 22) * scale, 3 * (2 ** 52 - 22) * scale];
  const left = drawnZone("left", [[a, b, [a[0], b[1]], a]]);
  const right = drawnZone("right", [[a, [b[0], a[1]], b, a]]);
  expect(exactSide(a, b, point)).toBe(0);
  expectExactCandidates(point, a, b, left, right);
});
