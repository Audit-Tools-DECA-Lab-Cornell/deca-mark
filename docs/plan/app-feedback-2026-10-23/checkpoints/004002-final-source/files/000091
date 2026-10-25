import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type AnswerValue, formDefinitionSchema, parseFormDefinition } from "./definition";
import { pruneAnswers, reviewProblems, visibleQuestions } from "./engine";

const contracts = new URL("../../../contracts/", import.meta.url);
const casesDirectory = new URL("forms/cases/", contracts);
const answers = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
);
const suiteSchema = z.object({
  formVersion: z.string(),
  definitions: z.record(z.string(), z.unknown()),
  cases: z
    .array(
      z.object({
        id: z.string(),
        definition: z.string().optional(),
        steps: z
          .array(
            z.object({
              answers,
              expected: z.object({
                visible: z.array(z.string()),
                problems: z.array(z.object({ id: z.string(), reason: z.string() })),
                answers,
                dropped: z.array(z.string()),
                options: z.record(z.string(), z.array(z.string())).optional(),
              }),
            }),
          )
          .min(1),
      }),
    )
    .min(1),
});

const files = readdirSync(casesDirectory)
  .filter((name) => name.endsWith(".cases.json"))
  .sort();
for (const filename of files) {
  const suite = suiteSchema.parse(
    JSON.parse(readFileSync(new URL(filename, casesDirectory), "utf8")),
  );
  const canonical: unknown = JSON.parse(
    readFileSync(new URL(`forms/${suite.formVersion}.json`, contracts), "utf8"),
  );
  describe(filename, () => {
    for (const scenario of suite.cases) {
      it(scenario.id, () => {
        // Given a canonical definition or an explicitly synthetic test definition.
        const definition =
          scenario.definition === undefined ? canonical : suite.definitions[scenario.definition];
        const form = parseFormDefinition(definition);
        for (const step of scenario.steps) {
          const inputAnswers = step.answers as unknown as Readonly<Record<string, AnswerValue>>;
          // When the engine evaluates this answer snapshot.
          const visible = visibleQuestions(form, inputAnswers);
          const problems = reviewProblems(form, inputAnswers);
          const pruned = pruneAnswers(form, inputAnswers);
          // Then it matches the language-neutral contract, including hidden-answer pruning.
          expect(visible.map((question) => question.id)).toEqual(step.expected.visible);
          expect(problems.map(({ question, reason }) => ({ id: question.id, reason }))).toEqual(
            step.expected.problems,
          );
          expect(pruned.answers).toEqual(step.expected.answers);
          expect(pruned.dropped.map((question) => question.id)).toEqual(step.expected.dropped);
          for (const [id, options] of Object.entries(step.expected.options ?? {})) {
            expect(
              visible.find((question) => question.id === id)?.options.map((option) => option.code),
            ).toEqual(options);
          }
        }
      });
    }
  });
}

it("keeps the generated input schema current", () => {
  const schema: unknown = JSON.parse(
    readFileSync(new URL("form-definition.schema.json", contracts), "utf8"),
  );
  expect(files.length).toBeGreaterThan(0);
  expect(schema).toEqual(z.toJSONSchema(formDefinitionSchema, { io: "input" }));
});
