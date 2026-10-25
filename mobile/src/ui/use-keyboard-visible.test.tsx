import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { keyboardLift, useKeyboardHeight, useKeyboardVisible } from "./use-keyboard-visible";

const env = vi.hoisted(() => ({
  os: "ios" as "ios" | "android",
  shown: 0,
  listeners: new Map<string, Set<(event: unknown) => void>>(),
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return env.os;
    },
  },
  Keyboard: {
    isVisible: () => env.shown > 0,
    metrics: () => (env.shown > 0 ? { height: env.shown, screenY: 0 } : undefined),
    addListener: (name: string, handler: (event: unknown) => void) => {
      const set = env.listeners.get(name) ?? new Set();
      set.add(handler);
      env.listeners.set(name, set);
      return { remove: () => set.delete(handler) };
    },
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function emit(name: string, height = 0) {
  act(() => {
    for (const handler of env.listeners.get(name) ?? [])
      handler({ endCoordinates: { screenX: 0, screenY: 0, width: 0, height } });
  });
}

function probe(): { visible: boolean; height: number } {
  const seen = { visible: false, height: 0 };
  function Probe() {
    seen.visible = useKeyboardVisible();
    seen.height = useKeyboardHeight();
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return seen;
}

beforeEach(() => {
  env.os = "ios";
  env.shown = 0;
  env.listeners.clear();
});

describe("useKeyboardVisible and useKeyboardHeight", () => {
  it("iOS follows the keyboard as it starts to move, and ignores Android's late events", () => {
    const seen = probe();
    expect(seen).toEqual({ visible: false, height: 0 });
    emit("keyboardDidShow", 300);
    expect(seen).toEqual({ visible: false, height: 0 });
    emit("keyboardWillShow", 335);
    expect(seen).toEqual({ visible: true, height: 335 });
    emit("keyboardWillShow", 291);
    expect(seen).toEqual({ visible: true, height: 291 });
    emit("keyboardWillHide");
    expect(seen).toEqual({ visible: false, height: 0 });
  });

  it("Android follows the keyboard once it has arrived", () => {
    env.os = "android";
    const seen = probe();
    emit("keyboardWillShow", 300);
    expect(seen).toEqual({ visible: false, height: 0 });
    emit("keyboardDidShow", 296);
    expect(seen).toEqual({ visible: true, height: 296 });
    emit("keyboardDidHide");
    expect(seen).toEqual({ visible: false, height: 0 });
  });

  it("starts from a keyboard that is already up", () => {
    env.shown = 280;
    expect(probe()).toEqual({ visible: true, height: 280 });
  });

  it("stops listening when the screen goes", () => {
    let renderer: ReturnType<typeof create> | undefined;
    function Probe() {
      useKeyboardVisible();
      useKeyboardHeight();
      return null;
    }
    act(() => {
      renderer = create(<Probe />);
    });
    const live = () => [...env.listeners.values()].reduce((sum, set) => sum + set.size, 0);
    expect(live()).toBe(4);
    act(() => renderer?.unmount());
    expect(live()).toBe(0);
  });
});

describe("keyboardLift: how far a screen above the safe area raises its bottom edge", () => {
  it("iOS: the keyboard's height reaches under the home indicator, which the safe area clears", () => {
    // iPhone 17 Pro, measured in the audit: keyboard top at 539 of 874, so 335 high; 301 is needed.
    expect(keyboardLift(335, 34)).toBe(301);
    expect(keyboardLift(260, 0)).toBe(260);
  });

  it("Android: React Native already leaves the system bars out of the height", () => {
    env.os = "android";
    expect(keyboardLift(296, 24)).toBe(296);
  });

  it("is nothing while the keyboard is hidden, or no taller than the inset", () => {
    expect(keyboardLift(0, 34)).toBe(0);
    expect(keyboardLift(20, 34)).toBe(0);
    env.os = "android";
    expect(keyboardLift(0, 24)).toBe(0);
  });
});
