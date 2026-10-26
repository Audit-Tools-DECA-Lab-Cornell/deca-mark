import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { load } from "./support.mjs";

const suite = JSON.parse(
	readFileSync(new URL("../../../contracts/forms/definition.cases.json", import.meta.url), "utf8")
);
const { FORM_SCHEMA_VERSION, isUnknownSchemaVersion, parseFormDefinition, parseServedDefinition, loadDefinition } =
	await load("lib/forms/index.ts");
const { addQuestion } = await load("features/forms/raw.ts");

for (const scenario of suite.cases) {
	test(`canonical definition: ${scenario.id}`, () => {
		const input = {
			...suite.definition,
			...scenario.definitionPatch,
			questions: [{ ...suite.question, ...scenario.patch }]
		};
		if (Object.hasOwn(scenario, "schemaVersion")) {
			// The version is served beside the definition, never inside it.
			if (scenario.valid) assert.equal(parseServedDefinition(scenario.schemaVersion, input).questions.length, 1);
			else
				assert.throws(
					() => parseServedDefinition(scenario.schemaVersion, input),
					error => isUnknownSchemaVersion(error) && error.code === scenario.refusal
				);
			return;
		}
		if (scenario.valid) assert.equal(parseFormDefinition(input).questions.length, 1);
		else assert.throws(() => parseFormDefinition(input));
		const loaded = loadDefinition(input);
		assert.equal(loaded.form !== null, scenario.valid);
		assert.equal(loaded.problems.length === 0, scenario.valid);
	});
}

test("the engine reads the schema version the contract names as current", () => {
	assert.equal(FORM_SCHEMA_VERSION, suite.currentSchemaVersion);
});

test("the engine refuses a definition served with no schema version", () => {
	const input = { ...suite.definition, questions: [suite.question] };
	assert.throws(() => parseServedDefinition(undefined, input), isUnknownSchemaVersion);
});

test("the editor allows an envelope name while retaining duplicate question protection", () => {
	const first = addQuestion({ ...suite.definition, questions: [] }, "Play", "text", "Round type");
	const second = addQuestion(first.raw, "Play", "text", "Round type");
	assert.equal(first.id, "round_type");
	assert.equal(second.id, "round_type_2");
	assert.deepEqual(loadDefinition(second.raw).problems, []);
});
