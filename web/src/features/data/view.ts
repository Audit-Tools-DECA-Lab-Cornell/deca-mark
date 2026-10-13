import type { Observation, ObservationFilters } from "../../lib/api/observations";
import { formatCount, isRoundType, roundLabel, roundName, shortLabel } from "../../lib/labels";
import { answerRows, playTypeQuestion } from "../../lib/observations/answers";
import { addDays, type Clock } from "../../lib/time";
import type { RoundType } from "../../lib/workspace/types";

/**
 * Data's one view: the filters in the address, the query they make, and how a row reads. Pure, with relative
 * imports only, so the unit tests load it directly.
 *
 * Every filter but the search is applied by DECA Mark to every observation, so counts, pages and the map
 * all cover what matches, not a loaded subset (UI plan 7.1, 7.2):
 *
 * | Address                        | API                                     |
 * | ------------------------------ | --------------------------------------- |
 * | `site=<code>`                  | `site_id`                               |
 * | `zone=<id>` (repeatable)       | `zone_id` (any of them; needs a site)   |
 * | `version=<n>` with zones       | `package_id` (one map version)          |
 * | `round=<type>`                 | `round_type`                            |
 * | `observer=<initials>` (exact)  | `observer`                              |
 * | `from=` and `to=` (days)       | `observed_from`, `observed_before`      |
 *
 * `q` searches the observations that have loaded, and says so.
 */

/** Longest answer shown in a table cell, in characters. The observation page has the whole answer. */
export const SUMMARY_LIMIT = 140;

export type DataView = {
	/** The site's code. */
	readonly site: string | null;
	/** Zone identities, any of which matches. Only with a site. */
	readonly zones: readonly string[];
	/** One map version of those zones; null matches every version. Only with zones. */
	readonly version: number | null;
	readonly round: RoundType | null;
	/** Observer initials, exactly as recorded. */
	readonly observer: string | null;
	/** First day, "2026-10-07", in the project's timezone. */
	readonly from: string | null;
	/** Last day, included. */
	readonly to: string | null;
	/** Words to find in the loaded observations. */
	readonly q: string;
};

/** Reads the address: `URLSearchParams`, or Next's `searchParams` object through `paramsReader`. */
export type ParamsReader = {
	get(key: string): string | null | undefined;
	getAll(key: string): readonly string[];
};

/** A reader over Next's `searchParams` object (a key that repeats is a list). */
export function paramsReader(params: Readonly<Record<string, string | string[] | undefined>>): ParamsReader {
	const all = (key: string): string[] => {
		const value = params[key];
		return value === undefined ? [] : Array.isArray(value) ? value : [value];
	};
	return { get: key => all(key)[0], getAll: all };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The longest initials the API takes. */
const OBSERVER_MAX = 12;

/** A day key that is a real calendar day, or null. */
function dayOrNull(value: string | null | undefined): string | null {
	if (!value || !DAY.test(value)) return null;
	const date = new Date(`${value}T00:00:00Z`);
	return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

const text = (value: string | null | undefined): string | null => {
	const found = value?.trim();
	return found ? found : null;
};

/**
 * The view in the address. Anything malformed is left out: a zone that is not an identity, zones without a
 * site, a version without zones, a round type DECA Mark does not know, an observer too long to be one.
 */
export function parseView(params: ParamsReader): DataView {
	const site = text(params.get("site"));
	const zones = site
		? [...new Set(params.getAll("zone").map(value => value.trim().toLowerCase()))].filter(value => UUID.test(value))
		: [];
	const rawVersion = Number(params.get("version"));
	const version = zones.length > 0 && Number.isInteger(rawVersion) && rawVersion >= 1 ? rawVersion : null;
	const round = params.get("round");
	const observer = text(params.get("observer"));
	return {
		site,
		zones,
		version,
		round: round && isRoundType(round) ? round : null,
		observer: observer && observer.length <= OBSERVER_MAX ? observer : null,
		from: dayOrNull(params.get("from")),
		to: dayOrNull(params.get("to")),
		q: params.get("q")?.trim() ?? ""
	};
}

/** The address query for a view: "" for the plain page, otherwise "?site=…&zone=…". Defaults are left out. */
export function viewQuery(view: Partial<DataView>): string {
	const params = new URLSearchParams();
	if (view.site) params.set("site", view.site);
	for (const zone of view.site ? (view.zones ?? []) : []) params.append("zone", zone);
	if (view.version && view.site && (view.zones ?? []).length > 0) params.set("version", String(view.version));
	if (view.round) params.set("round", view.round);
	if (view.observer) params.set("observer", view.observer);
	if (view.from) params.set("from", view.from);
	if (view.to) params.set("to", view.to);
	if (view.q?.trim()) params.set("q", view.q.trim());
	const query = params.toString();
	return query ? `?${query}` : "";
}

/** Whether any filter narrows the observations (the search included). */
export function hasFilters(view: DataView): boolean {
	return Boolean(
		view.site || view.round || view.observer || view.from || view.to || view.q.trim() || view.zones.length > 0
	);
}

/** Whether the first day is after the last, which no observation can satisfy. */
export function daysBackwards(view: Pick<DataView, "from" | "to">): boolean {
	return view.from !== null && view.to !== null && view.from > view.to;
}

/**
 * The API filters for a view. The site and the map version come from the site list and its package history
 * (codes and versions are never sent as identities). Days become instants in the project's timezone: `to`
 * is included, so the filter stops before the next day starts.
 */
export function viewFilters(
	view: DataView,
	resolved: { readonly siteId: string | null; readonly packageId: string | null },
	clock: Pick<Clock, "dayStart">
): ObservationFilters {
	return {
		...(resolved.siteId ? { siteId: resolved.siteId } : {}),
		...(resolved.siteId && view.zones.length > 0 ? { zoneIds: view.zones } : {}),
		...(resolved.siteId && view.zones.length > 0 && resolved.packageId ? { packageId: resolved.packageId } : {}),
		...(view.round ? { roundType: view.round } : {}),
		...(view.observer ? { observer: view.observer } : {}),
		...(view.from ? { observedFrom: clock.dayStart(view.from) } : {}),
		...(view.to ? { observedBefore: clock.dayStart(addDays(view.to, 1)) } : {})
	};
}

/* ── Rows ─────────────────────────────────────────────────────────────────── */

export type AnswerSummary = { label: string; value: string };

/** One observation prepared for the table, the map and the search. */
export type DataRecord = {
	/** The observation's UUID: its address and its export row. */
	id: string;
	/** "OBS-3F2A1B". */
	label: string;
	row: Observation;
	/** "Oct 07, 2026 · 14:05" in the project's timezone. */
	when: string;
	/** "Oct 07, 2026" and "14:05": the same moment in two parts, for a narrow column. */
	day: string;
	time: string;
	siteCode: string;
	siteName: string;
	/** The zone's identity. */
	zone: string;
	/** The zone's label when the record was collected, never today's. */
	zoneLabel: string;
	zoneCode: string;
	/** The map version it was collected on: "v2". */
	mapVersion: string;
	packageId: string;
	/** Inventories describe a whole zone and have no point. */
	wholeZone: boolean;
	point: readonly [number, number] | null;
	round: RoundType;
	/** "Standard". */
	roundName: string;
	observer: string;
	summary: AnswerSummary | null;
	/** Lowercase words a search can find. */
	search: string;
};

/** An answer on one line, cut at `limit` characters (whole characters, so an emoji is never split). */
export function clip(value: string, limit = SUMMARY_LIMIT): string {
	const line = value.replace(/\s+/g, " ").trim();
	const characters = Array.from(line);
	return characters.length <= limit ? line : `${characters.slice(0, limit).join("").trimEnd()}…`;
}

/**
 * The one answer a table row shows: the play type when the form has one and it was answered, otherwise
 * the first answer in the form's order. Null when the record has no answers.
 */
export function summaryOf(definition: unknown, answers: Readonly<Record<string, unknown>>): AnswerSummary | null {
	const rows = answerRows(definition, answers);
	if (rows.length === 0) return null;
	const play = playTypeQuestion(definition);
	const chosen = (play && rows.find(row => row.questionId === play.id)) ?? rows[0]!;
	return { label: chosen.label, value: clip(chosen.value) };
}

/**
 * The rows prepared for display. Each record is read with the form version it was collected with
 * (`definitions` is keyed by version code); a version that is missing leaves its answers labelled by
 * their question ids.
 */
export function prepareRecords(
	rows: readonly Observation[],
	definitions: Readonly<Record<string, unknown>>,
	clock: Clock
): DataRecord[] {
	return rows.map(row => {
		const definition = definitions[row.form_version];
		const answers = answerRows(definition, row.answers);
		const label = shortLabel(row.observation_id);
		const point = row.geometry?.coordinates ?? null;
		return {
			id: row.observation_id,
			label,
			row,
			when: clock.dayTime(row.observed_at),
			day: clock.day(row.observed_at),
			time: clock.time(row.observed_at),
			siteCode: row.site_code,
			siteName: row.site_name,
			zone: row.zone_id,
			zoneLabel: row.zone_label,
			zoneCode: row.zone_code,
			mapVersion: `v${row.package_version}`,
			packageId: row.package_id,
			wholeZone: row.spatial_support === "zone",
			point,
			round: row.round_type,
			roundName: roundName(row.round_type),
			observer: row.observer,
			summary: summaryOf(definition, row.answers),
			search: [
				label,
				row.observation_id,
				row.observer,
				row.site_name,
				row.site_code,
				row.zone_label,
				row.zone_code,
				`v${row.package_version}`,
				roundLabel(row.round_type),
				...answers.flatMap(answer => [answer.label, answer.value])
			]
				.join(" ")
				.toLowerCase()
		};
	});
}

/** The loaded records the search finds, in the order given. */
export function searchLoaded(records: readonly DataRecord[], q: string): DataRecord[] {
	const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return [...records];
	return records.filter(record => terms.every(term => record.search.includes(term)));
}

/* ── Zone choices ─────────────────────────────────────────────────────────── */

export type Option = { value: string; label: string };

/** Counts the server grouped by zone and map version, for the site in view. */
export type ZoneGroup = {
	readonly zone_id: string;
	readonly zone_label: string;
	readonly package_version: number;
	readonly count: number;
};

/** "v1", "v1–v3", "v1, v3": the map versions a zone was recorded on. */
export function versionRange(versions: readonly number[]): string {
	const sorted = [...new Set(versions)].sort((a, b) => a - b);
	if (sorted.length === 0) return "";
	const runs: string[] = [];
	let start = sorted[0]!;
	let previous = start;
	for (const version of [...sorted.slice(1), Number.NaN]) {
		if (version === previous + 1) {
			previous = version;
			continue;
		}
		runs.push(start === previous ? `v${start}` : `v${start}–v${previous}`);
		start = version;
		previous = version;
	}
	return runs.join(", ");
}

/**
 * The zones a site's filter offers: every zone its observations were recorded in (from the server's counts,
 * so a zone with records on an earlier version is there too) and every zone of its current map. Each names
 * the versions it was recorded on and whether today's map still has it: "North meadow · v1–v2",
 * "Swings · v1 · not in the current map". Current zones first, in their map's order.
 */
export function zoneOptions(
	groups: readonly ZoneGroup[],
	current: readonly { readonly id: string; readonly label: string }[],
	currentVersion: number | null
): Option[] {
	const seen = new Map<string, { label: string; newest: number; versions: number[] }>();
	for (const group of groups) {
		const entry = seen.get(group.zone_id) ?? { label: group.zone_label, newest: 0, versions: [] };
		entry.versions.push(group.package_version);
		if (group.package_version > entry.newest) {
			entry.newest = group.package_version;
			entry.label = group.zone_label;
		}
		seen.set(group.zone_id, entry);
	}
	const currentIds = new Set(current.map(zone => zone.id));
	const ofCurrent = current.map(zone => {
		const versions = seen.get(zone.id)?.versions ?? (currentVersion ? [currentVersion] : []);
		const range = versionRange(versions);
		return { value: zone.id, label: range ? `${zone.label} · ${range}` : zone.label };
	});
	const others = [...seen]
		.filter(([id]) => !currentIds.has(id))
		.map(([id, entry]) => ({
			value: id,
			label: `${entry.label} · ${versionRange(entry.versions)} · not in the current map`
		}))
		.sort((a, b) => a.label.localeCompare(b.label, "en"));
	return [...ofCurrent, ...others];
}

/**
 * The map versions "One map version" offers for the chosen zones: each version on which every chosen zone
 * has records (pass the site's counts for every round, observer and day, so other filters do not hide a
 * version), and the site's current version when it still has every chosen zone. A version without one of
 * the zones is never offered (DECA Mark refuses that pair). None without zones.
 */
export function zoneVersions(
	groups: readonly ZoneGroup[],
	zones: readonly string[],
	current: { readonly version: number | null; readonly zoneIds: readonly string[] }
): number[] {
	if (zones.length === 0) return [];
	const byVersion = new Map<number, Set<string>>();
	for (const group of groups) {
		const found = byVersion.get(group.package_version) ?? new Set<string>();
		found.add(group.zone_id);
		byVersion.set(group.package_version, found);
	}
	const versions = [...byVersion]
		.filter(([, found]) => zones.every(zone => found.has(zone)))
		.map(([version]) => version);
	if (current.version !== null && zones.every(zone => current.zoneIds.includes(zone))) versions.push(current.version);
	return [...new Set(versions)].sort((a, b) => a - b);
}

/* ── Counts ───────────────────────────────────────────────────────────────── */

/**
 * What the count line says: "Showing 1–500 of 1,284 matching observations · counted at 11:32", or, while a
 * search narrows the loaded ones, "12 of 500 loaded match · 1,284 match the filters".
 */
export function countLine(input: {
	readonly loaded: number;
	readonly total: number;
	readonly searched: number | null;
	readonly countedAt: string;
}): string {
	const { loaded, total, searched, countedAt } = input;
	if (searched !== null)
		return `${formatCount(searched)} of ${formatCount(loaded)} loaded match · ${formatCount(total)} match the filters · counted at ${countedAt}`;
	if (total === 0) return `No matching observations · counted at ${countedAt}`;
	const noun = total === 1 ? "matching observation" : "matching observations";
	if (loaded >= total)
		return total === 1
			? `Showing 1 ${noun} · counted at ${countedAt}`
			: `Showing all ${formatCount(total)} ${noun} · counted at ${countedAt}`;
	return `Showing 1–${formatCount(loaded)} of ${formatCount(total)} ${noun} · counted at ${countedAt}`;
}

/**
 * The site whose plan the page draws: the chosen site, or else the only site that holds observations.
 * Null when several sites hold some, since then no single plan is in scope.
 */
export function planSiteCode(
	sites: readonly { readonly code: string; readonly observationCount: number }[],
	site: string | null
): string | null {
	if (site) return sites.some(entry => entry.code === site) ? site : null;
	if (sites.length === 1) return sites[0]!.code;
	const holding = sites.filter(entry => entry.observationCount > 0);
	return holding.length === 1 ? holding[0]!.code : null;
}
