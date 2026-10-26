import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { buildObservation, type ObservationInput } from "../domain/build-observation";
import { packageBindingSchema } from "../domain/package-binding";
import { serializeBoundObservation, wireBodySchema } from "../sync/wire-body";
import {
  FORM_SCHEMA_VERSION,
  isUnknownSchemaVersion,
  parseFormDefinition,
  parseServedDefinition,
} from "./definition";

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

const suite = z
  .object({
    currentSchemaVersion: z.number(),
    definition: z.record(z.string(), z.unknown()),
    question: z.record(z.string(), z.unknown()),
    cases: z.array(
      z.object({
        id: z.string(),
        patch: z.record(z.string(), z.unknown()),
        definitionPatch: z.record(z.string(), z.unknown()).optional(),
        valid: z.boolean(),
        // A schema version is served beside the definition, never inside it.
        schemaVersion: z.unknown().optional(),
        refusal: z.literal("unknown_schema_version").optional(),
      }),
    ),
  })
  .parse(
    JSON.parse(
      readFileSync(
        new URL("../../../contracts/forms/definition.cases.json", import.meta.url),
        "utf8",
      ),
    ),
  );

describe("shared canonical definition cases", () => {
  for (const scenario of suite.cases) {
    it(scenario.id, () => {
      // Given the same authored input as Python.
      const input = {
        ...suite.definition,
        ...scenario.definitionPatch,
        questions: [{ ...suite.question, ...scenario.patch }],
      };
      if ("schemaVersion" in scenario) {
        // When the parser reads the definition with the version the API served beside it.
        if (scenario.valid)
          expect(parseServedDefinition(scenario.schemaVersion, input).questions).toHaveLength(1);
        else {
          // Then an unknown version is refused with the stable code, not parsed on a guess.
          const refusal = thrown(() => parseServedDefinition(scenario.schemaVersion, input));
          expect(isUnknownSchemaVersion(refusal)).toBe(true);
          expect(refusal).toMatchObject({ code: scenario.refusal });
        }
        return;
      }
      // When the production parser reads it, then it agrees with the contract.
      if (scenario.valid) expect(parseFormDefinition(input).questions).toHaveLength(1);
      else expect(() => parseFormDefinition(input)).toThrow();
    });
  }

  it("reads the schema version the contract names as current", () => {
    expect(FORM_SCHEMA_VERSION).toBe(suite.currentSchemaVersion);
  });

  it("refuses a definition served with no schema version", () => {
    const input = { ...suite.definition, questions: [suite.question] };
    expect(isUnknownSchemaVersion(thrown(() => parseServedDefinition(undefined, input)))).toBe(
      true,
    );
  });

  for (const bound of ["min", "max"]) {
    for (const value of [Infinity, -Infinity, NaN]) {
      it(`rejects ${bound}=${value}`, () => {
        const input = {
          ...suite.definition,
          questions: [{ ...suite.question, [bound]: value }],
        };
        expect(() => parseFormDefinition(input)).toThrow();
      });
    }
  }
});

describe("bounded canonical collection", () => {
  for (const { id, answer } of [
    { id: "equal-positive-bounds", answer: 10 },
    { id: "ordered-negative-bounds", answer: -3 },
    { id: "equal-zero-bounds", answer: 0 },
    { id: "answer-id-round_type", answer: 3 },
  ]) {
    it(`collects and serializes ${id} through the production builder`, () => {
      const scenario = suite.cases.find((candidate) => candidate.id === id);
      if (!scenario) throw new Error(`Missing authored case ${id}`);
      const form = parseFormDefinition({
        ...suite.definition,
        status: "published",
        questions: [{ ...suite.question, min: 0, max: 10, ...scenario.patch }],
      });
      const question = form.questions[0];
      if (!question || question.max === undefined) throw new Error("Bounded question required");
      const binding = packageBindingSchema.parse({
        issuer: "https://synthetic.invalid/auth/v1",
        projectId: "10000000-0000-4000-8000-000000000002",
        siteId: "10000000-0000-4000-8000-000000000003",
        packageId: "10000000-0000-4000-8000-000000000004",
        packageVersion: 1,
        packageSha256: "a".repeat(64),
        zoneId: "10000000-0000-4000-8000-000000000005",
        zoneCode: "A",
        zoneLabel: "Synthetic zone",
      });
      const input: ObservationInput = {
        id: "10000000-0000-4000-8000-000000000006",
        form,
        answers: { [question.id]: answer },
        binding,
        projectId: binding.projectId,
        siteId: binding.siteId,
        observer: "QA",
        coordinates: [-76.4857, 42.4482],
        createdAt: "2026-10-17T12:00:00.000Z",
        context: {
          packageId: binding.packageId,
          packageVersion: "v1",
          zoneId: binding.zoneCode,
          zoneLabel: binding.zoneLabel,
          roundType: "standard",
          freshPeriod: true,
          inheritedFrom: "",
        },
        placement: { source: "hand", gpsAccuracyMetres: null },
      };
      const result = buildObservation(input);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.message);
      const wire = wireBodySchema.parse(JSON.parse(serializeBoundObservation(result.record)));
      expect(wire.round_type).toBe("standard");
      expect(wire.answers).toEqual({ [question.id]: answer });
      expect(buildObservation({ ...input, answers: { [question.id]: question.max + 1 } }).ok).toBe(
        false,
      );
    });
  }
});
