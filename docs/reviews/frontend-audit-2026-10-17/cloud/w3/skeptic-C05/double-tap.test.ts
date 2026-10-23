// Skeptic C05 reproduction at 0279fd3: real QuestionStep + real reduceSession + real janet-test-v1,
// driven by a copy of CollectScreen.dispatchStep (CollectScreen.tsx:205-218, AUTO_ADVANCE_MS 160).
// Geometry is NOT simulated: the "second tap" on the next question presses the tile a finger at the
// same spot would most plausibly hit. What this test establishes is only the React-level claim:
// after the advance, the next question's tiles are mounted, enabled and handled immediately.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";



vi.mock("react-native", async () => (await import("/home/user/deca-mark/mobile/src/ui/native.fixture")).reactNative);
vi.mock("react-native-reanimated", async () => (await import("/home/user/deca-mark/mobile/src/ui/native.fixture")).reanimated);
vi.mock("expo-sqlite/kv-store", async () => (await import("/home/user/deca-mark/mobile/src/ui/native.fixture")).kvStore);
vi.mock("expo-haptics", async () => (await import("/home/user/deca-mark/mobile/src/ui/native.fixture")).haptics);
vi.mock("/home/user/deca-mark/mobile/src/ui/Icon", async () => (await import("/home/user/deca-mark/mobile/src/ui/native.fixture")).icon);
vi.mock("/home/user/deca-mark/mobile/src/ui/fonts", async () => (await import("/home/user/deca-mark/mobile/src/ui/native.fixture")).fonts);
vi.mock("react-native-svg", async () => (await import("/home/user/deca-mark/mobile/src/ui/native.fixture")).svg);
vi.mock("react-native-safe-area-context", async () => (await import("/home/user/deca-mark/mobile/src/ui/native.fixture")).safeArea);
vi.mock("expo-status-bar", async () => (await import("/home/user/deca-mark/mobile/src/ui/native.fixture")).statusBar);
vi.mock("expo-router", async () => (await import("/home/user/deca-mark/mobile/src/ui/native.fixture")).router);

import { createElement, useRef, useState } from "react";
import { act } from "react-test-renderer";
import { QuestionStep } from "/home/user/deca-mark/mobile/src/features/collect/QuestionStep";
import { visibleQuestions } from "/home/user/deca-mark/mobile/src/forms/engine";
import { janetTestV1 as form } from "/home/user/deca-mark/mobile/src/forms/fixtures/janet-test-v1";
import {
  reduceSession,
  type SessionAction,
  type SessionState,
  startSession,
} from "/home/user/deca-mark/mobile/src/forms/session";
import { isDisabled, render } from "/home/user/deca-mark/mobile/src/ui/screen.fixture";

const AUTO_ADVANCE_MS = 160; // CollectScreen.tsx:42
let latest: SessionState = startSession();

function Harness() {
  const [state, setState] = useState<SessionState>(startSession());
  const stateRef = useRef(state);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest = state;
  const dispatch = (action: SessionAction) => {
    // observation-actions.ts:128-146 — reduce from stateRef, apply.
    const step = reduceSession(form, stateRef.current, action);
    stateRef.current = step.state;
    setState(step.state);
    return step;
  };
  const cancelAdvance = () => {
    if (advance.current) clearTimeout(advance.current);
    advance.current = null;
  };
  // Verbatim shape of CollectScreen.dispatchStep (review/map destinations reduced to no-ops).
  function dispatchStep(action: SessionAction) {
    const result = dispatch(action);
    cancelAdvance();
    if (result.autoAdvance)
      advance.current = setTimeout(() => {
        advance.current = null;
        dispatch({ kind: "next" });
      }, AUTO_ADVANCE_MS);
  }
  const visible = visibleQuestions(form, state.answers);
  const index = Math.min(state.index, Math.max(visible.length - 1, 0));
  const question = visible[index];
  if (!question) return null;
  return createElement(QuestionStep, {
    form,
    state,
    question,
    position: index + 1,
    total: visible.length,
    columns: 2, // phone portrait: layout.columns(3) => 2
    onChoose: (option: string) => dispatchStep({ kind: "choose", question: question.id, option }),
    onToggle: (option: string) => dispatchStep({ kind: "toggle", question: question.id, option }),
    onWrite: (value: string) => dispatchStep({ kind: "write", question: question.id, value }),
    onBack: () => dispatchStep({ kind: "back" }),
    onAdvance: () => dispatchStep({ kind: "next" }),
    onReview: () => {},
  });
}

function Guarded() {
  const [state, setState] = useState<SessionState>(startSession());
  const stateRef = useRef(state);
  const advance = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancedAt = useRef(Number.NEGATIVE_INFINITY);
  latest = state;
  const dispatch = (action: SessionAction) => {
    // observation-actions.ts:128-146 — reduce from stateRef, apply.
    const step = reduceSession(form, stateRef.current, action);
    stateRef.current = step.state;
    setState(step.state);
    return step;
  };
  const cancelAdvance = () => {
    if (advance.current) clearTimeout(advance.current);
    advance.current = null;
  };
  // Verbatim shape of CollectScreen.dispatchStep (review/map destinations reduced to no-ops).
  function dispatchStep(action: SessionAction) {
    // Alternative fix: (a) a re-tap of the option whose advance is pending is a no-op;
    // (b) choice taps within 350 ms of an auto-advance are ignored. Neither cancels the advance.
    if (action.kind === "choose" || action.kind === "toggle") {
      const pendingSame =
        advance.current !== null && stateRef.current.answers[action.question] === (action as { option: string }).option;
      if (pendingSame || Date.now() - advancedAt.current < 350) return;
    }
    const result = dispatch(action);
    cancelAdvance();
    if (result.autoAdvance)
      advance.current = setTimeout(() => {
        advance.current = null;
        advancedAt.current = Date.now();
        dispatch({ kind: "next" });
      }, AUTO_ADVANCE_MS);
  }
  const visible = visibleQuestions(form, state.answers);
  const index = Math.min(state.index, Math.max(visible.length - 1, 0));
  const question = visible[index];
  if (!question) return null;
  return createElement(QuestionStep, {
    form,
    state,
    question,
    position: index + 1,
    total: visible.length,
    columns: 2, // phone portrait: layout.columns(3) => 2
    onChoose: (option: string) => dispatchStep({ kind: "choose", question: question.id, option }),
    onToggle: (option: string) => dispatchStep({ kind: "toggle", question: question.id, option }),
    onWrite: (value: string) => dispatchStep({ kind: "write", question: question.id, value }),
    onBack: () => dispatchStep({ kind: "back" }),
    onAdvance: () => dispatchStep({ kind: "next" }),
    onReview: () => {},
  });
}

const onScreen = () => {
  const visible = visibleQuestions(form, latest.answers);
  return visible[Math.min(latest.index, visible.length - 1)];
};
const wait = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("C05 double tap at 0279fd3", () => {
  it("single tap: answers Q1 and advances to Q2 after 160 ms", async () => {
    const screen = render(createElement(Harness));
    await screen.press("3–5 yrs");
    await wait(1000);
    console.log("single", JSON.stringify(latest.answers), "->", onScreen()?.label);
    expect(latest.answers).toEqual({ age_range: "age_3_5" });
    expect(onScreen()?.id).toBe("play_type_1");
  });

  it("second tap 120 ms later on the same tile clears Q1 and stays", async () => {
    const screen = render(createElement(Harness));
    await screen.press("3–5 yrs");
    await wait(120);
    await screen.press("3–5 yrs");
    await wait(1000);
    console.log("120ms", JSON.stringify(latest.answers), "->", onScreen()?.label);
    expect(latest.answers).toEqual({});
    expect(onScreen()?.id).toBe("age_range");
  });

  it("second tap 250 ms later lands on a live Q2 tile and answers it", async () => {
    const screen = render(createElement(Harness));
    await screen.press("3–5 yrs");
    await wait(250);
    // Q2 is on screen; its tiles are present and not disabled.
    console.log("after 250ms controls:", screen.controls().join(" | "));
    expect(isDisabled(screen.control("Exploratory"))).toBe(false);
    expect(isDisabled(screen.control("Play with Rules"))).toBe(false);
    await screen.press("Exploratory");
    await wait(1000);
    console.log("250ms", JSON.stringify(latest.answers), "->", onScreen()?.label);
    expect(latest.answers).toEqual({ age_range: "age_3_5", play_type_1: "exploratory" });
    expect(onScreen()?.id).toBe("play_subtype_1");
  });

  it("Q2 -> Q3 variant: a double tap on the play type silently answers the optional subtype", async () => {
    const screen = render(createElement(Harness));
    await screen.press("3–5 yrs");
    await wait(1000);
    await screen.press("Physical");
    await wait(250);
    console.log("Q3 controls:", screen.controls().join(" | "), "| label:", onScreen()?.label);
    await screen.press("Vestibular"); // row 1 of the subtype grid
    await wait(1000);
    const q = onScreen();
    console.log("Q2->Q3", JSON.stringify(latest.answers), "->", q?.label, "required:", q?.required);
    expect(latest.answers).toEqual({
      age_range: "age_3_5",
      play_type_1: "physical",
      play_subtype_1: "vestibular",
    });
    expect(q?.id).toBe("play_type_2");
  });
});

describe("C05 alternative fix in dispatchStep (scratch only)", () => {
  it("120 ms re-tap keeps Q1 and still advances", async () => {
    const screen = render(createElement(Guarded));
    await screen.press("3–5 yrs");
    await wait(120);
    await screen.press("3–5 yrs");
    await wait(1000);
    console.log("guarded 120ms", JSON.stringify(latest.answers), "->", onScreen()?.label);
    expect(latest.answers).toEqual({ age_range: "age_3_5" });
    expect(onScreen()?.id).toBe("play_type_1");
  });
  it("250 ms second tap on Q2 is ignored", async () => {
    const screen = render(createElement(Guarded));
    await screen.press("3–5 yrs");
    await wait(250);
    await screen.press("Exploratory");
    await wait(1000);
    console.log("guarded 250ms", JSON.stringify(latest.answers), "->", onScreen()?.label);
    expect(latest.answers).toEqual({ age_range: "age_3_5" });
    expect(onScreen()?.id).toBe("play_type_1");
  });
  it("a quick correction to a different option within 160 ms still wins", async () => {
    const screen = render(createElement(Guarded));
    await screen.press("0–2 yrs");
    await wait(100);
    await screen.press("3–5 yrs");
    await wait(1000);
    expect(latest.answers).toEqual({ age_range: "age_3_5" });
    expect(onScreen()?.id).toBe("play_type_1");
  });
  it("deliberate un-choose after Back still clears", async () => {
    const screen = render(createElement(Guarded));
    await screen.press("3–5 yrs");
    await wait(1000);
    await screen.press("Back");
    await wait(1000);
    await screen.press("3–5 yrs");
    await wait(1000);
    expect(latest.answers).toEqual({});
    expect(onScreen()?.id).toBe("age_range");
  });
  it("a tap 400 ms after the advance is accepted", async () => {
    const screen = render(createElement(Guarded));
    await screen.press("3–5 yrs");
    await wait(160 + 400);
    await screen.press("Exploratory");
    await wait(1000);
    expect(latest.answers).toEqual({ age_range: "age_3_5", play_type_1: "exploratory" });
  });
});
