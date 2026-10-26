import { describe, expect, it } from "vitest";
import { type Answers, parseFormDefinition } from "./definition";
import { pruneDraftAnswers } from "./draft-answers";
import { pruneAnswers, reviewProblems, visibleQuestions } from "./engine";
import { reduceSession, startSession } from "./session";

const form = parseFormDefinition({
  version: "draft-dependencies-v2",
  title: "Draft dependencies",
  summary: "Synthetic",
  source: "test",
  status: "published",
  inclusion: "test",
  questions: [
    {
      id: "a",
      code: "a",
      exportColumn: "a",
      act: "Record",
      label: "First amount",
      source: "test",
      kind: "number",
      numberMode: "decimal",
      required: true,
    },
    {
      id: "b",
      code: "b",
      exportColumn: "b",
      act: "Record",
      label: "Second amount",
      source: "test",
      kind: "number",
      dependsOn: { kind: "answered", question: "a" },
    },
    {
      id: "c",
      code: "c",
      exportColumn: "c",
      act: "Record",
      label: "Notes",
      source: "test",
      kind: "text",
      dependsOn: { kind: "answered", question: "b" },
    },
    {
      id: "gate",
      code: "gate",
      exportColumn: "gate",
      act: "Record",
      label: "Show extra amount",
      source: "test",
      kind: "one",
      options: [
        { code: "open", label: "Yes" },
        { code: "closed", label: "No" },
      ],
    },
    {
      id: "hidden",
      code: "hidden",
      exportColumn: "hidden",
      act: "Record",
      label: "Extra amount",
      source: "test",
      kind: "number",
      dependsOn: { kind: "equals", question: "gate", option: "open" },
    },
  ],
});

const completed: Answers = { a: 1, b: 2, c: "Keep these notes" };

describe("Numeric draft dependency pruning", () => {
  it.each([
    "-",
    ".",
    "1e",
    "Infinity",
    "1e999",
    "invalid",
  ])("retains a three-question chain when its first number is draft text %j", (a) => {
    // Given a complete dependency chain with a number being edited.
    const input = { ...completed, a };
    // When draft answers are pruned.
    const pruned = pruneDraftAnswers(form, input);
    // Then the draft and every still-visible dependent answer survive.
    expect(pruned).toEqual({ answers: input, dropped: [] });
    expect(visibleQuestions(form, pruned.answers).map((question) => question.id)).toContain("c");
  });

  it("retains chained numeric drafts before evaluating their dependents", () => {
    // Given both number inputs are incomplete in a three-question chain.
    const input = { a: "-", b: "-", c: "Keep these notes" };
    // When draft answers are pruned.
    const pruned = pruneDraftAnswers(form, input);
    // Then neither numeric draft nor its dependent is removed.
    expect(pruned).toEqual({ answers: input, dropped: [] });
  });

  it.each(["", " ", "\t"])("cascades removal when a numeric parent is blank %j", (a) => {
    // Given a cleared numeric parent with stale dependent answers.
    const input = { ...completed, a };
    // When the draft is pruned.
    const pruned = pruneDraftAnswers(form, input);
    // Then the empty parent and its entire dependency chain are dropped.
    expect(pruned.answers).toEqual({});
    expect(pruned.dropped.map((question) => question.id).sort()).toEqual(["a", "b", "c"]);
  });

  it.each([
    "closed",
    "invalid",
  ])("removes hidden numeric text and invalid answers when the gate is %j", (gate) => {
    // Given a hidden numeric draft, an invalid option and an unknown answer.
    const input = { ...completed, gate, hidden: "-", unknown: "discard" };
    // When draft answers are pruned.
    const pruned = pruneDraftAnswers(form, input);
    // Then only visible, supported answers remain.
    expect(pruned.answers).toEqual(
      gate === "closed" ? { ...completed, gate: "closed" } : completed,
    );
    expect(pruned.dropped.map((question) => question.id).sort()).toEqual(
      gate === "closed" ? ["hidden"] : ["gate", "hidden"],
    );
  });

  it.each([
    "a",
    "b",
  ])("preserves dependents when a session edits %s to a minus sign", (question) => {
    // Given an answered three-question session.
    const state = startSession(completed);
    // When an existing numeric answer becomes incomplete during editing.
    const next = reduceSession(form, state, { kind: "write", question, value: "-" }).state;
    // Then the edited input and dependent answers remain without a drop notice.
    expect(next.answers).toEqual({ ...completed, [question]: "-" });
    expect(next.notice).toBeNull();
  });

  it("keeps the numeric draft chain when another session answer changes", () => {
    // Given a restored session with incomplete numeric input.
    const answers = { ...completed, a: "-" };
    // When an unrelated choice is made.
    const next = reduceSession(form, startSession(answers), {
      kind: "choose",
      question: "gate",
      option: "closed",
    }).state;
    // Then pruning keeps all draft-dependent answers.
    expect(next.answers).toEqual({ ...answers, gate: "closed" });
    expect(next.notice).toBeNull();
  });

  it("converts a completed session number without discarding its dependents", () => {
    // Given an incomplete numeric input with dependent answers.
    const state = startSession({ ...completed, a: "-" });
    // When the observer completes a finite decimal.
    const next = reduceSession(form, state, { kind: "write", question: "a", value: "-1.25" }).state;
    // Then session state holds a number and retains the dependency chain.
    expect(next.answers).toEqual({ ...completed, a: -1.25 });
    expect(reviewProblems(form, next.answers)).toEqual([]);
  });

  it("drops and reports dependent session answers when the numeric parent is cleared", () => {
    // Given an incomplete numeric input with dependent answers.
    const state = startSession({ ...completed, a: "-" });
    // When its text is cleared.
    const next = reduceSession(form, state, { kind: "write", question: "a", value: "" }).state;
    // Then only the dependent removals are announced; clearing the parent is explicit.
    expect(next.answers).toEqual({});
    expect(next.notice).toEqual({ count: 2, questions: ["Second amount", "Notes"], token: 1 });
  });

  it("refuses draft numeric text at review while default pruning remains strict", () => {
    // Given draft numeric text with its visible dependent answers.
    const answers = { ...completed, a: "-" };
    // When strict review and upload pruning inspect it.
    const problems = reviewProblems(form, answers);
    const strict = pruneAnswers(form, answers);
    // Then review blocks the numeric type and strict pruning removes the whole chain.
    expect(problems.map(({ question, reason }) => [question.id, reason])).toEqual([["a", "type"]]);
    expect(strict.answers).toEqual({});
    expect(strict.dropped.map((question) => question.id).sort()).toEqual(["a", "b", "c"]);
  });
});
