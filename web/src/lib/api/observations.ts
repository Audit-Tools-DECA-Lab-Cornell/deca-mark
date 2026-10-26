import { z } from "zod";

/**
 * Observation reads as the API serves them (contract "Observation reads, filters and exports"), checked at
 * runtime. Every observation carries its recorded binding: the zone label and map version it was collected
 * with, never today's. Inventories are whole-zone records: `geometry` is null and `display_anchor` names
 * the zone's place. Pure, so the unit tests load it.
 */

const point = z.object({ type: z.literal("Point").default("Point"), coordinates: z.tuple([z.number(), z.number()]) });

const roundType = z.enum(["standard", "reliability", "inventory"]);

export const historicalObservationSchema = z.object({
	observation_id: z.uuid(),
	project_id: z.uuid(),
	user_id: z.uuid(),
	site_id: z.uuid(),
	site_code: z.string(),
	site_name: z.string(),
	observer: z.string(),
	observed_at: z.string(),
	received_at: z.string(),
	revision: z.number().int(),
	answers: z.record(z.string(), z.unknown()),
	form_version: z.string(),
	round_type: roundType,
	first_round: z.boolean().nullable(),
	placement: z.enum(["hand", "zone"]),
	package_id: z.uuid(),
	package_version: z.number().int().min(1),
	zone_id: z.uuid(),
	zone_code: z.string(),
	zone_label: z.string(),
	spatial_support: z.enum(["point", "zone"]),
	geometry: point.nullable(),
	display_anchor: point.nullable()
});
export type Observation = z.infer<typeof historicalObservationSchema>;

export const observationDetailSchema = historicalObservationSchema.extend({
	schema_version: z.number().int().positive(),
	definition: z.record(z.string(), z.unknown())
});
export type ObservationDetail = z.infer<typeof observationDetailSchema>;

export const observationPageSchema = z.object({
	items: z.array(historicalObservationSchema),
	next_cursor: z.string().nullable(),
	total_matching: z.number().int().nonnegative(),
	generated_at: z.string()
});
export type ObservationPage = z.infer<typeof observationPageSchema>;

export const summaryGroupSchema = z.object({
	site_id: z.uuid(),
	package_id: z.uuid(),
	package_version: z.number().int().min(1),
	zone_id: z.uuid(),
	zone_code: z.string(),
	zone_label: z.string(),
	round_type: roundType,
	spatial_support: z.enum(["point", "zone"]),
	count: z.number().int().nonnegative()
});
export type SummaryGroup = z.infer<typeof summaryGroupSchema>;

export const observationSummarySchema = z.object({
	groups: z.array(summaryGroupSchema),
	total_matching: z.number().int().nonnegative(),
	generated_at: z.string()
});
export type ObservationSummary = z.infer<typeof observationSummarySchema>;

/** The most observations one page may hold. */
export const PAGE_LIMIT = 500;

/**
 * The filters list, summary and export share. Different filters AND together; zone IDs OR together and need
 * one site; a package with zones is one exact map version, zones alone span every version. Times are UTC
 * instants, `observedFrom` inclusive and `observedBefore` exclusive.
 */
export type ObservationFilters = {
	readonly siteId?: string;
	readonly packageId?: string;
	readonly zoneIds?: readonly string[];
	readonly roundType?: z.infer<typeof roundType>;
	readonly observer?: string;
	readonly observedFrom?: string;
	readonly observedBefore?: string;
};

/** The API query for filters: only what is set, zone IDs sorted and once each (the cursor is bound to them). */
export function filterQuery(filters: ObservationFilters): Record<string, string | string[]> {
	const query: Record<string, string | string[]> = {};
	if (filters.siteId) query.site_id = filters.siteId;
	if (filters.packageId) query.package_id = filters.packageId;
	const zones = [...new Set(filters.zoneIds ?? [])].sort();
	if (zones.length > 0) query.zone_id = zones;
	if (filters.roundType) query.round_type = filters.roundType;
	if (filters.observer) query.observer = filters.observer;
	if (filters.observedFrom) query.observed_from = filters.observedFrom;
	if (filters.observedBefore) query.observed_before = filters.observedBefore;
	return query;
}

/** Point records have a place; inventories are whole-zone records and have none. */
export function pointOf(observation: Pick<Observation, "geometry">): readonly [number, number] | null {
	return observation.geometry ? observation.geometry.coordinates : null;
}

/** Appends a later page, keeping the first copy of each observation (a late upload can shift a page). */
export function appendPage<T extends { readonly observation_id: string }>(
	loaded: readonly T[],
	next: readonly T[]
): T[] {
	const seen = new Set(loaded.map(item => item.observation_id));
	return [...loaded, ...next.filter(item => !seen.has(item.observation_id))];
}
