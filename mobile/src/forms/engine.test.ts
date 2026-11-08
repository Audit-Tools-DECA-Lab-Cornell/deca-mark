import { describe, expect, it } from "vitest";
import { countForm } from "./count-form.test-helper";
import {
  answerSummary,
  exportAnswers,
  pruneAnswers,
  reviewProblems,
  visibleQuestions,
} from "./engine";
import { janetTestV1 } from "./janet-test-v1.test-helper";

const ids = (answers: Record<string, string | string[]>) =>
  visibleQuestions(janetTestV1, answers).map((question) => question.id);

describe("Conditional visibility", () => {
  it("inserts a revealed question at its authored position, not at the end", () => {
    // Given the wildlife branch answered Yes.
    const answers = { wildlife_interaction: "yes" };
    // When the visible stack is computed.
    const visible = ids(answers);
    // Then the follow-ups sit where their author put them, before the record questions.
    expect(visible.indexOf("wildlife_type")).toBe(visible.indexOf("wildlife_interaction") + 1);
    expect(visible.indexOf("wildlife_description")).toBeLessThan(
      visible.indexOf("observer_initials"),
    );
  });

  it("hides the whole branch while the parent is unanswered or No", () => {
    // Given no wildlife answer, and then an explicit No.
    // When the stack is computed for each.
    // Then none of the three follow-ups are asked.
    for (const answers of [{}, { wildlife_interaction: "no" }]) {
      const visible = ids(answers);
      expect(visible).not.toContain("wildlife_type");
      expect(visible).not.toContain("wildlife_other");
      expect(visible).not.toContain("wildlife_description");
    }
  });

  it("follows the play type with its own subtype set, and keeps the two slots apart", () => {
    // Given different primary and secondary play types.
    const answers = { play_type_1: "physical", play_type_2: "bio" };
    // When each subtype question is resolved.
    const visible = visibleQuestions(janetTestV1, answers);
    const first = visible.find((question) => question.id === "play_subtype_1");
    const second = visible.find((question) => question.id === "play_subtype_2");
    // Then slot one offers physical subtypes and slot two offers bio subtypes.
    expect(first?.options.map((option) => option.code)).toContain("gross_motor");
    expect(second?.options.map((option) => option.code)).toContain("plants");
    expect(first?.exportColumn).toBe("Phys_Subtype");
    // Slot two's export column is an open protocol decision, so it is left empty.
    expect(second?.exportColumn).toBe("");
  });
});

describe("Dropping answers that are no longer asked", () => {
  it("drops the wildlife follow-ups when the parent changes from Yes to No, and reports them", () => {
    // Given an answered wildlife branch.
    const answered = {
      wildlife_interaction: "yes",
      wildlife_other: "Feeding ducks",
      wildlife_description: "Two children at the pond edge",
      age_range: "age_6_8",
    };
    // When the parent answer becomes No.
    const pruned = pruneAnswers(janetTestV1, { ...answered, wildlife_interaction: "no" });
    // Then both follow-ups are removed and named, and unrelated answers survive.
    expect(pruned.dropped.map((question) => question.id).sort()).toEqual([
      "wildlife_description",
      "wildlife_other",
    ]);
    expect(pruned.answers).toEqual({ wildlife_interaction: "no", age_range: "age_6_8" });
  });

  it("drops a subtype whose option no longer exists after its play type changed", () => {
    // Given a physical play event with a physical subtype.
    const answers = { play_type_1: "physical", play_subtype_1: "gross_motor" };
    // When the play type becomes imaginative.
    const pruned = pruneAnswers(janetTestV1, { ...answers, play_type_1: "imaginative" });
    // Then the stale subtype is dropped instead of being saved under the wrong set.
    expect(pruned.dropped.map((question) => question.id)).toEqual(["play_subtype_1"]);
    expect(pruned.answers).toEqual({ play_type_1: "imaginative" });
  });

  it("keeps pruning until it settles, so a chain of reveals cannot leave an orphan", () => {
    // Given a full branch and a change that closes it in one step.
    const pruned = pruneAnswers(janetTestV1, {
      wildlife_interaction: "no",
      wildlife_other: "orphan",
      wildlife_description: "orphan",
      play_subtype_1: "gross_motor",
    });
    // Then every unreachable answer is gone in a single call.
    expect(pruned.answers).toEqual({ wildlife_interaction: "no" });
    expect(pruned.dropped).toHaveLength(3);
  });
});

describe("Validation at review", () => {
  it("names every empty required answer and nothing else", () => {
    // Given an observation with no answers.
    const problems = reviewProblems(janetTestV1, {});
    // Then only the required questions block the save.
    expect(problems.map((problem) => problem.question.id).sort()).toEqual([
      "age_range",
      "observer_initials",
      "play_event_summary",
      "play_type_1",
    ]);
    expect(problems.every((problem) => problem.reason === "required")).toBe(true);
  });

  it("does not block a save on an optional question that was skipped", () => {
    // Given every required answer filled in.
    const problems = reviewProblems(janetTestV1, {
      age_range: "age_3_5",
      play_type_1: "physical",
      observer_initials: "JL",
      play_event_summary: "Running the length of the path, twice.",
    });
    // Then nothing is outstanding, even though the second play type is empty.
    expect(problems).toEqual([]);
  });

  it("reports a number outside its supplied bounds", () => {
    // Given a record with an impossible count.
    const problems = reviewProblems(countForm, { people: 1000 });
    // Then the range is reported rather than stored.
    expect(problems.map((problem) => [problem.question.id, problem.reason])).toEqual([
      ["people", "range"],
    ]);
  });
});

describe("Export mapping", () => {
  it("maps answers onto the supplied columns and names the ones that have none", () => {
    // Given answers across fields with and without an approved export column.
    const exported = exportAnswers(janetTestV1, {
      age_range: "age_9_12",
      wildlife_interaction: "yes",
      wildlife_description: "Watching a heron from the bank",
    });
    // Then supplied columns carry stable codes, and the gaps are reported, never invented.
    expect(exported.columns).toEqual({ Child_AgeRange: "age_9_12" });
    expect(exported.withoutColumn.map((question) => question.id)).toEqual([
      "wildlife_interaction",
      "wildlife_description",
    ]);
  });

  it("reads an answer back as its label for the review sheet", () => {
    // Given a chosen CARS band.
    const question = visibleQuestions(janetTestV1, {}).find(
      (candidate) => candidate.id === "cars_intensity",
    );
    // When the review row renders it.
    // Then the observer reads the band, while storage keeps the code.
    expect(question && answerSummary(question, "cars_4_5")).toBe("4–5 · moderate to vigorous");
    expect(question && answerSummary(question, undefined)).toBe("Not answered");
  });
});
