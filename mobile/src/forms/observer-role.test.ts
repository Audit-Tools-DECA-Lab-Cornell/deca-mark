import { describe, expect, it } from "vitest";
import { buildObservation, type ObservationInput } from "../domain/build-observation";
import { type Answers, parseFormDefinition } from "./definition";
import { janetInventoryV1 } from "./fixtures/janet-inventory-v1";
import { janetTestV1 } from "./fixtures/janet-test-v1";
import { carriedQuestionIds } from "./registry";

const context: ObservationInput["context"] = {
  packageId: "test",
  packageVersion: "v1",
  zoneId: "A",
  zoneLabel: "Zone A",
  roundType: "standard",
  freshPeriod: true,
  inheritedFrom: "",
};

describe("Manual observer role", () => {
  for (const template of [janetTestV1, janetInventoryV1]) {
    for (const observer of [undefined, "AC"]) {
      it(`${template.version} retains the entered observer after column and ID changes (${observer})`, () => {
        const form = parseFormDefinition({
          ...template,
          version: "copied-v2",
          columnNaming: "questionId",
          questions: template.questions.map((question) => ({
            ...question,
            ...(question.id === "observer_initials" ? { id: "recorded_by", role: "observer" } : {}),
            exportColumn: question.id === "observer_initials" ? "recorded_by" : question.id,
            ...(question.dynamicFrom
              ? {
                  dynamicFrom: {
                    ...question.dynamicFrom,
                    sets: Object.fromEntries(
                      Object.entries(question.dynamicFrom.sets).map(([key, set]) => [
                        key,
                        { ...set, exportColumn: question.id },
                      ]),
                    ),
                  },
                }
              : {}),
          })),
        });
        const answers: Answers = Object.fromEntries(
          form.questions.map((question) => [
            question.id,
            question.kind === "number"
              ? 0
              : question.kind === "one"
                ? (question.options[0]?.code ?? "")
                : question.kind === "many"
                  ? [question.options[0]?.code ?? ""]
                  : "JL",
          ]),
        );
        const result = buildObservation({
          id: "83f254b5-8a7b-4b71-9591-a7ff880f4ad7",
          form,
          answers,
          coordinates: [-76.485, 42.448],
          placement: { source: "hand", gpsAccuracyMetres: null },
          context,
          siteId: "sample-garden",
          observer,
          createdAt: "2026-10-25T10:00:00.000Z",
        });
        expect(result, JSON.stringify(result)).toMatchObject({
          ok: true,
          record: { observer: "JL" },
        });
        expect(carriedQuestionIds(form)).toEqual(["recorded_by"]);
        expect(form.questions.find((question) => question.id === "recorded_by")?.exportColumn).toBe(
          "recorded_by",
        );
      });
    }
  }

  it("does not treat an ID-named observer column as a second observer role", () => {
    const original = janetTestV1.questions.find((question) => question.id === "observer_initials");
    const form = parseFormDefinition({
      ...janetTestV1,
      columnNaming: "questionId",
      questions: [
        { ...original, id: "observer", exportColumn: "observer" },
        { ...original, id: "recorded_by", exportColumn: "recorded_by", role: "observer" },
      ],
    });
    expect(carriedQuestionIds(form)).toEqual(["recorded_by"]);
    const result = buildObservation({
      id: "83f254b5-8a7b-4b71-9591-a7ff880f4ad7",
      form,
      answers: { observer: "OTHER", recorded_by: "JL" },
      coordinates: [-76.485, 42.448],
      placement: { source: "hand", gpsAccuracyMetres: null },
      context,
      siteId: "sample-garden",
      observer: "AC",
      createdAt: "2026-10-25T10:00:00.000Z",
    });
    expect(result).toMatchObject({ ok: true, record: { observer: "JL" } });
  });

  it("does not carry automatic observer answers into a fresh capture", () => {
    const form = parseFormDefinition({
      ...janetTestV1,
      questions: [
        {
          ...janetTestV1.questions.find((question) => question.id === "observer_initials"),
          role: "observer",
          valueSource: "observerCode",
        },
      ],
    });
    expect(carriedQuestionIds(form)).toEqual([]);
  });

  it("rejects ambiguous observer roles", () => {
    const form = {
      ...janetTestV1,
      questions: [
        {
          ...janetTestV1.questions.find((question) => question.id === "observer_initials"),
          role: "observer",
        },
        {
          ...janetTestV1.questions.find((question) => question.id === "observer_initials"),
          id: "other",
          exportColumn: "other",
          role: "observer",
        },
      ],
    };
    expect(() => parseFormDefinition(form)).toThrow(/Only one question/);
  });

  it("still carries legacy manual observers without inferring a role from question IDs", () => {
    expect(carriedQuestionIds(janetTestV1)).toEqual(["observer_initials"]);
    const unrelated = parseFormDefinition({
      ...janetTestV1,
      questions: janetTestV1.questions.map((question) => ({
        ...question,
        exportColumn: question.id,
      })),
    });
    expect(carriedQuestionIds(unrelated)).toEqual([]);
  });
});
