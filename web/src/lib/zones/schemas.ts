import { z } from "zod";

import type { SavedDraft } from "../../features/zones/editor/save-queue";
import type { components } from "../api/schema";
import { type DraftZone, readZoneGeometry, type ZoneGeometry } from "./geometry";

/**
 * Zone drafts, their checks and a map version's zones as the API serves them (contract "Manager drafts"),
 * checked at runtime before anything uses them. A geometry is read strictly (closed rings, three distinct
 * points, finite numbers): an answer DECA Mark would never send is a failed read, not a shape to repair.
 * Pure, with relative imports only, so the unit tests load it directly.
 */

type Schemas = components["schemas"];

/** A geometry read by the editor's own strict reader. */
const geometrySchema = z.unknown().transform((value, context): ZoneGeometry => {
	const read = readZoneGeometry(value);
	if (read.ok) return read.geometry;
	context.addIssue({ code: "custom", message: read.issues[0]?.message ?? "unreadable geometry" });
	return z.NEVER;
});

export const draftZoneSchema = z.object({
	zone_id: z.uuid(),
	zone_code: z.string().min(1),
	zone_label: z.string(),
	geometry: geometrySchema
});

const formBindingSchema = z.object({ form_version_id: z.uuid(), form_version: z.string().min(1) });

const draftFields = {
	draft_id: z.uuid(),
	site_id: z.uuid(),
	base_package_id: z.uuid(),
	base_package_version: z.number().int().min(1),
	current_package_id: z.uuid().nullable(),
	current_package_version: z.number().int().min(1).nullable(),
	state: z.enum(["draft", "published", "discarded"]),
	revision: z.number().int().min(1),
	etag: z.string().min(1),
	change_note: z.string(),
	forms: z.object({ play: formBindingSchema, inventory: formBindingSchema.nullable() }),
	published_package_id: z.uuid().nullable(),
	created_at: z.string(),
	created_by: z.uuid(),
	created_by_name: z.string().nullable(),
	updated_at: z.string(),
	updated_by: z.uuid(),
	updated_by_name: z.string().nullable()
};

/** A draft without its zones, as the draft list carries it. */
export const draftSummarySchema = z.object(draftFields) satisfies z.ZodType<Schemas["DraftSummary"]>;
export type ZoneDraftSummary = z.infer<typeof draftSummarySchema>;

export const draftSummaryListSchema = z.array(draftSummarySchema);

/** A draft with every zone. */
export const zoneDraftSchema = z.object({ ...draftFields, zones: z.array(draftZoneSchema) });
export type ZoneDraft = z.infer<typeof zoneDraftSchema>;

const zoneIssueSchema = z.object({
	code: z.string().min(1),
	message: z.string().default(""),
	path: z.string().default(""),
	zone_ids: z.array(z.string()).default([])
});
export type ZoneCheckIssue = z.infer<typeof zoneIssueSchema>;

/** What DECA Mark found checking one revision of a draft: problems that stop publishing, and warnings. */
export const zoneValidationSchema = z.object({
	draft_id: z.uuid(),
	revision: z.number().int().min(1),
	ready: z.boolean(),
	issues: z.array(zoneIssueSchema),
	warnings: z.array(zoneIssueSchema),
	site_gap_area_m2: z.number().nullable(),
	zones: z.array(
		z.object({
			zone_id: z.uuid(),
			change: z.enum(["added", "removed", "geometry_changed", "label_changed", "unchanged"]).nullable(),
			area_m2: z.number().nullable(),
			geometry_sha256: z.string().nullable(),
			display_anchor: z.tuple([z.number(), z.number()]).nullable(),
			extent: z.unknown().nullable()
		})
	)
});
export type ZoneValidation = z.infer<typeof zoneValidationSchema>;

/** One map version's zones, exactly as published (`GET …/sites/{site_id}/zones?package_id=`). */
export const historicalZonesSchema = z.object({
	site_id: z.uuid(),
	package_id: z.uuid(),
	package_version: z.number().int().min(1),
	zones: z.array(
		z.object({
			zone_id: z.uuid(),
			zone_code: z.string().min(1),
			zone_label: z.string(),
			geometry: geometrySchema,
			geometry_sha256: z.string(),
			display_anchor: z.tuple([z.number(), z.number()])
		})
	)
});
export type HistoricalZones = z.infer<typeof historicalZonesSchema>;

/** A map version's zones as draft zones, for comparing a draft with the version it started from. */
export function historicalDraftZones(historical: HistoricalZones): DraftZone[] {
	return historical.zones.map(zone => ({
		zone_id: zone.zone_id,
		zone_code: zone.zone_code,
		zone_label: zone.zone_label,
		geometry: zone.geometry
	}));
}

/** A draft in the save queue's words. */
export function savedDraft(draft: ZoneDraft): SavedDraft {
	return {
		zones: draft.zones,
		changeNote: draft.change_note,
		revision: draft.revision,
		etag: draft.etag,
		state: draft.state,
		updatedAt: draft.updated_at,
		updatedBy: draft.updated_by_name,
		publishedPackageId: draft.published_package_id
	};
}
