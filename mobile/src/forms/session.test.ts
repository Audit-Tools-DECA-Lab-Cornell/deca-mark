import { describe, expect, it } from "vitest";
import { countForm } from "./count-form.test-helper";
import { visibleQuestions } from "./engine";
import { janetTestV1 } from "./janet-test-v1.test-helper";
import { questionAt, reduceSession, startSession } from "./session";

const at = (state: Parameters<typeof questionAt>[1]) => questionAt(janetTestV1, state)?.id;

describe("Answering one question at a time", () => {
  it("stores numeric input as a number and distinguishes blank from zero", () => {
    const zero = reduceSession(countForm, startSession(), {
      kind: "write",
      question: "people",
      value: "0",
    });
    expect(zero.state.answers).toEqual({ people: 0 });
    const blank = reduceSession(countForm, zero.state, {
      kind: "write",
      question: "people",
      value: "",
    });
    expect(blank.state.answers).toEqual({});
  });
  it("moves on by itself after a single choice, but not when the choice is cleared", () => {
    // Given the first question on screen.
    const start = startSession();
    // When an option is chosen, and then the same option is tapped again.
    const chosen = reduceSession(janetTestV1, start, {
      kind: "choose",
      question: "age_range",
      option: "age_3_5",
    });
    const cleared = reduceSession(janetTestV1, chosen.state, {
      kind: "choose",
      question: "age_range",
      option: "age_3_5",
    });
    // Then only the first advances, so a correction does not skip the question.
    expect(chosen.autoAdvance).toBe(true);
    expect(chosen.state.answers).toEqual({ age_range: "age_3_5" });
    expect(cleared.autoAdvance).toBe(false);
    expect(cleared.state.answers).toEqual({});
  });

  it("waits for Continue on a multi-select or a text answer", () => {
    // Given a text question.
    const written = reduceSession(janetTestV1, startSession(), {
      kind: "write",
      question: "observer_initials",
      value: "JL",
    });
    // Then nothing advances until Continue is pressed.
    expect(written.autoAdvance).toBe(false);
    expect(written.destination).toBe("stay");
  });

  it("steps back to the previous visible question, skipping the ones that are not asked", () => {
    // Given a wildlife branch left closed, with the stack standing on the first record question.
    const answers = { wildlife_interaction: "no" };
    const visible = visibleQuestions(janetTestV1, answers).map((question) => question.id);
    const index = visible.indexOf("observer_initials");
    const state = { index, answers, notice: null };
    // When Back is pressed.
    const back = reduceSession(janetTestV1, state, { kind: "back" });
    // Then it lands on the wildlife parent, not on a hidden follow-up.
    expect(at(back.state)).toBe("wildlife_interaction");
  });

  it("opens the review sheet after the last visible question and releases the point before the first", () => {
    // Given the stack at each end.
    const last = {
      index: visibleQuestions(janetTestV1, {}).length - 1,
      answers: {},
      notice: null,
    };
    // When stepping past either end.
    const forward = reduceSession(janetTestV1, last, { kind: "next" });
    const backward = reduceSession(janetTestV1, startSession(), { kind: "back" });
    // Then the observer reaches review, or returns to the map with the point cleared.
    expect(forward.destination).toBe("review");
    expect(backward.destination).toBe("map");
  });

  it("reports how many answers a parent change dropped", () => {
    // Given an answered wildlife branch.
    const opened = reduceSession(janetTestV1, startSession(), {
      kind: "choose",
      question: "wildlife_interaction",
      option: "yes",
    });
    const described = reduceSession(janetTestV1, opened.state, {
      kind: "write",
      question: "wildlife_description",
      value: "A heron on the bank",
    });
    // When the parent is changed to No.
    const closed = reduceSession(janetTestV1, described.state, {
      kind: "choose",
      question: "wildlife_interaction",
      option: "no",
    });
    // Then the observer is told what went and why, rather than losing it silently.
    expect(closed.state.notice?.count).toBe(1);
    expect(closed.state.notice?.questions).toEqual(["Describe the wildlife interaction"]);
    expect(closed.state.answers).toEqual({ wildlife_interaction: "no" });
  });

  it("keeps the cursor inside the stack when a change shortens it", () => {
    // Given the stack standing on the last wildlife follow-up.
    const opened = reduceSession(janetTestV1, startSession(), {
      kind: "choose",
      question: "wildlife_interaction",
      option: "yes",
    });
    const visible = visibleQuestions(janetTestV1, opened.state.answers).map((q) => q.id);
    const state = {
      index: visible.length - 1,
      answers: opened.state.answers,
      notice: null,
    };
    // When the branch closes and three questions disappear.
    const closed = reduceSession(janetTestV1, state, {
      kind: "choose",
      question: "wildlife_interaction",
      option: "no",
    });
    // Then a real question is still on screen.
    expect(at(closed.state)).toBeDefined();
  });

  it("clamps a jump from the review sheet to a question that is actually asked", () => {
    // Given a jump past the end of the stack.
    const jumped = reduceSession(janetTestV1, startSession(), { kind: "jump", index: 99 });
    // Then it lands on the last visible question rather than nowhere.
    expect(at(jumped.state)).toBe("play_event_summary");
  });
});
