import { z } from "zod";

import type { components } from "./schema";

/**
 * Sites and their map packages as the API serves them (contract "Reads"), checked at runtime. Every API
 * path names a site by its UUID (`site_id`); the code stays in web addresses and labels only. A site's
 * current package is the one `current_package_id` names, never "the newest ready one": a publication
 * replayed after a later one, or an upload that failed, must not move it. Pure, so the unit tests load it.
 */

type Schemas = components["schemas"];

const position = z.tuple([z.number(), z.number()]);

const formBindingSchema = z.object({ form_version_id: z.uuid(), form_version: z.string().min(1) });

/** The exact forms a package binds: the play form, and the inventory form or none (Inventory is off). */
export const packageFormsSchema = z.object({ play: formBindingSchema, inventory: formBindingSchema.nullable() });
export type PackageForms = z.infer<typeof packageFormsSchema>;

const packageFields = {
	package_id: z.uuid(),
	site_id: z.uuid(),
	package_version: z.number().int().min(1),
	prepared_at: z.string(),
	archive_bytes: z.number().int().nonnegative(),
	archive_sha256: z.string(),
	forms: packageFormsSchema,
	zone_count: z.number().int().nonnegative(),
	change_note: z.string(),
	published_by: z.uuid(),
	source: z.enum(["upload", "draft"])
};

/** One immutable package in a site's version history. */
export const packageSummarySchema = z.object({ ...packageFields, state: z.enum(["ready", "blocked"]) });
export type PackageSummary = z.infer<typeof packageSummarySchema>;

const preparationCheckSchema = z.object({
	step: z.enum(["archive", "source-project", "layer-sources", "coordinate-reference", "imagery-licence"]),
	state: z.enum(["passed", "warning", "blocked", "skipped"]),
	detail: z.string()
}) satisfies z.ZodType<Schemas["PreparationCheck"]>;

/** A package with its preparation checks and its manifest (read by `features/packages/manifest.ts`). */
export const packageDetailSchema = packageSummarySchema.extend({
	checks: z.array(preparationCheckSchema),
	manifest: z.unknown()
});
export type PackageDetail = z.infer<typeof packageDetailSchema>;

/** The package a site's new collection uses: always ready. */
export const sitePackageSchema = z.object({ ...packageFields, state: z.literal("ready") });
export type SitePackageInfo = z.infer<typeof sitePackageSchema>;

/** A zone of a site's current package, as the site list carries it (no geometry). */
export const siteZoneSchema = z.object({
	zone_id: z.uuid(),
	zone_code: z.string().min(1),
	label: z.string(),
	bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
	display_anchor: position,
	geometry_sha256: z.string()
}) satisfies z.ZodType<Schemas["SiteZone"]>;
export type SiteZone = z.infer<typeof siteZoneSchema>;

export const siteSchema = z.object({
	site_id: z.uuid(),
	code: z.string().min(1),
	name: z.string(),
	description: z.string().nullable(),
	created_at: z.string(),
	observation_count: z.number().int().nonnegative(),
	current_package_id: z.uuid().nullable(),
	package: sitePackageSchema.nullable(),
	zones: z.array(siteZoneSchema),
	extent: z.object({ west: z.number(), south: z.number(), east: z.number(), north: z.number() }).nullable(),
	centre: position.nullable(),
	zone_editing_available: z.boolean()
});
export type Site = z.infer<typeof siteSchema>;

export const siteListSchema = z.array(siteSchema);

/** Every package of one site, and which one is current (null until the site's first package). */
export const packageHistorySchema = z.object({
	current_package_id: z.uuid().nullable(),
	packages: z.array(packageSummarySchema)
});
export type PackageHistory = z.infer<typeof packageHistorySchema>;

/**
 * What an upload (or a draft's publication) returns: the package it made, and the site's current package
 * now. A replayed request returns its original package, which may no longer be the current one.
 */
export const publicationSchema = z.object({
	site_id: z.uuid(),
	draft_id: z.uuid().nullable(),
	package: packageSummarySchema,
	current_package_id: z.uuid().nullable(),
	replayed: z.boolean()
});
export type Publication = z.infer<typeof publicationSchema>;

/** The site whose web address carries this code, or undefined. */
export function siteByCode<T extends { readonly code: string }>(sites: readonly T[], code: string): T | undefined {
	return sites.find(site => site.code === code);
}

/** The form version codes a package binds: the play form, then the inventory form when it has one. */
export function boundFormVersions(forms: PackageForms): string[] {
	return forms.inventory ? [forms.play.form_version, forms.inventory.form_version] : [forms.play.form_version];
}
