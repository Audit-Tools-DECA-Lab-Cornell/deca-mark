import { z } from "zod";

import { readZoneGeometry, type ZoneGeometry } from "../../lib/zones/geometry";

export const geometry = z.unknown().transform((value, context): ZoneGeometry => {
	const read = readZoneGeometry(value);
	if (read.ok) return read.geometry;
	context.addIssue({ code: "custom", message: read.issues[0]?.message ?? "Unreadable boundary" });
	return z.NEVER;
});
export const role = z.enum(["outline", "ground", "zones", "paths", "trees", "leave_out"]);
export type Role = z.infer<typeof role>;
export const assignment = z.object({
	source_id: z.string(),
	feature_key: z.string(),
	role,
	zone_id: z.uuid().nullable().default(null)
});
export const zone = z.object({ zone_id: z.uuid(), zone_code: z.string(), zone_label: z.string(), geometry });
export const contentSchema = z.object({
	import_generation: z.number().int(),
	assignments: z.array(assignment),
	outline: geometry.nullable(),
	zones: z.array(zone),
	form_version: z.string().nullable(),
	inventory_form_version: z.string().nullable(),
	change_note: z.string(),
	confirmed_omissions: z.array(z.string())
});
export type Content = z.infer<typeof contentSchema>;
export const featureSchema = z.object({
	type: z.literal("Feature"),
	geometry: z.object({ type: z.string(), coordinates: z.unknown() }).nullable(),
	properties: z.record(z.string(), z.unknown()).nullable()
});
export const layerSchema = z.object({
	source_id: z.string(),
	name: z.string(),
	features: z.array(z.object({ feature_key: z.string(), feature: featureSchema }))
});
export type SourceLayer = z.infer<typeof layerSchema>;
export const setupSummarySchema = z.object({
	setup_id: z.uuid(),
	state: z.enum(["draft", "published", "discarded"]),
	updated_at: z.string()
});
export const setupSchema = z.object({
	setup_id: z.uuid(),
	site_id: z.uuid(),
	project_id: z.uuid(),
	state: z.enum(["draft", "published", "discarded"]),
	base_zone_ids: z.array(z.uuid()).default([]),
	revision: z.number().int(),
	import_generation: z.number().int(),
	expected_current_package_id: z.uuid().nullable(),
	created_by: z.uuid(),
	updated_by: z.uuid(),
	created_at: z.string(),
	updated_at: z.string(),
	content: contentSchema,
	layers: z.array(layerSchema),
	issues: z.array(
		z.object({
			source_id: z.string(),
			layer: z.string(),
			message: z.string(),
			kind: z.string().nullable().optional(),
			host: z.string().nullable().optional()
		})
	),
	sources: z.array(z.object({ file_name: z.string(), size: z.number() }))
});
export type Setup = z.infer<typeof setupSchema>;
export const setupEtag = (setup: Setup) => `"map-setup:${setup.setup_id}:${setup.revision}"`;
