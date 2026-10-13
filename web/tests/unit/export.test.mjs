import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { observation, PROJECT, USER, uuid } from "./fixtures.mjs";
import { load } from "./support.mjs";

const { codebook, exportColumns, exportFileName, neutralizeFormula, NULL_ANSWER, toCsv, toGeoJson } =
	await load("lib/export/observations.ts");
const { RECORD_COLUMNS } = await load("lib/export/columns.ts");

const janet = JSON.parse(readFileSync(new URL("../../../contracts/forms/janet-test-v1.json", import.meta.url), "utf8"));
const legacy = {
	fields: [
		{ code: "people", type: "integer" },
		{ code: "notes", type: "text" }
	]
};
const definitions = { "janet-test-v1": janet, "shell-v1": legacy };

function row(overrides = {}) {
	return observation({
		observation_id: "3f2a1b9c-0000-4000-8000-000000000001",
		first_round: true,
		received_at: "2026-10-08T17:00:00Z",
		form_version: "janet-test-v1",
		geometry: { type: "Point", coordinates: [-76.4857123, 42.4483456] },
		...overrides
	});
}

/** A small RFC 4180 reader, enough to read back what toCsv writes. */
function parseCsv(text) {
	const rows = [];
	let field = "";
	let current = [];
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (quoted) {
			if (char === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (char === '"') quoted = false;
			else field += char;
		} else if (char === '"') quoted = true;
		else if (char === ",") {
			current.push(field);
			field = "";
		} else if (char === "\r" && text[i + 1] === "\n") {
			current.push(field);
			rows.push(current);
			current = [];
			field = "";
			i++;
		} else field += char;
	}
	if (field !== "" || current.length > 0) rows.push([...current, field]);
	return rows;
}

function table(csv) {
	const [header, ...rows] = parseCsv(csv);
	return rows.map(cells => Object.fromEntries(header.map((name, index) => [name, cells[index]])));
}

test("record columns come first, then each question's export column or id; the observer answer is left out", () => {
	const [header] = parseCsv(toCsv([row()], definitions));
	assert.deepEqual(
		header.slice(0, RECORD_COLUMNS.length),
		RECORD_COLUMNS.map(entry => entry.column)
	);
	const answers = header.slice(RECORD_COLUMNS.length);
	assert.ok(answers.includes("Child_AgeRange"));
	assert.ok(answers.includes("wildlife_interaction"), "a question without an export column uses its id");
	assert.ok(!answers.includes("observer") && !answers.includes("answer_observer"));
	assert.ok(answers.includes("people") && answers.includes("notes"), "legacy fields get columns too");
	assert.equal(new Set(header).size, header.length);
});

test("commas, quotes, line breaks and Unicode survive a round trip", () => {
	const note = 'Said "again", then\nleft — 🌿 café';
	const csv = toCsv([row({ answers: { play_event_summary: note } })], definitions);
	assert.ok(csv.endsWith("\r\n"));
	const [record] = table(csv);
	assert.equal(record.Play_Event_Summary, note);
	assert.equal(record.label, "OBS-3F2A1B");
	assert.ok(toCsv([row()], definitions, { byteOrderMark: true }).startsWith("﻿"));
});

test("a missing answer is an empty cell and a null answer is n/a", () => {
	const [record] = table(toCsv([row({ answers: { age_range: null } })], definitions));
	assert.equal(record.Child_AgeRange, NULL_ANSWER);
	assert.equal(record.Play_Type_1, "");
});

test("round, zone and placement columns follow the collector; an older form's fields get columns", () => {
	const rows = [
		row({ round_type: "reliability", first_round: false }),
		row({ round_type: "inventory", first_round: null, placement: "zone" }),
		row({ form_version: "shell-v1", answers: { people: 3 } })
	];
	const [reliability, inventory, old] = table(toCsv(rows, definitions));
	assert.deepEqual(
		[reliability.round_type, reliability.Rel_Round, reliability.First_Round],
		["reliability", "yes", "no"]
	);
	assert.deepEqual(
		[inventory.round_type, inventory.Rel_Round, inventory.First_Round, inventory.placement],
		["inventory", "", "", "zone"]
	);
	assert.equal(old.people, "3");
	assert.equal(old.Child_AgeRange, "", "a column another form fills is empty for this record");
});

test("each record names its project, uploader, site, map version and the zone as it was recorded", () => {
	const [record] = table(
		toCsv(
			[
				row({
					package_id: uuid(102),
					package_version: 2,
					zone_id: uuid(201),
					zone_code: "MEADOW",
					zone_label: "North meadow"
				})
			],
			definitions
		)
	);
	assert.deepEqual(
		[record.project_id, record.user_id, record.site_id, record.site_code, record.site_name],
		[PROJECT, USER, uuid(1), "fall-creek", "Fall Creek"]
	);
	assert.deepEqual(
		[record.zone, record.zone_id, record.zone_code, record.zone_label_at_capture],
		["MEADOW", uuid(201), "MEADOW", "North meadow"]
	);
	assert.deepEqual([record.package_id, record.map_version, record.spatial_support], [uuid(102), "2", "point"]);
	assert.deepEqual([record.display_anchor_longitude, record.display_anchor_latitude], ["", ""]);
});

test("an inventory is a whole-zone record: no point, the zone's label point instead", () => {
	const inventory = row({
		round_type: "inventory",
		placement: "zone",
		spatial_support: "zone",
		geometry: null,
		display_anchor: { type: "Point", coordinates: [-76.49, 42.45] }
	});
	const [record] = table(toCsv([inventory], definitions));
	assert.deepEqual([record.longitude, record.latitude], ["", ""]);
	assert.deepEqual([record.display_anchor_longitude, record.display_anchor_latitude], ["-76.49", "42.45"]);
	assert.equal(record.spatial_support, "zone");
	const [feature] = JSON.parse(toGeoJson([inventory], definitions)).features;
	assert.equal(feature.geometry, null);
	assert.equal(feature.properties.zone_id, uuid(200));
	assert.equal(feature.properties.display_anchor_longitude, -76.49);
});

test("a text cell a spreadsheet would run as a formula starts with an apostrophe, as the server writes it", () => {
	for (const [value, written] of [
		["=SUM(A1)", "'=SUM(A1)"],
		["+1", "'+1"],
		["-2", "'-2"],
		["@cmd", "'@cmd"],
		["  =1", "'  =1"],
		["\tx", "'\tx"],
		["\nx", "'\nx"],
		["a=b", "a=b"],
		["", ""]
	])
		assert.equal(neutralizeFormula(value), written, JSON.stringify(value));
	const [record] = table(
		toCsv([row({ observer: "=HYPERLINK(1)", answers: { play_event_summary: "-x" } })], definitions)
	);
	assert.equal(record.observer, "'=HYPERLINK(1)");
	assert.equal(record.Play_Event_Summary, "'-x");
	assert.equal(record.longitude, "-76.4857123", "numbers are not text");
	const book = codebook({ x: { questions: [{ id: "q", kind: "text", label: "-Notes", exportColumn: "=Q" }] } }, [
		row({ form_version: "x", answers: { q: "1" } })
	]);
	assert.ok(book.includes("\r\n'=Q,question q (x),'-Notes,text,\r\n"));
	assert.ok(
		parseCsv(
			toCsv([row({ form_version: "x", answers: { q: "1" } })], {
				x: { questions: [{ id: "q", kind: "text", label: "Q", exportColumn: "=Q" }] }
			})
		)[0].includes("'=Q")
	);
});

test("multi-select answers join their codes; coordinates keep full precision", () => {
	const definition = {
		questions: [
			{
				id: "parts",
				kind: "many",
				label: "Parts",
				exportColumn: "Parts",
				options: [
					{ code: "a", label: "A" },
					{ code: "b", label: "B" }
				]
			}
		]
	};
	const [record] = table(toCsv([row({ form_version: "x", answers: { parts: ["a", "b"] } })], { x: definition }));
	assert.equal(record.Parts, "a;b");
	assert.equal(record.longitude, "-76.4857123");
	assert.equal(record.latitude, "42.4483456");
});

test("an answer the definition does not have keeps its own column", () => {
	const [record] = table(toCsv([row({ answers: { surprise: "kept", zone: "dup" } })], definitions));
	assert.equal(record.surprise, "kept");
	assert.equal(record.answer_zone, "dup", "an answer named like a record column is renamed");
	assert.equal(record.zone, "A");
});

test("GeoJSON points are [longitude, latitude]; missing answers are absent and null answers null", () => {
	const collection = JSON.parse(
		toGeoJson(
			[row({ answers: { age_range: null, play_type_1: "physical", observer_initials: "OB" } })],
			definitions
		)
	);
	assert.equal(collection.type, "FeatureCollection");
	const [feature] = collection.features;
	assert.deepEqual(feature.geometry, { type: "Point", coordinates: [-76.4857123, 42.4483456] });
	assert.equal(feature.id, "3f2a1b9c-0000-4000-8000-000000000001");
	assert.equal(feature.properties.Child_AgeRange, null);
	assert.equal(feature.properties.Play_Type_1, "physical");
	assert.equal("Play_Type_2" in feature.properties, false);
	assert.equal("observer_initials" in feature.properties, false);
	assert.equal("longitude" in feature.properties, false);
	assert.equal(feature.properties.observer, "OB");
	assert.equal(feature.properties.zone, "A");
});

test("the codebook lists exactly the file's columns, with labels, types and option codes", () => {
	const rows = [row({ answers: { surprise: "kept" } })];
	const lines = parseCsv(codebook(definitions, rows));
	assert.deepEqual(lines[0], ["export_column", "source", "label", "type", "values"]);
	const [header] = parseCsv(toCsv(rows, definitions));
	assert.deepEqual(
		lines.slice(1).map(line => line[0]),
		header
	);
	const age = lines.find(line => line[0] === "Child_AgeRange");
	assert.equal(age[1], "question age_range (janet-test-v1)");
	assert.equal(age[2], "How old is the target child?");
	assert.equal(age[3], "one option");
	assert.match(age[4], /^age_0_2 = 0–2 yrs; age_3_5 = 3–5 yrs/);
	assert.equal(lines.find(line => line[0] === "people")[3], "number");
	assert.equal(exportColumns(rows, definitions).at(-1).type, "unknown");
});

test("a dynamic question is written under the export column of the set its play type selected", () => {
	const rows = [
		row({
			answers: { play_type_1: "physical", play_subtype_1: "gross_motor", play_type_2: "bio", play_subtype_2: "x" }
		}),
		row({
			observation_id: "3f2a1b9c-0000-4000-8000-000000000002",
			answers: { play_type_1: "imaginative", play_subtype_1: "symbolic" }
		})
	];
	const [header] = parseCsv(toCsv(rows, definitions));
	const [physical, imaginative] = table(toCsv(rows, definitions));
	assert.equal(physical.Phys_Subtype, "gross_motor");
	assert.equal(physical.Imag_Subtype, "");
	assert.equal(imaginative.Imag_Subtype, "symbolic");
	assert.equal(imaginative.Phys_Subtype, "");
	assert.ok(!header.includes("play_subtype_1"), "no record needs the question's own column");
	for (const column of ["Phys_Subtype", "Expl_Subtype", "Imag_Subtype", "PwR_Subtype", "Non_Subtype"])
		assert.ok(header.includes(column), `${column} has its own column`);
	assert.equal(physical.play_subtype_2, "x", "a set without an export name keeps the question's own column");

	const properties = JSON.parse(toGeoJson(rows, definitions)).features[0].properties;
	assert.equal(properties.Phys_Subtype, "gross_motor");
	assert.equal("play_subtype_1" in properties, false);

	const lines = parseCsv(codebook(definitions, rows));
	assert.deepEqual(
		lines.slice(1).map(line => line[0]),
		header
	);
	const phys = lines.find(line => line[0] === "Phys_Subtype");
	assert.equal(phys[1], "question play_subtype_1 (janet-test-v1)");
	assert.equal(phys[2], "Physical play — which kind?");
	assert.equal(
		phys[4],
		"gross_motor = Gross motor; fine_motor = Fine motor; vestibular = Vestibular; rough_and_tumble = Rough & tumble"
	);
	assert.equal(lines.find(line => line[0] === "Imag_Subtype")[2], "Imaginative play — which kind?");
});

test("a dynamic answer no named set covers keeps the question's own column", () => {
	const rows = [
		row({ answers: { play_subtype_1: "gross_motor" } }),
		row({ answers: { play_type_1: "mystery", play_subtype_1: "other" } }),
		row({ answers: { play_type_1: "physical", play_subtype_1: "fine_motor" } })
	];
	const records = table(toCsv(rows, definitions));
	assert.deepEqual(
		records.map(record => [record.play_subtype_1, record.Phys_Subtype]),
		[
			["gross_motor", ""],
			["other", ""],
			["", "fine_motor"]
		]
	);
	const columns = exportColumns(rows, definitions).map(column => column.header);
	assert.ok(columns.includes("play_subtype_1"));
	assert.ok(columns.indexOf("play_subtype_1") < columns.indexOf("Phys_Subtype"));
	assert.ok(codebook(definitions, rows).includes("\r\nplay_subtype_1,"));
});

test("a renamed column that is taken too is renamed again, and no question loses its column", () => {
	const question = (id, exportColumn) => ({ id, kind: "text", label: id, exportColumn });
	const definition = {
		questions: [question("q1", "zone"), question("q3", "answer_zone_q2"), question("q2", "answer_zone")]
	};
	const rows = [row({ form_version: "x", answers: { q1: "one", q2: "two", q3: "three" } })];
	const [record] = table(toCsv(rows, { x: definition }));
	const [header] = parseCsv(toCsv(rows, { x: definition }));
	assert.equal(new Set(header).size, header.length, "every header is unique");
	assert.equal(record.answer_zone, "one");
	assert.equal(record.answer_zone_q2, "three");
	assert.equal(record.answer_zone_q2_2, "two");
	assert.equal(record.zone, "A");
	const found = JSON.parse(toGeoJson(rows, { x: definition })).features[0].properties;
	assert.deepEqual([found.answer_zone, found.answer_zone_q2, found.answer_zone_q2_2], ["one", "three", "two"]);
});

test("an answer the definition lacks cannot take a column a question already has", () => {
	const definition = { questions: [{ id: "a", kind: "text", label: "A", exportColumn: "answer_zone_extra" }] };
	const rows = [row({ form_version: "x", answers: { a: "kept", extra: "other", zone: "dup" } })];
	const [record] = table(toCsv(rows, { x: definition }));
	assert.equal(record.answer_zone_extra, "kept");
	assert.equal(record.answer_zone, "dup");
	assert.equal(record.extra, "other");
});

test("export file names say what they hold and when", () => {
	assert.equal(
		exportFileName("play-study", "observations", "2026-10-08", "csv"),
		"play-study-observations-2026-10-08.csv"
	);
	assert.equal(exportFileName("play-study", "codebook", "2026-10-08", "csv"), "play-study-codebook-2026-10-08.csv");
});
