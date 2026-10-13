/**
 * The columns of an observation export, and the codebook that describes them, so a file and its codebook
 * always agree. Pure, with no imports, so tests and other modules load it directly.
 *
 * Record columns come first, then one column per question. Round columns follow the collector's
 * `roundColumns` (`mobile/src/domain/rounds.ts`): `Rel_Round` and `First_Round`, "yes" or "no", left
 * empty for Inventory records, which answer neither.
 */

export type RecordColumn = {
	readonly column: string;
	readonly label: string;
	/** What the cells hold, for the codebook. */
	readonly type: string;
};

/**
 * Every record column, in file order, with what each one holds: the same columns, in the same order, as
 * the server export (`backend/src/fieldmaps_api/domain/observation_export_columns.py`), so a file from
 * either reads the same.
 */
export const RECORD_COLUMNS: readonly RecordColumn[] = [
	{ column: "observation_id", label: "Observation ID", type: "text" },
	{ column: "label", label: "Short label the app shows (OBS- and the first 6 characters of the ID)", type: "text" },
	{ column: "project_id", label: "Project ID", type: "text" },
	{ column: "user_id", label: "ID of the account that uploaded the record", type: "text" },
	{ column: "site_id", label: "Site ID", type: "text" },
	{ column: "site_code", label: "Site code", type: "text" },
	{ column: "site_name", label: "Site name", type: "text" },
	{ column: "zone", label: "Zone code", type: "text" },
	{ column: "round_type", label: "Round: standard, reliability or inventory", type: "text" },
	{
		column: "Rel_Round",
		label: "Part of a reliability round; empty for inventory records",
		type: "yes or no"
	},
	{
		column: "First_Round",
		label: "First round of the observation period; empty for inventory records",
		type: "yes or no"
	},
	{
		column: "placement",
		label: "How the record was placed: hand (a point the observer placed) or zone (a whole-zone inventory record)",
		type: "text"
	},
	{ column: "observer", label: "Observer initials", type: "text" },
	{ column: "observed_at", label: "When the observation was made (ISO 8601)", type: "date and time" },
	{ column: "received_at", label: "When DECA Mark received it (ISO 8601)", type: "date and time" },
	{ column: "form_version", label: "Form version the observer answered", type: "text" },
	{ column: "revision", label: "Record revision", type: "number" },
	{ column: "longitude", label: "Longitude, EPSG:4326; empty for inventory records (whole zone)", type: "number" },
	{ column: "latitude", label: "Latitude, EPSG:4326; empty for inventory records (whole zone)", type: "number" },
	{ column: "package_id", label: "Map package (ID) the record was collected on", type: "text" },
	{ column: "map_version", label: "Map version the record was collected on (1 is v1)", type: "number" },
	{ column: "zone_id", label: "Zone identity (ID), the same on every map version", type: "text" },
	{ column: "zone_code", label: "Zone code", type: "text" },
	{ column: "zone_label_at_capture", label: "Zone name when the record was collected", type: "text" },
	{ column: "spatial_support", label: "point (a place) or zone (a whole-zone inventory record)", type: "text" },
	{
		column: "display_anchor_longitude",
		label: "Inventory records: longitude of the zone's label point, EPSG:4326",
		type: "number"
	},
	{
		column: "display_anchor_latitude",
		label: "Inventory records: latitude of the zone's label point, EPSG:4326",
		type: "number"
	}
];

export const RECORD_COLUMN_NAMES: ReadonlySet<string> = new Set(RECORD_COLUMNS.map(entry => entry.column));

/** Question ids whose answer the record's own `observer` column already carries. */
const REPEATS_RECORD_COLUMN = new Set(["observer_initials", "observer"]);

/**
 * Whether a question's answer repeats a record column: the observer's initials, which the collector also
 * sends as the record's observer. Such answers are left out of the file.
 */
export function repeatsRecordColumn(questionId: string, exportColumn = ""): boolean {
	return REPEATS_RECORD_COLUMN.has(questionId) || exportColumn === "observer";
}

/**
 * A question's column header: its export column, or its id when the source supplied none, renamed
 * `answer_<name>` when it would repeat a record column's header.
 */
export function answerHeader(questionId: string, exportColumn = ""): string {
	const base = exportColumn.trim() || questionId;
	return RECORD_COLUMN_NAMES.has(base) ? `answer_${base}` : base;
}

/** One CSV cell: quoted when it holds a comma, a quote or a line break, with quotes doubled. */
export function escapeCsv(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** One CSV line from its cells. */
export function csvLine(cells: readonly string[]): string {
	return cells.map(escapeCsv).join(",");
}

/* ── The answer-list form, for screens that already hold labelled answers ── */

export type AnswerInput = {
	readonly questionId: string;
	readonly label: string;
	readonly value: string | null;
	readonly exportColumn?: string;
};
export type AnswerColumn = {
	readonly code: string;
	readonly exportColumn: string;
	readonly label: string;
	readonly value: string | null;
};

/**
 * Labelled answers as export columns. An answer that repeats a record column (the observer's initials) is
 * left out, and any other answer whose name matches a record column is renamed `answer_<name>`, so every
 * header in the file is unique.
 */
export function answerColumns(answers: readonly AnswerInput[]): AnswerColumn[] {
	return answers.flatMap(answer => {
		if (repeatsRecordColumn(answer.questionId, answer.exportColumn)) return [];
		const exportColumn = answerHeader(answer.questionId, answer.exportColumn);
		return [{ code: answer.questionId, exportColumn, label: answer.label, value: answer.value }];
	});
}

/**
 * The codebook for labelled answers: every record column, then every answer column in the order the file
 * first meets it, each with the question as the observer saw it.
 */
export function codebookFor(rows: readonly { readonly answers: readonly AnswerColumn[] }[]): string {
	const lines = ["export_column,source,label"];
	for (const entry of RECORD_COLUMNS) lines.push(csvLine([entry.column, "record", entry.label]));
	const seen = new Set<string>();
	for (const row of rows)
		for (const answer of row.answers) {
			if (seen.has(answer.exportColumn)) continue;
			seen.add(answer.exportColumn);
			lines.push(csvLine([answer.exportColumn, `question ${answer.code}`, answer.label]));
		}
	return lines.join("\n");
}
