import { act, create } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ResolvedQuestion, visibleQuestions } from "../../forms/engine";
import { janetTestV1 as form } from "../../forms/fixtures/janet-test-v1";
import {
  reduceSession,
  type SessionAction,
  type SessionDestination,
  type SessionState,
  type SessionStep,
  startSession,
} from "../../forms/session";
import { useAutoAdvance } from "./use-auto-advance";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * MOB-36 (audit C05): a single choice moves on after a beat, and a second tap must never answer a
 * question the observer has not seen. The real reducer and the real janet-test-v1 drive the hook;
 * nothing here needs MapLibre or the native fixture.
 */

type Rig = {
  readonly state: () => SessionState;
  readonly question: () => ResolvedQuestion | undefined;
  readonly destinations: SessionDestination[];
  readonly dispatches: SessionAction[];
  tap(option: string): void;
  toggle(option: string): void;
  back(): void;
  cancel(): void;
  wait(ms: number): void;
  unmount(): void;
};

function mount(): Rig {
  let state = startSession();
  const destinations: SessionDestination[] = [];
  const dispatches: SessionAction[] = [];
  const dispatch = (action: SessionAction): SessionStep => {
    dispatches.push(action);
    const step = reduceSession(form, state, action);
    state = step.state;
    return step;
  };
  let api: ReturnType<typeof useAutoAdvance> | undefined;
  function Probe() {
    api = useAutoAdvance(dispatch, (destination) => destinations.push(destination));
    return null;
  }
  let renderer: ReturnType<typeof create> | undefined;
  act(() => {
    renderer = create(<Probe />);
  });
  const question = () => {
    const visible = visibleQuestions(form, state.answers);
    return visible[Math.min(state.index, Math.max(visible.length - 1, 0))];
  };
  const run = (fn: () => void) => {
    act(() => {
      fn();
    });
  };
  const need = () => {
    if (!api) throw new Error("The hook did not render.");
    return api;
  };
  const wait = (ms: number) => run(() => vi.advanceTimersByTime(ms));
  return {
    state: () => state,
    question,
    destinations,
    dispatches,
    tap: (option) =>
      run(() => {
        const current = question();
        if (!current) throw new Error("No question is on screen.");
        need().dispatchStep({ kind: "choose", question: current.id, option });
      }),
    toggle: (option) =>
      run(() => {
        const current = question();
        if (!current) throw new Error("No question is on screen.");
        need().dispatchStep({ kind: "toggle", question: current.id, option });
      }),
    back: () => run(() => need().dispatchStep({ kind: "back" })),
    cancel: () => run(() => need().cancelAdvance()),
    wait,
    unmount: () => run(() => renderer?.unmount()),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useAutoAdvance", () => {
  it("a single tap answers Q1 and moves to Q2 after the beat", () => {
    const rig = mount();
    rig.tap("age_3_5");
    expect(rig.question()?.id).toBe("age_range");
    rig.wait(159);
    expect(rig.question()?.id).toBe("age_range");
    rig.wait(1);
    expect(rig.state().answers).toEqual({ age_range: "age_3_5" });
    expect(rig.question()?.id).toBe("play_type_1");
  });

  it("a re-tap at 120 ms keeps Q1's answer and the pending move still happens", () => {
    const rig = mount();
    rig.tap("age_3_5");
    rig.wait(120);
    rig.tap("age_3_5");
    // The re-tap did not reach the reducer, so it did not un-choose, and it did not restart the beat.
    expect(rig.state().answers).toEqual({ age_range: "age_3_5" });
    rig.wait(40);
    expect(rig.question()?.id).toBe("play_type_1");
    rig.wait(1000);
    expect(rig.state().answers).toEqual({ age_range: "age_3_5" });
    expect(rig.question()?.id).toBe("play_type_1");
  });

  it("a tap 250 ms after the first leaves Q2 unanswered", () => {
    const rig = mount();
    rig.tap("age_3_5");
    rig.wait(250);
    expect(rig.question()?.id).toBe("play_type_1");
    rig.tap("exploratory");
    rig.wait(1000);
    expect(rig.state().answers).toEqual({ age_range: "age_3_5" });
    expect(rig.question()?.id).toBe("play_type_1");
  });

  it("on Q2 a late second tap does not answer the optional subtype", () => {
    const rig = mount();
    rig.tap("age_3_5");
    rig.wait(1000);
    rig.tap("physical");
    rig.wait(250);
    expect(rig.question()?.id).toBe("play_subtype_1");
    rig.tap("vestibular");
    rig.wait(1000);
    expect(rig.state().answers).toEqual({ age_range: "age_3_5", play_type_1: "physical" });
    expect(rig.question()?.id).toBe("play_subtype_1");
  });

  it("a different option within the beat replaces the first and moves on once", () => {
    const rig = mount();
    rig.tap("age_0_2");
    rig.wait(100);
    rig.tap("age_3_5");
    rig.wait(1000);
    expect(rig.state().answers).toEqual({ age_range: "age_3_5" });
    expect(rig.question()?.id).toBe("play_type_1");
    expect(rig.dispatches.filter((action) => action.kind === "next")).toHaveLength(1);
  });

  it("a tap after the guard window is accepted", () => {
    const rig = mount();
    rig.tap("age_3_5");
    rig.wait(160 + 349);
    rig.tap("exploratory");
    expect(rig.state().answers).toEqual({ age_range: "age_3_5" });
    rig.wait(1);
    rig.tap("exploratory");
    expect(rig.state().answers).toEqual({ age_range: "age_3_5", play_type_1: "exploratory" });
    rig.wait(1000);
    expect(rig.question()?.id).toBe("play_subtype_1");
  });

  it("the guard also ignores a toggle just after the move", () => {
    const rig = mount();
    rig.tap("age_3_5");
    rig.wait(1000);
    rig.tap("physical");
    rig.wait(1000);
    // Q3 asks the subtype; Q4 and later ask other things. Move to a multi-select question by jumping.
    const toggles = rig.dispatches.filter((action) => action.kind === "toggle");
    expect(toggles).toHaveLength(0);
    rig.tap("vestibular");
    rig.wait(160 + 100);
    const before = rig.dispatches.length;
    rig.toggle("anything");
    expect(rig.dispatches).toHaveLength(before);
  });

  it("un-choosing after Back still clears the answer", () => {
    const rig = mount();
    rig.tap("age_3_5");
    rig.wait(1000);
    rig.back();
    expect(rig.question()?.id).toBe("age_range");
    rig.wait(1000);
    rig.tap("age_3_5");
    expect(rig.state().answers).toEqual({});
    rig.wait(1000);
    expect(rig.question()?.id).toBe("age_range");
  });

  it("cancelling the move leaves the question where it is, and the next tap counts", () => {
    const rig = mount();
    rig.tap("age_3_5");
    rig.cancel();
    rig.wait(1000);
    expect(rig.question()?.id).toBe("age_range");
    rig.tap("age_3_5");
    expect(rig.state().answers).toEqual({});
  });

  it("leaving the screen drops the pending move", () => {
    const rig = mount();
    rig.tap("age_3_5");
    rig.unmount();
    rig.wait(1000);
    expect(rig.question()?.id).toBe("age_range");
    expect(rig.dispatches.filter((action) => action.kind === "next")).toHaveLength(0);
  });

  it("reports the destination of an action that does not advance by itself", () => {
    const rig = mount();
    rig.back();
    expect(rig.destinations).toEqual(["map"]);
  });
});
