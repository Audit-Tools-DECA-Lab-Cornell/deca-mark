import assert from "node:assert/strict";
import test from "node:test";

import { load } from "./support.mjs";

const { moveQuestion, renameQuestion, questionIdColumns } = await load("features/forms/operations.ts");
const { blankDefinition } = await load("features/forms/starter.ts");
const question = (id, extra = {}) => ({
	id,
	code: id,
	exportColumn: `old_${id}`,
	label: id,
	kind: "one",
	act: "Record",
	options: [
		{ code: "yes", label: "Yes" },
		{ code: "no", label: "No" }
	],
	source: "test",
	...extra
});
const fixture = () => ({
	...blankDefinition("ordering", "Ordering"),
	questions: [
		question("parent"),
		question("child", {
			dependsOn: {
				kind: "all",
				of: [
					{ kind: "answered", question: "parent" },
					{ kind: "any", of: [{ kind: "equals", question: "parent", option: "yes" }] }
				]
			},
			dynamicFrom: {
				question: "parent",
				sets: {
					yes: {
						code: "yes_set",
						exportColumn: "old_yes",
						label: "Yes details",
						options: [{ code: "first", label: "First" }]
					}
				}
			}
		}),
		question("independent")
	]
});

test("moving an independent question preserves authored values and the original definition", () => {
	const before = fixture();
	const result = moveQuestion(before, "independent", 0);
	assert.equal(result.ok, true);
	assert.deepEqual(
		result.raw.questions.map(q => q.id),
		["independent", "parent", "child"]
	);
	assert.deepEqual(
		before.questions.map(q => q.id),
		["parent", "child", "independent"]
	);
	assert.deepEqual(result.raw.questions[2], before.questions[1]);
});

test("moving either side of a visibility or dynamic dependency refuses an invalid order", () => {
	for (const [id, at] of [
		["child", 0],
		["parent", 2]
	]) {
		const result = moveQuestion(fixture(), id, at);
		assert.equal(result.ok, false);
		assert.match(result.problem, /after.*parent.*uses that answer/);
	}
	const dynamicOnly = fixture();
	delete dynamicOnly.questions[1].dependsOn;
	assert.equal(moveQuestion(dynamicOnly, "child", 0).ok, false);
});

test("renaming a parent updates every nested condition and dynamic reference atomically", () => {
	const before = fixture();
	const result = renameQuestion(before, "parent", "renamed_parent");
	assert.equal(result.ok, true);
	assert.equal(result.id, "renamed_parent");
	const child = result.raw.questions[1];
	assert.equal(child.dependsOn.of[0].question, "renamed_parent");
	assert.equal(child.dependsOn.of[1].of[0].question, "renamed_parent");
	assert.equal(child.dynamicFrom.question, "renamed_parent");
	assert.equal(before.questions[1].dynamicFrom.question, "parent");
	assert.equal(result.raw.questions[0].exportColumn, "renamed_parent");
	assert.equal(child.dynamicFrom.sets.yes.exportColumn, "child");
});

test("blank and duplicate IDs are refused without replacing a question", () => {
	const before = fixture();
	assert.equal(renameQuestion(before, "parent", " ").ok, false);
	assert.equal(renameQuestion(before, "parent", "child").ok, false);
	assert.equal(renameQuestion(before, "parent", " parent ").ok, true);
	assert.equal(renameQuestion(before, "missing", "different").ok, false);
});

test("new version columns use question IDs for ordinary and dependent option sets", () => {
	const before = fixture();
	const next = questionIdColumns(before);
	assert.equal(next.questions[0].exportColumn, "parent");
	assert.equal(next.questions[1].exportColumn, "child");
	assert.equal(next.questions[1].dynamicFrom.sets.yes.exportColumn, "child");
	assert.equal(before.questions[1].dynamicFrom.sets.yes.exportColumn, "old_yes");
	assert.deepEqual(questionIdColumns(next), next);
});
