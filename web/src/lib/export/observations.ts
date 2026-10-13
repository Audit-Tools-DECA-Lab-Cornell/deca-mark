import { roundOf, shortLabel } from "../labels";
import { allOptions, type FormOption, type FormQuestion, readDefinition } from "../observations/answers";
import type { RoundType } from "../workspace/types";
import { answerHeader, csvLine, RECORD_COLUMNS, repeatsRecordColumn } from "./columns";

/**
 * Observation exports for analysis in R, Excel or QGIS: CSV, GeoJSON and a codebook, from the list the
 * API returns and each record's own historical form definition.
 *
 * - Coordinates are EPSG:4326. CSV has explicit `longitude` and `latitude` columns; GeoJSON points are
 *   [longitude, latitude] (RFC 7946).
 * - A missing answer and an empty one stay distinct. CSV: an empty cell means the record has no answer to
 *   that question; `n/a` means the record stores an empty (null) answer. GeoJSON: the property is absent,
 *   or null.
 * - A multi-select answer is its option codes joined with ";". Yes/no answers are "yes" and "no".
 * - Nothing the record holds is dropped: an answer whose question is not in its definition gets a column
 *   under its own id.
 */

/**
 * The parts of an observation an export writes. An observation and its detail both fit. Each record keeps
 * the zone label and map version it was recorded with; an inventory is a whole-zone record with no point.
 */
export type ExportRow = {
	readonly observation_id: string;
	readonly project_id: string;
	readonly user_id: string;
	readonly site_id: string;
	readonly site_code: string;
	readonly site_name: string;
	readonly zone_id: string;
	readonly zone_code: string;
	readonly zone_label: string;
	readonly package_id: string;
	readonly package_version: number;
	readonly spatial_support: "point" | "zone";
	readonly round_type: RoundType | null;
	readonly first_round: boolean | null;
	readonly placement: "hand" | "zone" | null;
	readonly observer: string;
	readonly observed_at: string;
	readonly received_at?: string | null;
	readonly form_version: string;
	readonly revision: number;
	/** A point record's place; null for an inventory. */
	readonly geometry: { readonly coordinates: readonly [number, number] } | null;
	/** An inventory's zone label point; null for a point record. */
	readonly display_anchor: { readonly coordinates: readonly [number, number] } | null;
	readonly answers: Readonly<Record<string, unknown>>;
};

/** Form version code → its definition, as `GET …/form-versions/{code}` returns it. */
export type Definitions = Readonly<Record<string, unknown>>;

/** What a null answer is written as in CSV. */
export const NULL_ANSWER = "n/a";

/** One sentence for the export dialog about empty cells. */
export const EMPTY_CELL_NOTE =
	"In the CSV, an empty answer cell means the question was not answered, and n/a means the record stores an empty answer.";

export type ExportColumn = {
	readonly header: string;
	/** The question id (or the answer's own key when its question is unknown). */
	readonly questionId: string;
	readonly label: string;
	/** "one option", "options separated by ;", "text", "number", "yes or no", or "unknown". */
	readonly type: string;
	/** "code = Label; …" for choice questions. */
	readonly values: string;
	/** The form versions whose records fill this column. */
	readonly formVersions: readonly string[];
};

/** Where one answer goes: the question, and the column a record with these answers writes it under. */
type Source = {
	readonly questionId: string;
	readonly headerFor: (answers: Readonly<Record<string, unknown>>) => string | undefined;
};

type Plan = {
	readonly columns: ExportColumn[];
	/** Per form version: the answers that fill columns. */
	readonly byVersion: Map<string, Source[]>;
};

const TYPES: Record<FormQuestion["kind"], string> = {
	one: "one option",
	many: "options separated by ;",
	text: "text",
	number: "number",
	boolean: "yes or no"
};

const optionList = (options: readonly FormOption[]) =>
	options.map(option => `${option.code} = ${option.label}`).join("; ");

/**
 * The key of the dynamic option set a record's earlier answer selects, when that set names its own export
 * column (the collector writes the answer under it). Undefined for a question without sets, a controlling
 * answer that selects none, and a set without an export name; the question's own column holds those.
 */
function namedSetKey(question: FormQuestion, answers: Readonly<Record<string, unknown>>): string | undefined {
	const dynamic = question.dynamicFrom;
	if (!dynamic) return undefined;
	const parent = answers[dynamic.question];
	if (typeof parent !== "string" || !Object.hasOwn(dynamic.sets, parent)) return undefined;
	return dynamic.sets[parent].exportColumn.trim() === "" ? undefined : parent;
}

/** `header` when the form version has no such column yet; otherwise `<header>_<question id>`, numbered until free. */
function freeHeader(header: string, questionId: string, taken: ReadonlySet<string>): string {
	if (!taken.has(header)) return header;
	let candidate = `${header}_${questionId}`;
	for (let n = 2; taken.has(candidate); n++) candidate = `${header}_${questionId}_${n}`;
	return candidate;
}

/**
 * The answer columns for these definitions and records: each definition's questions in form order (the
 * definitions in the order given), then answers no definition explains. One question keeps one column
 * across versions; a column another question of the form already uses is renamed `<column>_<question id>`.
 *
 * A question whose options follow an earlier answer (a play subtype) is written under the export column of
 * the option set that answer selected, as the collector does, and the codebook lists each set's column. The
 * question's own column, named by its export column or its id, holds the answers no named set covers.
 */
function plan(rows: readonly ExportRow[], definitions: Definitions): Plan {
	const columns = new Map<string, { column: ExportColumn; versions: Set<string> }>();
	const byVersion = new Map<string, Source[]>();
	const taken = new Map<string, Set<string>>();
	const repeated = new Map<string, Set<string>>();
	const takenBy = (version: string) => {
		const found = taken.get(version) ?? new Set<string>();
		taken.set(version, found);
		return found;
	};
	const add = (version: string, header: string, column: Omit<ExportColumn, "header" | "formVersions">) => {
		const existing = columns.get(header);
		if (existing) existing.versions.add(version);
		else columns.set(header, { column: { ...column, header, formVersions: [] }, versions: new Set([version]) });
		takenBy(version).add(header);
	};

	// A question with a named set for every answer needs its own column only for records no set covers.
	const needsOwnColumn = new Set<string>();
	for (const row of rows) {
		if (!Object.hasOwn(definitions, row.form_version)) continue;
		for (const question of readDefinition(definitions[row.form_version]).questions)
			if (
				question.dynamicFrom &&
				Object.hasOwn(row.answers, question.id) &&
				namedSetKey(question, row.answers) === undefined
			)
				needsOwnColumn.add(`${row.form_version}\0${question.id}`);
	}

	for (const [version, definition] of Object.entries(definitions)) {
		const sources: Source[] = [];
		byVersion.set(version, sources);
		for (const question of readDefinition(definition).questions) {
			if (repeatsRecordColumn(question.id, question.exportColumn)) {
				repeated.set(version, (repeated.get(version) ?? new Set()).add(question.id));
				continue;
			}
			const sets = Object.entries(question.dynamicFrom?.sets ?? {});
			const named = sets.filter(([, set]) => set.exportColumn.trim() !== "");
			const claimed = new Map<string, string>();
			const claim = (natural: string, column: Omit<ExportColumn, "header" | "formVersions">) => {
				const found = claimed.get(natural);
				if (found !== undefined) return found;
				const header = freeHeader(natural, question.id, takenBy(version));
				claimed.set(natural, header);
				add(version, header, column);
				return header;
			};
			const own =
				named.length < sets.length || sets.length === 0 || needsOwnColumn.has(`${version}\0${question.id}`)
					? claim(answerHeader(question.id, question.exportColumn), {
							questionId: question.id,
							label: question.label,
							type: TYPES[question.kind],
							values: optionList(allOptions(question))
						})
					: undefined;
			const bySet = new Map(
				named.map(([key, set]) => [
					key,
					claim(answerHeader(question.id, set.exportColumn), {
						questionId: question.id,
						label: set.label,
						type: TYPES[question.kind],
						values: optionList(set.options)
					})
				])
			);
			sources.push({
				questionId: question.id,
				headerFor: answers => {
					const key = namedSetKey(question, answers);
					return (key === undefined ? undefined : bySet.get(key)) ?? own;
				}
			});
		}
	}

	for (const row of rows) {
		let sources = byVersion.get(row.form_version);
		if (!sources) {
			sources = [];
			byVersion.set(row.form_version, sources);
		}
		const mapped = new Set(sources.map(source => source.questionId));
		for (const key of Object.keys(row.answers)) {
			if (mapped.has(key) || repeated.get(row.form_version)?.has(key) || repeatsRecordColumn(key)) continue;
			const header = freeHeader(answerHeader(key), key, takenBy(row.form_version));
			add(row.form_version, header, { questionId: key, label: key, type: "unknown", values: "" });
			sources.push({ questionId: key, headerFor: () => header });
			mapped.add(key);
		}
	}

	return {
		columns: [...columns.values()].map(({ column, versions }) => ({
			...column,
			formVersions: [...versions].sort()
		})),
		byVersion
	};
}

/** The answers a record holds, by the column each is written under. A missing answer has no entry. */
function answerCells(plan: Plan, row: ExportRow): Map<string, unknown> {
	const cells = new Map<string, unknown>();
	for (const source of plan.byVersion.get(row.form_version) ?? []) {
		if (!Object.hasOwn(row.answers, source.questionId)) continue;
		const value = row.answers[source.questionId];
		const header = source.headerFor(row.answers);
		if (value !== undefined && header !== undefined) cells.set(header, value);
	}
	return cells;
}

/** The answer columns an export of these records would have, in file order. */
export function exportColumns(rows: readonly ExportRow[], definitions: Definitions): ExportColumn[] {
	return plan(rows, definitions).columns;
}

function yesNo(value: boolean | null | undefined): string | null {
	return value === true ? "yes" : value === false ? "no" : null;
}

/** The record columns as values: null where the record has nothing. */
function recordValues(row: ExportRow): Record<string, string | number | null> {
	const round = roundOf(row.round_type);
	const inventory = round === "inventory";
	const [longitude, latitude] = row.geometry?.coordinates ?? [null, null];
	const [anchorLongitude, anchorLatitude] = row.display_anchor?.coordinates ?? [null, null];
	return {
		observation_id: row.observation_id,
		label: shortLabel(row.observation_id),
		project_id: row.project_id,
		user_id: row.user_id,
		site_id: row.site_id,
		site_code: row.site_code,
		site_name: row.site_name,
		zone: row.zone_code,
		package_id: row.package_id,
		map_version: row.package_version,
		zone_id: row.zone_id,
		zone_code: row.zone_code,
		zone_label_at_capture: row.zone_label,
		spatial_support: row.spatial_support,
		display_anchor_longitude: typeof anchorLongitude === "number" ? anchorLongitude : null,
		display_anchor_latitude: typeof anchorLatitude === "number" ? anchorLatitude : null,
		round_type: round,
		Rel_Round: inventory ? null : round === "reliability" ? "yes" : "no",
		First_Round: inventory ? null : yesNo(row.first_round),
		placement: row.placement ?? null,
		observer: row.observer,
		observed_at: row.observed_at,
		received_at: row.received_at ?? null,
		form_version: row.form_version,
		revision: row.revision,
		longitude: typeof longitude === "number" ? longitude : null,
		latitude: typeof latitude === "number" ? latitude : null
	};
}

/**
 * A text cell a spreadsheet would read as a formula (`=`, `+`, `-` or `@` after any leading spaces, or a
 * tab or line break first) starts with an apostrophe instead, so opening the file never runs it. The same
 * rule as the server export (`backend/src/fieldmaps_api/domain/observation_export.py`); numbers are not
 * text and are left alone.
 */
export function neutralizeFormula(value: string): string {
	return /^\s*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
}

/** A CSV line of text cells, each guarded like an answer (headers and codebook lines). */
function textLine(cells: readonly string[]): string {
	return csvLine(cells.map(neutralizeFormula));
}

function cellOf(value: unknown): string {
	if (value === null) return NULL_ANSWER;
	if (typeof value === "string") return neutralizeFormula(value);
	if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
	if (typeof value === "boolean") return value ? "yes" : "no";
	if (Array.isArray(value)) return value.map(entry => (entry === null ? NULL_ANSWER : cellOf(entry))).join(";");
	return JSON.stringify(value);
}

export type CsvOptions = {
	/** Start the file with a UTF-8 byte order mark, so Excel reads accents and symbols correctly. */
	readonly byteOrderMark?: boolean;
};

/** The records as CSV (RFC 4180: quoted where needed, CRLF between records). */
export function toCsv(rows: readonly ExportRow[], definitions: Definitions, options: CsvOptions = {}): string {
	const planned = plan(rows, definitions);
	const { columns } = planned;
	const lines = [textLine([...RECORD_COLUMNS.map(entry => entry.column), ...columns.map(column => column.header)])];
	for (const row of rows) {
		const record = recordValues(row);
		const cells = answerCells(planned, row);
		lines.push(
			csvLine([
				...RECORD_COLUMNS.map(entry => {
					const value = record[entry.column];
					if (value === null || value === undefined) return "";
					return typeof value === "string" ? neutralizeFormula(value) : String(value);
				}),
				...columns.map(column => (cells.has(column.header) ? cellOf(cells.get(column.header)) : ""))
			])
		);
	}
	return `${options.byteOrderMark ? "﻿" : ""}${lines.join("\r\n")}\r\n`;
}

/**
 * The records as a GeoJSON FeatureCollection, with every column as a property: a point record is a Point,
 * [longitude, latitude]; an inventory is a whole-zone record with null geometry, joined to its zone by
 * `package_id` and `zone_id`.
 */
export function toGeoJson(rows: readonly ExportRow[], definitions: Definitions): string {
	const planned = plan(rows, definitions);
	const features = rows.map(row => {
		const record = recordValues(row);
		const properties: Record<string, unknown> = {};
		for (const entry of RECORD_COLUMNS) {
			if (entry.column === "longitude" || entry.column === "latitude") continue;
			properties[entry.column] = record[entry.column] ?? null;
		}
		for (const [header, value] of answerCells(planned, row)) properties[header] = value;
		return {
			type: "Feature",
			id: row.observation_id,
			geometry: row.geometry ? { type: "Point", coordinates: [record.longitude, record.latitude] } : null,
			properties
		};
	});
	return `${JSON.stringify({ type: "FeatureCollection", features }, null, 2)}\n`;
}

/**
 * The codebook for an export of these records with these definitions: one line per column, record
 * columns first, each with where it comes from, the question as observers saw it, what its cells hold,
 * and the option codes and their labels.
 */
export function codebook(definitions: Definitions, rows: readonly ExportRow[] = []): string {
	const lines = [textLine(["export_column", "source", "label", "type", "values"])];
	for (const entry of RECORD_COLUMNS) lines.push(textLine([entry.column, "record", entry.label, entry.type, ""]));
	for (const column of plan(rows, definitions).columns)
		lines.push(
			textLine([
				column.header,
				`question ${column.questionId} (${column.formVersions.join(", ")})`,
				column.label,
				column.type,
				column.values
			])
		);
	return `${lines.join("\r\n")}\r\n`;
}

/** "play-study-observations-2026-10-08.csv": a file name from the project code, what it holds and the day. */
export function exportFileName(
	projectCode: string,
	what: "observations" | "codebook",
	dayKey: string,
	extension: "csv" | "geojson"
): string {
	return `${projectCode}-${what}-${dayKey}.${extension}`;
}
