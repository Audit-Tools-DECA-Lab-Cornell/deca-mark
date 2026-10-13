import { z } from "zod";
import { coordinateSchema } from "../../domain/observation";

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
export const boundFormSchema = z.strictObject({
  form_version_id: z.uuid(),
  form_version: z.string().min(1),
});
export const boundFormsSchema = z.strictObject({
  play: boundFormSchema,
  inventory: boundFormSchema.nullable(),
});
export const bboxSchema = z
  .tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-85).max(85),
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-85).max(85),
  ])
  .refine(
    ([west, south, east, north]) =>
      west < east && south < north && east - west <= 1 && north - south <= 1,
    "Unsupported zone extent",
  );
export const boundZoneSchema = z.strictObject({
  zone_id: z.uuid(),
  zone_code: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/),
  label: z.string().min(1).max(200),
  bbox: bboxSchema,
  display_anchor: coordinateSchema,
  geometry_sha256: sha256Schema,
});
export const boundManifestSchema = z.strictObject({
  format: z.literal(1),
  site_code: z.string().min(1),
  site_id: z.uuid(),
  package_id: z.uuid(),
  package_version: z.number().int().positive(),
  forms: boundFormsSchema,
  zones: z.array(boundZoneSchema).min(1).max(250),
});
export type BoundManifest = z.infer<typeof boundManifestSchema>;
export const ringSchema = z
  .array(coordinateSchema)
  .min(4)
  .refine((positions) => {
    const first = positions[0];
    const last = positions.at(-1);
    return (
      first !== undefined &&
      last !== undefined &&
      first[0] === last[0] &&
      first[1] === last[1] &&
      new Set(positions.slice(0, -1).map(([x, y]) => `${x},${y}`)).size >= 3
    );
  }, "Polygon ring must be closed");
export const boundGeometrySchema = z.strictObject({
  type: z.literal("MultiPolygon"),
  coordinates: z.array(z.array(ringSchema).min(1)).min(1),
});
export const boundFeatureSchema = z.strictObject({
  type: z.literal("Feature"),
  geometry: boundGeometrySchema,
  properties: z.strictObject({
    zone_id: z.uuid(),
    zone_code: z.string(),
    name: z.string(),
    display_anchor: coordinateSchema,
    geometry_sha256: sha256Schema,
  }),
});
