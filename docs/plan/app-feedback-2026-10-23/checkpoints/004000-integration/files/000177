import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { load } from "./support.mjs";

const { answerLabel, answerRows, humanize, NOT_ANSWERED, playTypeQuestion, questionLabel, readDefinition } =
	await load("lib/observations/answers.ts");

const janet = JSON.parse(readFileSync(new URL("../../../contracts/forms/janet-test-v1.json", import.meta.url), "utf8"));
const inventory = JSON.parse(
	readFileSync(new URL("../../../contracts/forms/janet-inventory-v1.json", import.meta.url), "utf8")
);
/** The legacy practice form as the database stores it (`supabase/migrations/…_fieldops_initial.sql`). */
const legacy = {
	status: "practice-only",
	fields: [
		{ code: "people", type: "integer", required: true, minimum: 0, maximum: 999 },
		{ code: "notes", type: "text", required: false, maxLength: 1000 },
		{ code: "weather_kind", type: "choice", options: ["sunny", "cloudy"] },
		{ code: "loose_parts", type: "multi-choice", options: ["sticks", "stones"] },
		{ code: "supervised", type: "boolean" }
	]
};

test("reads a canonical definition", () => {
	const model = readDefinition(janet);
	assert.equal(model.legacy, false);
	assert.equal(model.version, "janet-test-v1");
	assert.equal(model.questions.length, 12);
	assert.equal(model.protocolNotes.length, janet.protocolNotes.length);
	assert.equal(questionLabel(janet, "age_range"), "How old is the target child?");
});

test("reads a legacy fields definition, with labels from the codes", () => {
	const model = readDefinition(legacy);
	assert.equal(model.legacy, true);
	assert.deepEqual(
		model.questions.map(question => [question.id, question.kind, question.label]),
		[
			["people", "number", "People"],
			["notes", "text", "Notes"],
			["weather_kind", "one", "Weather kind"],
			["loose_parts", "many", "Loose parts"],
			["supervised", "boolean", "Supervised"]
		]
	);
});

test("labels one, many, text and number answers", () => {
	assert.equal(answerLabel(janet, "age_range", "age_6_8"), "6–8 yrs");
	const [sun, , overcast] = inventory.questions[0].options;
	assert.equal(answerLabel(inventory, "weather", ["full_sun", "overcast"]), `${sun.label}, ${overcast.label}`);
	assert.equal(answerLabel(janet, "play_event_summary", "Two children on the swings"), "Two children on the swings");
	assert.equal(answerLabel(legacy, "people", 1204), "1,204");
	assert.equal(answerLabel(legacy, "weather_kind", "sunny"), "sunny");
	assert.equal(answerLabel(legacy, "loose_parts", ["sticks", "stones"]), "sticks, stones");
	assert.equal(answerLabel(legacy, "supervised", false), "No");
});

test("a missing, null or empty answer reads Not answered; an unknown option reads as stored", () => {
	assert.equal(answerLabel(janet, "age_range", undefined), NOT_ANSWERED);
	assert.equal(answerLabel(janet, "age_range", null), NOT_ANSWERED);
	assert.equal(answerLabel(janet, "age_range", ""), NOT_ANSWERED);
	assert.equal(answerLabel(janet, "age_range", []), NOT_ANSWERED);
	assert.equal(answerLabel(janet, "age_range", "age_99"), "age_99");
	assert.equal(answerLabel(janet, "no_such_question", "x"), "x");
});

test("a dynamic option set is chosen by the parent's answer", () => {
	const answers = { play_type_1: "physical", play_subtype_1: "gross_motor" };
	const rows = answerRows(janet, answers);
	const subtype = rows.find(row => row.questionId === "play_subtype_1");
	assert.equal(subtype.label, janet.questions[2].dynamicFrom.sets.physical.label);
	assert.equal(subtype.value, "Gross motor");
	assert.equal(answerLabel(janet, "play_subtype_1", "gross_motor"), "Gross motor");
});

test("rows follow the form's order, skip hidden and unanswered questions, and keep unknown answers last", () => {
	const answers = {
		play_event_summary: "Tag game",
		age_range: "age_3_5",
		wildlife_interaction: "no",
		wildlife_description: "should stay hidden",
		cars_intensity: "",
		extra_note: "kept"
	};
	const rows = answerRows(janet, answers);
	assert.deepEqual(
		rows.map(row => row.questionId),
		["age_range", "wildlife_interaction", "play_event_summary", "extra_note"]
	);
	assert.equal(rows.at(-1).known, false);
	assert.equal(rows.at(-1).label, "Extra note");
});

test("legacy records list their answers in field order", () => {
	const rows = answerRows(legacy, { notes: "Sunny — 🌿", people: 3 });
	assert.deepEqual(
		rows.map(row => [row.label, row.value]),
		[
			["People", "3"],
			["Notes", "Sunny — 🌿"]
		]
	);
});

test("an unreadable definition still lists the answers", () => {
	for (const definition of [null, "x", {}, { questions: "nope" }]) {
		const rows = answerRows(definition, { people: 2 });
		assert.deepEqual(
			rows.map(row => [row.label, row.value, row.known]),
			[["People", "2", false]]
		);
	}
});

test("play type is the first single-choice Play question", () => {
	assert.equal(playTypeQuestion(janet).id, "play_type_1");
	assert.equal(playTypeQuestion(inventory), undefined);
	assert.equal(humanize("Rel_Round"), "Rel round");
	assert.equal(humanize("playType1"), "Play type1");
});

test("decimal display retains small and high-precision values", () => {
	for (const value of [0.00000001, -12.1234567890123, 1.23456789012345e100])
		assert.equal(answerLabel(legacy, "people", value), String(value));
});

test("date/time answers use their saved format and zone without changing stored values", () => {
	const definition = {
		questions: [
			{
				id: "when",
				label: "When?",
				kind: "dateTime",
				dateTime: { mode: "dateTime", dateFormat: "dayFirst", timeFormat: "12h", timeZone: "America/New_York" }
			}
		]
	};
	const value = "2026-10-24T18:30:00.000Z";
	assert.equal(answerLabel(definition, "when", value), "24/10/2026 2:30:00 PM");
	assert.equal(answerRows(definition, { when: value })[0].raw, value);
});
