import { describe, expect, it } from "vitest";
import { parseFormDefinition, parseServedDefinition } from "./definition";
import { pruneAnswers, reviewProblems } from "./engine";

const question = {
  id: "value",
  code: "value",
  exportColumn: "value",
  act: "Record",
  label: "Value",
  kind: "number",
  source: "test",
};
const input = (patch: Record<string, unknown> = {}) => ({
  version: "test",
  title: "Test",
  summary: "Test",
  source: "test",
  status: "draft",
  inclusion: "test",
  questions: [{ ...question, ...patch }],
});

describe("schema2 form contract", () => {
  it("reads current served definitions and rejects prior served versions", () => {
    // Given a canonical definition; when served; then only schema2 is read.
    expect(parseServedDefinition(2, input()).questions).toHaveLength(1);
    expect(() => parseServedDefinition(1, input())).toThrow();
    expect(parseFormDefinition(input()).questions).toHaveLength(1);
  });
  it("requires ordinary columns to match explicit ID naming without reinterpreting historical mappings", () => {
    const historical = input({ exportColumn: "Original" });
    expect(parseFormDefinition(historical).questions[0]?.exportColumn).toBe("Original");
    expect(() => parseFormDefinition({ ...historical, columnNaming: "questionId" })).toThrow(
      /question-ID export/,
    );
    expect(parseFormDefinition({ ...input(), columnNaming: "questionId" }).columnNaming).toBe(
      "questionId",
    );
  });
  it("requires every dependent option set to use its question ID under ID naming", () => {
    const child = {
      ...question,
      kind: "one",
      options: [],
      dynamicFrom: {
        question: "gate",
        sets: {
          yes: {
            code: "detail_yes",
            label: "Detail",
            exportColumn: "Original",
            options: [{ code: "detail", label: "Detail" }],
          },
        },
      },
    };
    const gate = {
      ...question,
      id: "gate",
      code: "gate",
      exportColumn: "gate",
      kind: "one",
      options: [{ code: "yes", label: "Yes" }],
    };
    const raw = { ...input(), columnNaming: "questionId", questions: [gate, child] };
    expect(() => parseFormDefinition(raw)).toThrow(/question-ID export/);
    expect(
      parseFormDefinition({
        ...raw,
        questions: [
          gate,
          {
            ...child,
            dynamicFrom: {
              ...child.dynamicFrom,
              sets: { yes: { ...child.dynamicFrom.sets.yes, exportColumn: child.id } },
            },
          },
        ],
      }).questions,
    ).toHaveLength(2);
  });
  it("accepts finite decimal bounds and answers without rounding", () => {
    // Given an explicitly decimal number; when reviewed; then fractions survive unchanged.
    const form = parseFormDefinition(input({ numberMode: "decimal", min: -0.25, max: 2.75 }));
    expect(reviewProblems(form, { value: 1.125 })).toEqual([]);
    expect(pruneAnswers(form, { value: 1.125 }).answers).toEqual({ value: 1.125 });
    expect(reviewProblems(form, { value: Infinity })[0]?.reason).toBe("range");
  });
  it.each([1.1, Number.MAX_SAFE_INTEGER + 1])("rejects unsafe integer bound %s", (min) => {
    // Given integer default; when parsed; then unsafe or fractional bounds fail.
    expect(() => parseFormDefinition(input({ min }))).toThrow();
  });
  it("rejects unsafe integer answers", () => {
    // Given integer default; when reviewed; then safe-integer limits apply.
    expect(
      reviewProblems(parseFormDefinition(input()), { value: Number.MAX_SAFE_INTEGER + 1 })[0]
        ?.reason,
    ).toBe("range");
  });
  it.each([
    { valueSource: "accountId" },
    { kind: "text", valueSource: "captureTime" },
    { kind: "text", numberMode: "decimal" },
    { dateTime: { mode: "date", timeZone: "UTC" } },
    { kind: "dateTime" },
    { kind: "dateTime", dateTime: { mode: "date", timeZone: "Invalid/Zone" } },
  ])("refuses incompatible field configuration %j", (patch) => {
    // Given incompatible schema2 properties; when parsed; then they cannot acquire silent meaning.
    expect(() => parseFormDefinition(input(patch))).toThrow();
  });
  it("requires visible automatic values while preserving optional manual questions", () => {
    // Given optional automatic text; when capture context is absent; then review blocks saving.
    const automatic = parseFormDefinition(input({ kind: "text", valueSource: "accountId" }));
    expect(reviewProblems(automatic, {})[0]?.reason).toBe("required");
    expect(reviewProblems(automatic, { value: " " })[0]?.reason).toBe("required");
    expect(reviewProblems(parseFormDefinition(input({ kind: "text" })), {})).toEqual([]);
  });
  it("validates canonical calendar strings and retains them through pruning", () => {
    // Given a date question; when reviewed; then calendar correctness and exact spelling apply.
    const form = parseFormDefinition(
      input({ kind: "dateTime", dateTime: { mode: "date", timeZone: "UTC" } }),
    );
    expect(reviewProblems(form, { value: "2024-02-29" })).toEqual([]);
    expect(pruneAnswers(form, { value: "2024-02-29" }).answers).toEqual({ value: "2024-02-29" });
    expect(reviewProblems(form, { value: "2023-02-29" })[0]?.reason).toBe("range");
  });
});
