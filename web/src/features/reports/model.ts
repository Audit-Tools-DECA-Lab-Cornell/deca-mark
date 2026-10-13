import type { Observation } from "@/lib/api/types";
import { plural, ROUND_TYPES, roundLabel, roundName } from "@/lib/labels";
import { allOptions, answerLabel, playTypeQuestion } from "@/lib/observations/answers";
import { byDay, byObserver, type ObservationLike } from "@/lib/observations/summary";
import type { Clock } from "@/lib/time";
import type { RoundType } from "@/lib/workspace/types";

/**
 * What the Reports page counts. DECA Mark applies site, round and days to every observation: zones and
 * rounds come from its summary, which counts every match exactly. Observers, days and play types have no
 * server count yet, so they are counted from the newest page of observations (`reportRows`), and the page
 * says so when more match than it holds. Pure: no imports of server code, so the tests load it directly.
 *
 * Rules: days are the project's calendar days of `observed_at`; every record counts in the zone it was
 * recorded in (by identity, across map versions), and a zone the current package no longer has keeps the
 * label of the newest version it was recorded on; play type is read with each row's own form version.
 */

/** Bars listed for the days chart; older days are left out and the page says so. */
export const MAX_DAYS = 31;

/** Rows whose form version has no single-choice Play question, and rows whose form could not be read. */
export const NO_PLAY_QUESTION = "No play type question";
export const FORM_UNREADABLE = "Form could not be read";

export type ReportRow = {
	readonly id: string;
	readonly siteCode: string;
	readonly siteName: string;
	/** The zone's identity, the same on every map version. */
	readonly zone: string;
	/** The zone's label when the record was collected. */
	readonly zoneLabel: string;
	readonly round: RoundType;
	readonly observer: string;
	readonly observedAt: string;
	readonly formVersion: string;
	/** The answer to the first single-choice Play question of the row's own form version, in words. */
	readonly play: string | null;
};

/** A zone of a site in scope, as its current map package names it. */
export type ZoneChoice = {
	readonly siteId: string;
	readonly siteCode: string;
	readonly siteName: string;
	readonly id: string;
	readonly label: string;
};

/** For each form version that has a Play question: its option labels, in the form's order. */
export type PlayOptions = Readonly<Record<string, readonly string[]>>;

export type Bar = { readonly key: string; readonly label: string; readonly value: number };

/** The summary's counts for one zone of one map version, in one round type (contract "Observation summary"). */
export type ReportGroup = {
	readonly site_id: string;
	readonly zone_id: string;
	readonly zone_label: string;
	readonly package_version: number;
	readonly round_type: RoundType;
	readonly count: number;
};

export type Report = {
	/** Every matching observation, counted by DECA Mark. */
	readonly total: number;
	/** Whether observers, days and play types come from fewer observations than match. */
	readonly sampled: boolean;
	/** How many observations observers, days and play types were counted from. */
	readonly counted: number;
	readonly observers: number;
	/** Zones that have at least one record. */
	readonly zonesWithRecords: number;
	readonly siteNames: readonly string[];
	readonly firstDay: string | null;
	readonly lastDay: string | null;
	readonly zones: readonly Bar[];
	readonly rounds: readonly Bar[];
	/** Null when no form in the rows has a play type question. */
	readonly play: readonly Bar[] | null;
	readonly observerBars: readonly Bar[];
	/** Oldest first, the newest MAX_DAYS at most. */
	readonly days: readonly Bar[];
	/** Days with records that `days` leaves out. */
	readonly daysLeftOut: number;
	readonly formVersions: readonly string[];
};

/* ── From the list to report rows ─────────────────────────────────────────── */

/**
 * Slim rows for the browser, with the play type of each row read from its own form version's definition.
 * `definitions` maps a version code to its definition; a version missing from it is "Form could not be
 * read" rather than a guess from another version.
 */
export function reportRows(
	rows: readonly Observation[],
	definitions: Readonly<Record<string, unknown>>
): { rows: ReportRow[]; playOptions: PlayOptions } {
	const questions = new Map<string, { id: string } | null>();
	const playOptions: Record<string, string[]> = {};

	function playQuestion(version: string): { id: string } | null {
		const known = questions.get(version);
		if (known !== undefined) return known;
		const definition = definitions[version];
		const question = definition === undefined ? undefined : playTypeQuestion(definition);
		questions.set(version, question ? { id: question.id } : null);
		if (question) playOptions[version] = allOptions(question).map(option => option.label);
		return questions.get(version) ?? null;
	}

	return {
		rows: rows.map(row => {
			const version = row.form_version;
			const question = playQuestion(version);
			let play: string | null = null;
			if (definitions[version] === undefined) play = FORM_UNREADABLE;
			else if (question)
				play = answerLabel(definitions[version], question.id, row.answers[question.id], row.answers);
			return {
				id: row.observation_id,
				siteCode: row.site_code,
				siteName: row.site_name,
				zone: row.zone_id,
				zoneLabel: row.zone_label,
				round: row.round_type,
				observer: row.observer,
				observedAt: row.observed_at,
				formVersion: version,
				play
			};
		}),
		playOptions
	};
}

/* ── Days ─────────────────────────────────────────────────────────────────── */

/** A day key ("2026-10-07") when the text is a real calendar date, otherwise null. */
export function parseDayKey(value: string | null | undefined): string | null {
	if (!value) return null;
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return null;
	const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
	const date = new Date(Date.UTC(year, month - 1, day));
	const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
	return real ? value : null;
}

/** Whether the first day is after the last, which no record can satisfy. */
export function dayRangeIsBackwards(from: string | null, to: string | null): boolean {
	return from !== null && to !== null && from > to;
}

/* ── Counting ─────────────────────────────────────────────────────────── */

function asObservation(row: ReportRow): ObservationLike {
	return {
		observation_id: row.id,
		site_code: row.siteCode,
		site_name: row.siteName,
		zone_id: row.zone,
		zone_label: row.zoneLabel,
		round_type: row.round,
		observer: row.observer,
		observed_at: row.observedAt,
		form_version: row.formVersion,
		answers: {}
	};
}

function playBars(rows: readonly ReportRow[], playOptions: PlayOptions): Bar[] | null {
	if (rows.every(row => row.play === null)) return null;
	const counts = new Map<string, number>();
	// Every option of every form version in these rows is listed, so an option nobody chose shows as 0.
	for (const version of new Set(rows.map(row => row.formVersion)))
		for (const label of playOptions[version] ?? []) counts.set(label, counts.get(label) ?? 0);
	for (const row of rows) {
		const label = row.play ?? NO_PLAY_QUESTION;
		counts.set(label, (counts.get(label) ?? 0) + 1);
	}
	return [...counts]
		.map(([label, value]) => ({ key: label, label, value }))
		.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "en"));
}

/**
 * Bars by zone from the summary: the current zones of the sites in scope, in their map's order (0 when
 * nothing was recorded), then zones only earlier versions had, under the label of the newest version they
 * were recorded on. With more than one site, each label names its site.
 */
function zoneBars(
	groups: readonly ReportGroup[],
	zones: readonly ZoneChoice[],
	siteName: ReadonlyMap<string, string>,
	multiSite: boolean
): Bar[] {
	const counts = new Map<string, { count: number; label: string; version: number; site: string }>();
	for (const group of groups) {
		const entry = counts.get(group.zone_id) ?? {
			count: 0,
			label: group.zone_label,
			version: 0,
			site: group.site_id
		};
		entry.count += group.count;
		if (group.package_version > entry.version) {
			entry.version = group.package_version;
			entry.label = group.zone_label;
		}
		counts.set(group.zone_id, entry);
	}
	const named = (site: string, label: string) => (multiSite ? `${siteName.get(site) ?? ""} · ${label}` : label);
	const current = new Set(zones.map(zone => zone.id));
	return [
		...zones.map(zone => ({
			key: zone.id,
			label: named(zone.siteId, zone.label),
			value: counts.get(zone.id)?.count ?? 0
		})),
		...[...counts]
			.filter(([id]) => !current.has(id))
			.map(([id, entry]) => ({ key: id, label: named(entry.site, entry.label), value: entry.count }))
			.sort((a, b) => a.label.localeCompare(b.label, "en"))
	];
}

/**
 * Everything the report page shows. `groups` and `total` are the summary's (every match); `rows` are the
 * newest observations of the same scope, which observers, days and play types are counted from.
 */
export function buildReport(input: {
	readonly groups: readonly ReportGroup[];
	readonly total: number;
	readonly rows: readonly ReportRow[];
	readonly zones: readonly ZoneChoice[];
	readonly sites: readonly { readonly siteId: string; readonly name: string }[];
	readonly playOptions: PlayOptions;
	readonly clock: Clock;
}): Report {
	const { groups, total, rows, zones, sites, playOptions, clock } = input;
	const siteName = new Map(sites.map(site => [site.siteId, site.name]));
	const inScope = new Set([...zones.map(zone => zone.siteId), ...groups.map(group => group.site_id)]);
	const zonesBars = zoneBars(groups, zones, siteName, inScope.size > 1);

	const rounds = new Map<RoundType, number>();
	for (const group of groups) rounds.set(group.round_type, (rounds.get(group.round_type) ?? 0) + group.count);

	const adapted = rows.map(asObservation);
	const days = byDay(adapted, clock);
	const shown = days.slice(-MAX_DAYS);
	const observers = byObserver(adapted);
	const recorded = new Set(groups.filter(group => group.count > 0).map(group => group.site_id));

	return {
		total,
		sampled: total > rows.length,
		counted: rows.length,
		observers: observers.length,
		zonesWithRecords: zonesBars.filter(bar => bar.value > 0).length,
		siteNames: [...recorded]
			.map(id => siteName.get(id) ?? "")
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b, "en")),
		firstDay: days[0]?.key ?? null,
		lastDay: days[days.length - 1]?.key ?? null,
		zones: zonesBars,
		rounds: ROUND_TYPES.map(type => ({ key: type, label: roundLabel(type), value: rounds.get(type) ?? 0 })),
		play: playBars(rows, playOptions),
		observerBars: observers.map(entry => ({ key: entry.key, label: entry.label, value: entry.count })),
		days: shown.map(entry => ({ key: entry.key, label: entry.label, value: entry.count })),
		daysLeftOut: days.length - shown.length,
		formVersions: [...new Set(rows.map(row => row.formVersion))].sort()
	};
}

/* ── Words ────────────────────────────────────────────────────────────────── */

/**
 * The report in one plain sentence: "8 observations by 1 observer in 1 zone at Fall Creek test site on
 * Oct 07, 2026." Observers and days are said only when every match was read; a round filter is named at
 * the end.
 */
export function summarySentence(report: Report, options: { clock: Clock; round: RoundType | null }): string {
	if (report.total === 0) return "No observations match these filters.";
	const parts = [
		report.sampled
			? plural(report.total, "observation")
			: `${plural(report.total, "observation")} by ${plural(report.observers, "observer")}`
	];
	if (report.zonesWithRecords > 0) parts.push(`in ${plural(report.zonesWithRecords, "zone")}`);
	if (report.siteNames.length === 1) parts.push(`at ${report.siteNames[0]}`);
	else if (report.siteNames.length > 1) parts.push(`across ${plural(report.siteNames.length, "site")}`);
	if (!report.sampled && report.firstDay !== null && report.lastDay !== null)
		parts.push(
			report.firstDay === report.lastDay
				? `on ${options.clock.keyLabel(report.firstDay)}`
				: `from ${options.clock.keyLabel(report.firstDay)} to ${options.clock.keyLabel(report.lastDay)}`
		);
	const sentence = parts.join(" ");
	return options.round ? `${sentence}, ${roundName(options.round)} rounds only.` : `${sentence}.`;
}
