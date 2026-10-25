import { z } from "zod";
import { coordinateSchema } from "../../domain/observation";
import {
  boundFormsSchema,
  boundManifestSchema,
  boundZoneSchema,
  sha256Schema,
} from "./bound-manifest";

export const manifestSchema = boundManifestSchema;
export type Manifest = z.infer<typeof manifestSchema>;
export const extentSchema = z.strictObject({
  west: z.number().finite(),
  south: z.number().finite(),
  east: z.number().finite(),
  north: z.number().finite(),
});
const geometrySchema = z.object({ type: z.string().min(1), coordinates: z.unknown() });
export const featureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(
    z.object({
      type: z.literal("Feature"),
      geometry: geometrySchema,
      properties: z.record(z.string(), z.unknown()).nullish(),
    }),
  ),
});
export type LayerData = z.infer<typeof featureCollectionSchema>;
export const layersSchema = z.object({
  ground: featureCollectionSchema,
  zones: featureCollectionSchema,
  paths: featureCollectionSchema.optional(),
  trees: featureCollectionSchema.optional(),
});
export type PackageLayers = z.infer<typeof layersSchema>;
export const packageSummarySchema = z.strictObject({
  package_id: z.uuid(),
  site_id: z.uuid(),
  package_version: z.number().int().positive(),
  state: z.enum(["ready", "blocked"]),
  prepared_at: z.iso.datetime({ offset: true }),
  archive_bytes: z.number().int().nonnegative(),
  archive_sha256: sha256Schema,
  forms: boundFormsSchema,
  zone_count: z.number().int().nonnegative().max(250),
  change_note: z.string(),
  published_by: z.uuid().nullable(),
  source: z.enum(["upload", "draft"]),
});
export const siteSchema = z
  .strictObject({
    site_id: z.uuid(),
    code: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable(),
    created_at: z.iso.datetime({ offset: true }),
    observation_count: z.number().int().nonnegative(),
    current_package_id: z.uuid().nullable(),
    package: packageSummarySchema.nullable(),
    zones: z.array(boundZoneSchema),
    extent: extentSchema.nullable(),
    centre: coordinateSchema.nullable(),
    zone_editing_available: z.boolean(),
  })
  .refine(
    (site) =>
      site.current_package_id === (site.package?.package_id ?? null) &&
      (!site.package ||
        (site.package.site_id === site.site_id &&
          site.package.state === "ready" &&
          site.package.zone_count === site.zones.length)),
    "Current package identity is inconsistent",
  );
export type HostedSite = z.infer<typeof siteSchema>;
export const sitesSchema = z.array(siteSchema);
const versionStateSchema = z.enum(["draft", "published", "retired"]);
export const formSummarySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  versions: z.array(
    z.object({ code: z.string().min(1), version: z.number().int(), state: versionStateSchema }),
  ),
});
export const formSummariesSchema = z.array(formSummarySchema);
export type FormSummary = z.infer<typeof formSummarySchema>;
export const formVersionSchema = z.object({
  schema_version: z.number().int().positive(),
  code: z.string().min(1),
  state: versionStateSchema,
  form_code: z.string().min(1),
  version_id: z.uuid(),
  definition: z.record(z.string(), z.unknown()),
});
export type FormVersion = z.infer<typeof formVersionSchema>;
export const storedPackageSchema = z.strictObject({
  projectId: z.uuid(),
  siteId: z.uuid(),
  siteCode: z.string().min(1),
  siteName: z.string().min(1),
  packageId: z.uuid(),
  packageVersion: z.number().int().positive(),
  archiveBytes: z.number().int().nonnegative(),
  archiveSha256: sha256Schema,
  savedAt: z.iso.datetime(),
  manifest: manifestSchema,
  layers: layersSchema,
  formSchemaVersions: z
    .strictObject({
      play: z.number().int().positive(),
      inventory: z.number().int().positive().nullable(),
    })
    .optional(),
  forms: z.strictObject({
    play: z.record(z.string(), z.unknown()),
    inventory: z.record(z.string(), z.unknown()).nullable(),
  }),
});
export type StoredPackage = z.infer<typeof storedPackageSchema>;
export const packageDetailSchema = packageSummarySchema
  .extend({ manifest: manifestSchema })
  .refine(
    (detail) =>
      detail.manifest.package_id === detail.package_id &&
      detail.manifest.site_id === detail.site_id &&
      detail.manifest.package_version === detail.package_version &&
      JSON.stringify(detail.forms) === JSON.stringify(detail.manifest.forms),
    "Package detail identity is inconsistent",
  );
export type PackageDetail = z.infer<typeof packageDetailSchema>;
