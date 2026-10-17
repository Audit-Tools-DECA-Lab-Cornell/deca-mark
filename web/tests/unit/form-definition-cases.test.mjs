import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { load } from "./support.mjs";

const suite = JSON.parse(
	readFileSync(new URL("../../../contracts/forms/definition.cases.json", import.meta.url), "utf8")
);
const { parseFormDefinition, loadDefinition } = await load("lib/forms/index.ts");
const { addQuestion } = await load("features/forms/raw.ts");

for (const scenario of suite.cases) {
	test(`canonical definition: ${scenario.id}`, () => {
		const input = {
			...suite.definition,
			questions: [{ ...suite.question, ...scenario.patch }]
		};
		if (scenario.valid) assert.equal(parseFormDefinition(input).questions.length, 1);
		else assert.throws(() => parseFormDefinition(input));
		const loaded = loadDefinition(input);
		assert.equal(loaded.form !== null, scenario.valid);
		assert.equal(loaded.problems.length === 0, scenario.valid);
	});
}

test("the editor allows an envelope name while retaining duplicate question protection", () => {
	const first = addQuestion({ ...suite.definition, questions: [] }, "Play", "text", "Round type");
	const second = addQuestion(first.raw, "Play", "text", "Round type");
	assert.equal(first.id, "round_type");
	assert.equal(second.id, "round_type_2");
	assert.deepEqual(loadDefinition(second.raw).problems, []);
});
