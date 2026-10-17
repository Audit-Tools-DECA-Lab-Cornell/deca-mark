import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { load } from "./support.mjs";

const read = name =>
	JSON.parse(readFileSync(new URL(`../../../contracts/forms/${name}.json`, import.meta.url), "utf8"));

const starter = await load("features/forms/starter.ts");
const problems = await load("features/forms/problems.ts");
const raw = await load("features/forms/raw.ts");
const { loadDefinition } = await load("lib/forms/index.ts");

/** The form checker the collector and the API share must accept what the web sends. */
function accepted(definition) {
	const { form, problems: found } = loadDefinition(definition);
	assert.deepEqual(found, []);
	assert.ok(form);
}

test("a code comes from a name: lower case, dashes between words, no accents", () => {
	assert.equal(starter.codeFromName("Behaviour mapping"), "behaviour-mapping");
	assert.equal(starter.codeFromName("  Café — zone #2!  "), "cafe-zone-2");
	assert.equal(starter.codeFromName(""), "");
	assert.equal(starter.codeFromName("!!!"), "");
	const long = starter.codeFromName("a".repeat(30) + " " + "b".repeat(30));
	assert.ok(long.length <= 40);
	assert.doesNotMatch(long, /-$/);
});

test("a form code follows the API's pattern and must be new", () => {
	assert.equal(starter.formCodeProblem("workspace-check", []), null);
	assert.equal(starter.formCodeProblem("abc", ["other"]), null);
	assert.match(starter.formCodeProblem("", []), /Enter a code/);
	for (const bad of ["ab", "-abc", "abc-", "ABC", "a b c", "a_b", "x".repeat(41)])
		assert.match(starter.formCodeProblem(bad, []) ?? "", /Use 3 to 40/, bad);
	assert.match(starter.formCodeProblem("taken-code", ["taken-code"]), /already has a form/);
});

test("a form needs a name of up to 100 characters", () => {
	assert.match(starter.formNameProblem("   "), /Enter a name/);
	assert.match(starter.formNameProblem("x".repeat(101)), /100 characters/);
	assert.equal(starter.formNameProblem("Janet's form"), null);
});

test("the blank form has one starter question and passes the form checker", () => {
	const blank = starter.blankDefinition("my-form", "My form");
	assert.equal(blank.version, "my-form-v1");
	assert.equal(blank.title, "My form");
	assert.equal(blank.status, "draft");
	assert.equal(blank.questions.length, 1);
	accepted(blank);
});

test("both shipped templates start a form under its own code and name, and pass the form checker", () => {
	for (const file of ["janet-test-v1", "janet-inventory-v1"]) {
		const template = read(file);
		const definition = starter.startingDefinition(template, "my-form", "My form");
		assert.equal(definition.version, "my-form-v1");
		assert.equal(definition.title, "My form");
		assert.equal(definition.status, "draft");
		assert.equal(definition.questions.length, template.questions.length);
		accepted(definition);
	}
});

test("the three templates are the ones the screen offers", () => {
	assert.deepEqual([...starter.TEMPLATE_IDS], ["behaviour-mapping", "zone-inventory", "blank"]);
	assert.equal(starter.isTemplateId("blank"), true);
	assert.equal(starter.isTemplateId("janet-test-v1"), false);
	assert.equal(starter.isTemplateId(undefined), false);
});

test("a question added to a draft is checked like any other, and gets an id of its own", () => {
	const blank = starter.blankDefinition("my-form", "My form");
	const added = raw.addQuestion(blank, "Record", "one", "Is it raining?");
	assert.equal(added.id, "is_it_raining");
	assert.equal(added.raw.questions.at(-1).id, "is_it_raining");
	assert.deepEqual(
		added.raw.questions.at(-1).options.map(option => option.code),
		["yes", "no"]
	);
	accepted(added.raw);
	const twice = raw.addQuestion(added.raw, "Record", "text", "Is it raining?");
	assert.equal(twice.id, "is_it_raining_2");
	const zone = raw.addQuestion(blank, "Record", "text", "Zone");
	assert.equal(zone.id, "zone");
	accepted(zone.raw);
});

test("a new question goes after the last question of its act", () => {
	const behaviour = read("janet-test-v1");
	const { raw: next, id } = raw.addQuestion(behaviour, "Child", "text", "Child's name");
	assert.equal(
		next.questions.findIndex(question => question.id === id),
		1
	);
	const last = raw.addQuestion(behaviour, "Record", "text", "Anything else");
	assert.equal(last.raw.questions.at(-1).id, last.id);
});

test("an edit sets and clears optional fields without touching the original", () => {
	const blank = starter.blankDefinition("my-form", "My form");
	const reworded = raw.updateQuestion(blank, "notes", { label: "Remarks", hint: undefined });
	assert.equal(reworded.questions[0].label, "Remarks");
	assert.equal("hint" in reworded.questions[0], false);
	assert.equal(blank.questions[0].label, "Notes");
	assert.ok("hint" in blank.questions[0]);
	assert.equal(raw.removeQuestion(reworded, "notes").questions.length, 0);
});

test("a refused save puts each problem next to the question it names", () => {
	const placed = problems.draftProblems({
		definition:
			"This form cannot be used yet. questions.2.label: String should have at least 1 character; questions.0.options.1.label: String should have at least 1 character; status: Input should be 'draft' or 'published'"
	});
	assert.deepEqual(placed.byQuestion, {
		2: { label: "String should have at least 1 character" },
		0: { options: "String should have at least 1 character" }
	});
	assert.deepEqual(placed.general, ["status: Input should be 'draft' or 'published'"]);
});

test("a field id that names a question is placed directly", () => {
	const placed = problems.draftProblems({ "definition.questions.3.hint": "Too long" });
	assert.deepEqual(placed.byQuestion, { 3: { hint: "Too long" } });
	assert.deepEqual(placed.general, []);
	assert.equal(problems.questionProblemCount(placed), 1);
});

test("a problem that names no question stays in the general list, whole", () => {
	const placed = problems.draftProblems({ definition: "Form checker unavailable" });
	assert.deepEqual(placed.general, ["Form checker unavailable"]);
	assert.deepEqual(placed.byQuestion, {});
	assert.equal(problems.draftProblems(undefined), problems.NO_PROBLEMS);
});
