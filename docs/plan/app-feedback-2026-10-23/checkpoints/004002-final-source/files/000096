import { expect, it } from "vitest";
import { parseFormDefinition } from "./definition";
import { reviewProblems } from "./engine";
import { reduceSession, startSession } from "./session";

const form = parseFormDefinition({
  version: "decimal-v2",
  title: "Number",
  summary: "Synthetic",
  source: "test",
  status: "published",
  inclusion: "test",
  questions: [
    {
      id: "amount",
      code: "amount",
      exportColumn: "amount",
      act: "Record",
      label: "Amount",
      source: "test",
      kind: "number",
      numberMode: "decimal",
    },
  ],
});
it("keeps finite decimal precision and preserves incomplete numeric input as a refused draft answer", () => {
  const decimal = reduceSession(form, startSession(), {
    kind: "write",
    question: "amount",
    value: "-123.456789",
  }).state;
  expect(decimal.answers).toEqual({ amount: -123.456789 });
  expect(reviewProblems(form, decimal.answers)).toEqual([]);
  for (const value of ["-", "Infinity", "1e999", "invalid"]) {
    const next = reduceSession(form, decimal, { kind: "write", question: "amount", value }).state;
    expect(next.answers).toEqual({ amount: value });
    expect(reviewProblems(form, next.answers)).toMatchObject([{ reason: "type" }]);
  }
});
