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
    onChangeText?: (text: string) => void;
    disableFullscreenUI?: boolean;
    keyboardDismissMode?: string;
    keyboardShouldPersistTaps?: string;
  };

function mount(
  id: string,
  extra: { keyboardUp?: boolean; showLinks?: boolean; compactField?: boolean } = {},
) {
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
  const input = hosts("TextInput")[0];
  return {
    scrollTo,
    scroll,
    field,
    layout,
    input,
    /** Types into the answer field the way the observer does. */
    typeText: (text: string) =>
      act(() => hostProps(input as ReactTestInstance).onChangeText?.(text)),
    /** The minimum height the answer field is drawn at, and whether it carries a character counter. */
    drawn: () => {
      const input = hosts("TextInput")[0];
      const flat = (style: unknown): { minHeight?: number } =>
        !style
          ? {}
          : Array.isArray(style)
            ? Object.assign({}, ...style.map(flat))
            : (style as { minHeight?: number });
      return {
        minHeight: input ? flat((input.props as { style?: unknown }).style).minHeight : undefined,
        counter: root.findAll(
          (node) => (node.type as unknown) === "Text" && /\d+ \/ \d+/.test(String(node.children)),
        ).length,
      };
    },
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
    const { scrollTo, scroll, field, input, layout } = mount("play_event_summary", {
      keyboardUp: true,
    });
    layout(scroll, 0, 216);
    layout(field, 170, 140);
    // The text has outgrown the four rows: the input is 148 pt, past its 120 pt minimum.
    layout(input, 2, 148);
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

  it("keeps the first line inside an area shorter than the field (a phone in landscape)", () => {
    // The 4-row input is 120 pt (16 + 16 padding, 4 x 22) in a 2 pt border, plus a counter; the area is 89 pt tall.
    const full = mount("play_event_summary", { keyboardUp: true });
    expect(full.drawn().minHeight).toBe(120);
    expect(full.drawn().counter).toBe(1);
    full.layout(full.scroll, 0, 89);
    full.layout(full.field, 80, 146);
    // Empty and taller than the area: the top of the field, where the first line is typed, is kept.
    expect(full.scrollTo).toHaveBeenLastCalledWith({ y: 80, animated: false });

    const compact = mount("play_event_summary", { keyboardUp: true, compactField: true });
    expect(compact.drawn().minHeight).toBe(76);
    expect(compact.drawn().counter).toBe(0);
    compact.layout(compact.scroll, 0, 89);
    // The two-row field is 80 pt: the 76 pt input and the 2 pt border above and below it.
    compact.layout(compact.field, 80, 80);
    // It fits: its foot sits 8 pt above the foot of the area, and the whole field shows.
    const [{ y }] = compact.scrollTo.mock.calls.at(-1) as [{ y: number }];
    expect(y).toBe(80 + 80 + 8 - 89);
    expect(80).toBeGreaterThanOrEqual(y);
    expect(80 + 80).toBeLessThanOrEqual(y + 89);
  });

  it("shows two rows of the question's four when compact, and all four otherwise", () => {
    expect(mount("play_event_summary", { compactField: true }).drawn().minHeight).toBe(76);
    expect(mount("play_event_summary").drawn().minHeight).toBe(120);
  });

  // MOB-34 review round 3: the rule follows the field's height, not whether it is empty.
  describe("an answered field taller than the scrolling area (an iPhone SE in portrait)", () => {
    // 114 pt of scrolling area; the 4-row field is 124 pt (120 input and its border) plus an 8 pt gap
    // and a counter: 151 pt, so it cannot show whole. Its top is at 80.
    const VIEW = 114;
    const TOP = 80;
    const lay = (m: ReturnType<typeof mount>, input: number, field: number) => {
      m.layout(m.scroll, 0, VIEW);
      m.layout(m.field, TOP, field);
      m.layout(m.input, 2, input);
    };

    it("keeps the first typed line inside the area while the field is at its minimum height", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText("Two children dig.");
      lay(m, 120, 151);
      const [{ y }] = m.scrollTo.mock.calls.at(-1) as [{ y: number }];
      // The first line sits 2 pt border and 16 pt padding below the field's top, 22 pt tall.
      const lineTop = TOP + 18;
      expect(lineTop).toBeGreaterThanOrEqual(y);
      expect(lineTop + 22).toBeLessThanOrEqual(y + VIEW);
    });

    it("follows the newest line once the typed text has outgrown the rows", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText("One.\nTwo.\nThree.\nFour.\nFive.\nSix.");
      lay(m, 164, 195);
      expect(m.scrollTo).toHaveBeenLastCalledWith({ y: TOP + 195 + 8 - VIEW, animated: false });
    });

    it("keeps the top again when the text is deleted back to the rows", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText("One.\nTwo.\nThree.\nFour.\nFive.");
      lay(m, 142, 173);
      m.typeText("One.");
      m.layout(m.input, 2, 120);
      m.layout(m.field, TOP, 151);
      expect(m.scrollTo).toHaveBeenLastCalledWith({ y: TOP, animated: false });
    });
  });

  it("asks Android for no fullscreen extract editor on the answer field", () => {
    expect(
      hostProps(mount("play_event_summary", { compactField: true }).input as ReactTestInstance)
        .disableFullscreenUI,
    ).toBe(true);
    expect(
      hostProps(mount("observer_initials").input as ReactTestInstance)?.disableFullscreenUI,
    ).toBe(true);
  });
});
