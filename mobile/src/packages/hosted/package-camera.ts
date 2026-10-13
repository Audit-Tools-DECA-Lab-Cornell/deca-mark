import { z } from "zod";
import type { Coordinate } from "../../domain/observation";
import { bboxSchema, boundGeometrySchema, ringSchema } from "./bound-manifest";
import type { PackageLayers } from "./schemas";

const siteGeometrySchema = z.union([
  boundGeometrySchema,
  z.strictObject({ type: z.literal("Polygon"), coordinates: z.array(ringSchema).min(1) }),
]);
export function packageCamera(layers: PackageLayers): {
  readonly centre: Coordinate;
  readonly bounds: [number, number, number, number];
} {
  const site = layers.ground.features.filter((feature) => feature.properties?.["kind"] === "site");
  if (site.length !== 1) throw new Error("The package must have one site polygon.");
  const geometry = siteGeometrySchema.parse(site[0]?.geometry);
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const polygon of polygons)
    for (const ring of polygon)
      for (const [x, y] of ring) {
        west = Math.min(west, x);
        south = Math.min(south, y);
        east = Math.max(east, x);
        north = Math.max(north, y);
      }
  const bounds = bboxSchema.parse([west, south, east, north]);
  return { bounds, centre: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2] };
}
