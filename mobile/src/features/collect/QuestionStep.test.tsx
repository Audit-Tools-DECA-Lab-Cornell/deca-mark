import type { ReactElement } from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { type ResolvedQuestion, visibleQuestions } from "../../forms/engine";
import { janetTestV1 } from "../../forms/fixtures/janet-test-v1";
import { startSession } from "../../forms/session";
import { PreferencesProvider } from "../../ui/preferences";
import { ThemeProvider } from "../../ui/theme";
import { QuestionStep } from "./QuestionStep";

vi.mock("react-native", async () => (await import("../../ui/native.fixture")).reactNative);
vi.mock(
  "react-native-reanimated",
  async () => (await import("../../ui/native.fixture")).reanimated,
);
vi.mock("expo-sqlite/kv-store", async () => (await import("../../ui/native.fixture")).kvStore);
vi.mock("expo-haptics", async () => (await import("../../ui/native.fixture")).haptics);
vi.mock("../../ui/Icon", async () => (await import("../../ui/native.fixture")).icon);
vi.mock("../../ui/fonts", async () => (await import("../../ui/native.fixture")).fonts);
vi.mock("react-native-svg", async () => (await import("../../ui/native.fixture")).svg);
vi.mock(
  "react-native-safe-area-context",
  async () => (await import("../../ui/native.fixture")).safeArea,
);
vi.mock("expo-status-bar", async () => (await import("../../ui/native.fixture")).statusBar);
vi.mock("expo-router", async () => (await import("../../ui/native.fixture")).router);

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** MOB-34: what the question step does for the keyboard. */

function question(id: string): ResolvedQuestion {
  const found = visibleQuestions(janetTestV1, {}).find((entry) => entry.id === id);
  if (!found) throw new Error(`No question ${id} is visible on an empty form.`);
  return found;
}

const hostProps = (node: ReactTestInstance) =>
  node.props as {
    testID?: string;
    onLayout?: (event: unknown) => void;
    keyboardDismissMode?: string;
    keyboardShouldPersistTaps?: string;
  };

function mount(id: string, extra: { keyboardUp?: boolean; showLinks?: boolean } = {}) {
  const scrollTo = vi.fn();
  const element: ReactElement = (
    <PreferencesProvider>
      <ThemeProvider>
        <QuestionStep
          form={janetTestV1}
          state={startSession()}
          question={question(id)}
          position={1}
          total={12}
          columns={2}
          onChoose={() => {}}
          onToggle={() => {}}
          onWrite={() => {}}
          onBack={() => {}}
          onAdvance={() => {}}
          onReview={() => {}}
          onAdjust={() => {}}
          {...extra}
        />
      </ThemeProvider>
    </PreferencesProvider>
  );
  let renderer: ReturnType<typeof create> | undefined;
  act(() => {
    renderer = create(element, {
      createNodeMock: (node) => (node.type === "ScrollView" ? { scrollTo } : null),
    });
  });
  if (!renderer) throw new Error("The step did not render.");
  const root = renderer.root;
  const hosts = (name: string) => root.findAll((node) => (node.type as unknown) === name);
  const [scroll] = hosts("ScrollView");
  if (!scroll) throw new Error("The step has no scrolling area.");
  const field = hosts("View").find((node) => hostProps(node).testID === "collect-field");
  const layout = (node: ReactTestInstance | undefined, y: number, height: number) =>
    act(() => {
      hostProps(node ?? scroll).onLayout?.({
        nativeEvent: { layout: { x: 0, y, width: 300, height } },
      });
    });
  return {
    scrollTo,
    scroll,
    field,
    layout,
    labels: () =>
      hosts("Pressable").map(
        (node) => (node.props as { accessibilityLabel?: string }).accessibilityLabel,
      ),
  };
}

describe("the question step on a keyboard (MOB-34)", () => {
  it("a drag on the scrolling area dismisses the keyboard, and a tap on a control still lands", () => {
    const { scroll } = mount("play_event_summary");
    expect(hostProps(scroll).keyboardDismissMode).toBe("on-drag");
    expect(hostProps(scroll).keyboardShouldPersistTaps).toBe("handled");
  });

  it("scrolls the typed field to the foot of the area, above the footer, once the keyboard is up", () => {
    const { scrollTo, scroll, field, layout } = mount("play_event_summary", { keyboardUp: true });
    expect(field).toBeDefined();
    // The area is 216 pt tall; the 4-row field sits at 170 to 310 inside it, below its fold.
    layout(scroll, 0, 216);
    layout(field, 170, 140);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 170 + 140 + 8 - 216, animated: false });
  });

  it("follows the field as it grows with what is typed", () => {
    const { scrollTo, scroll, field, layout } = mount("play_event_summary", { keyboardUp: true });
    layout(scroll, 0, 216);
    layout(field, 170, 140);
    layout(field, 170, 168);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 170 + 168 + 8 - 216, animated: false });
  });

  it("does not scroll past the top when the field already fits", () => {
    const { scrollTo, scroll, field, layout } = mount("play_event_summary", { keyboardUp: true });
    layout(scroll, 0, 400);
    layout(field, 50, 140);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  });

  it("leaves the scroll alone while the keyboard is down", () => {
    const { scrollTo, scroll, field, layout } = mount("play_event_summary");
    layout(scroll, 0, 216);
    layout(field, 170, 140);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("has no field to scroll to on a choice question", () => {
    const { scrollTo, scroll, field, layout } = mount("age_range", { keyboardUp: true });
    expect(field).toBeUndefined();
    layout(scroll, 0, 216);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("offers Review answers and Adjust point, and drops them when the keyboard leaves no room", () => {
    expect(mount("play_event_summary").labels()).toEqual(
      expect.arrayContaining(["Review answers", "Adjust point"]),
    );
    const bare = mount("play_event_summary", { keyboardUp: true, showLinks: false }).labels();
    expect(bare).not.toContain("Review answers");
    expect(bare).not.toContain("Adjust point");
    expect(bare).toEqual(expect.arrayContaining(["Back"]));
  });
});
