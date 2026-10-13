/**
 * Which zone each feature of an uploaded zones layer is (UI plan 5.11; contract "QGIS upload"). Every
 * upload maps each source feature, by its `properties.id`, exactly once: to a zone of the current version
 * ("Same zone as North meadow") or to a new zone with a new identity. Continuity is never inferred from a
 * code or a label: only a feature that carries a current zone's `zone_id` is preselected; a code or label
 * that merely matches is offered as a suggestion and left for the manager to decide. Current zones no
 * feature maps to are left out of the next version. Pure, so the unit tests load it.
 */

/** A zone code: ASCII, 1–100 characters, a letter or digit first (contract "Manager drafts"). */
export const ZONE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
export const ZONE_CODE_RULE =
	"Use 1 to 100 letters, digits, dots, dashes or underscores, starting with a letter or a digit.";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A zone of the site's current version. */
export type CurrentZone = { readonly zoneId: string; readonly code: string; readonly label: string };

/** One feature of the zones layer being uploaded. */
export type SourceZone = {
	/** Its `properties.id`, exactly as the file has it. */
	readonly sourceId: string;
	/** Its name, which becomes the zone's label in the new version. */
	readonly name: string | null;
	/** A `zone_id` the file carries for it, lowercased, when it has one. */
	readonly carriedZoneId: string | null;
};

export type Choice =
	| { readonly kind: "same"; readonly zoneId: string }
	| { readonly kind: "new"; readonly zoneId: string; readonly code: string }
	/** Not decided yet: a code or label matched a current zone, which proves nothing. */
	| { readonly kind: "undecided" };

export type MappingRow = {
	readonly source: SourceZone;
	readonly choice: Choice;
	/** A current zone whose code or label matches: offered, not chosen. */
	readonly suggestion: CurrentZone | null;
};

type FeatureLike = { readonly properties: Readonly<Record<string, unknown>> };

function text(value: unknown): string | null {
	return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** The zones layer's features as sources: those with a text `id` (the layer checks name the others). */
export function sourceZones(features: readonly FeatureLike[]): SourceZone[] {
	return features.flatMap(feature => {
		const id = feature.properties.id;
		if (typeof id !== "string" || id.length === 0) return [];
		const carried = text(feature.properties.zone_id);
		return [
			{
				sourceId: id,
				name: zoneName(feature.properties),
				carriedZoneId: carried && UUID.test(carried) ? carried.toLowerCase() : null
			}
		];
	});
}

/**
 * A feature's name: its `name` field, which DECA Mark reads as the zone's label. A layer exported from the
 * QGIS templates names its zones in `label`; that is used when there is no `name`.
 */
export function zoneName(properties: Readonly<Record<string, unknown>>): string | null {
	return text(properties.name) ?? text(properties.label);
}

/**
 * The first mapping for an upload. `newId` makes a new zone's identity, once per feature, so a retry of
 * the same attempt sends the same identities. On a site's first upload every feature is a new zone, coded
 * by its source id when that is a valid code.
 */
export function initialMapping(
	sources: readonly SourceZone[],
	current: readonly CurrentZone[],
	newId: () => string
): MappingRow[] {
	const byId = new Map(current.map(zone => [zone.zoneId, zone]));
	const takenCodes = new Set(current.map(zone => zone.code));
	return sources.map(source => {
		const carried = source.carriedZoneId ? byId.get(source.carriedZoneId) : undefined;
		if (carried) return { source, choice: { kind: "same", zoneId: carried.zoneId }, suggestion: null };
		const suggestion =
			current.find(zone => zone.code === source.sourceId) ??
			(source.name ? current.find(zone => zone.label.trim() === source.name) : undefined) ??
			null;
		if (suggestion) return { source, choice: { kind: "undecided" }, suggestion };
		const code = ZONE_CODE_PATTERN.test(source.sourceId) && !takenCodes.has(source.sourceId) ? source.sourceId : "";
		return { source, choice: { kind: "new", zoneId: newId(), code }, suggestion: null };
	});
}

/** The rows with one row's choice replaced. A new zone keeps the identity it was first given. */
export function choose(
	rows: readonly MappingRow[],
	sourceId: string,
	choice: { readonly kind: "same"; readonly zoneId: string } | { readonly kind: "new"; readonly code: string },
	newId: () => string
): MappingRow[] {
	return rows.map(row => {
		if (row.source.sourceId !== sourceId) return row;
		if (choice.kind === "same") return { ...row, choice };
		const zoneId = row.choice.kind === "new" ? row.choice.zoneId : newId();
		return { ...row, choice: { kind: "new", zoneId, code: choice.code } };
	});
}

/** What stops the mapping from being sent, per feature, in words. Empty when it can be sent. */
export function mappingProblems(rows: readonly MappingRow[], current: readonly CurrentZone[]): Map<string, string> {
	const problems = new Map<string, string>();
	const byId = new Map(current.map(zone => [zone.zoneId, zone]));
	const currentCodes = new Map(current.map(zone => [zone.code, zone]));
	const sameCount = new Map<string, number>();
	const newCodes = new Map<string, number>();
	for (const row of rows) {
		if (row.choice.kind === "same") sameCount.set(row.choice.zoneId, (sameCount.get(row.choice.zoneId) ?? 0) + 1);
		if (row.choice.kind === "new") newCodes.set(row.choice.code, (newCodes.get(row.choice.code) ?? 0) + 1);
	}
	for (const row of rows) {
		const id = row.source.sourceId;
		if (!row.source.name) problems.set(id, `Zone ${id} has no name. In QGIS, give it a name, then export again.`);
		else if (row.choice.kind === "undecided")
			problems.set(
				id,
				`Choose whether ${id} is the same zone as ${row.suggestion?.label ?? "a current zone"} or a new zone.`
			);
		else if (row.choice.kind === "same") {
			const zone = byId.get(row.choice.zoneId);
			if (!zone) problems.set(id, `Choose which zone ${id} is.`);
			else if ((sameCount.get(zone.zoneId) ?? 0) > 1)
				problems.set(
					id,
					`More than one zone is ${zone.label}. Each current zone can be one zone of the file at most.`
				);
		} else {
			const code = row.choice.code;
			const owner = currentCodes.get(code);
			if (!ZONE_CODE_PATTERN.test(code)) problems.set(id, `Give the new zone ${id} a code. ${ZONE_CODE_RULE}`);
			else if (owner)
				problems.set(id, `${code} is the code of ${owner.label}. A new zone needs a code of its own.`);
			else if ((newCodes.get(code) ?? 0) > 1) problems.set(id, `More than one new zone has the code ${code}.`);
		}
	}
	return problems;
}

/** The current zones no feature maps to: left out of the next version (earlier versions keep them). */
export function removedZones(rows: readonly MappingRow[], current: readonly CurrentZone[]): CurrentZone[] {
	const kept = new Set(rows.flatMap(row => (row.choice.kind === "same" ? [row.choice.zoneId] : [])));
	return current.filter(zone => !kept.has(zone.zoneId));
}

export type IdentityEntry = { source_feature_id: string; zone_id: string; zone_code: string };

/** The request's `zone_identity_map`. Call only when `mappingProblems` is empty. */
export function identityMap(rows: readonly MappingRow[], current: readonly CurrentZone[]): IdentityEntry[] {
	const byId = new Map(current.map(zone => [zone.zoneId, zone]));
	return rows.flatMap(row => {
		if (row.choice.kind === "same") {
			const zone = byId.get(row.choice.zoneId);
			return zone ? [{ source_feature_id: row.source.sourceId, zone_id: zone.zoneId, zone_code: zone.code }] : [];
		}
		if (row.choice.kind === "new")
			return [{ source_feature_id: row.source.sourceId, zone_id: row.choice.zoneId, zone_code: row.choice.code }];
		return [];
	});
}

/**
 * The zones layer as it is sent: each feature named by its `name`, or by its `label` when it has no name
 * (the field DECA Mark reads the zone's label from). Nothing else, the geometry included, is changed.
 */
export function namedZonesLayer<T extends { readonly features: readonly FeatureLike[] }>(collection: T): T {
	return {
		...collection,
		features: collection.features.map(feature => {
			const name = zoneName(feature.properties);
			return text(feature.properties.name) || !name
				? feature
				: { ...feature, properties: { ...feature.properties, name } };
		})
	};
}

/** Words for one row's choice, for its accessible name and the summary: "Same zone as North meadow (A)". */
export function choiceWords(row: MappingRow, current: readonly CurrentZone[]): string {
	if (row.choice.kind === "undecided") return "Not chosen yet";
	if (row.choice.kind === "new") return row.choice.code ? `New zone, code ${row.choice.code}` : "New zone";
	const zoneId = row.choice.zoneId;
	const zone = current.find(entry => entry.zoneId === zoneId);
	return zone ? `Same zone as ${zone.label} (${zone.code})` : "Same zone as a removed zone";
}
