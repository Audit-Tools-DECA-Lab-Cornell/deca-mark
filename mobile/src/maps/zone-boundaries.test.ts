import { expect, it } from "vitest";
import { z } from "zod";
import authored from "../../../contracts/zones/geometry.cases.json";
import { coordinateSchema } from "../domain/observation";
import type { SiteZone } from "./sample-site";
import { zoneCovers, zoneRings } from "./zone-boundaries";

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
