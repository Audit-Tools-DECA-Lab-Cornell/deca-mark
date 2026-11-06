import type { ReactElement } from "react";
import { StyleSheet } from "react-native";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { type FormDefinition, parseFormDefinition } from "../../forms/definition";
import { type ResolvedQuestion, visibleQuestions } from "../../forms/engine";
import { janetTestV1 } from "../../forms/fixtures/janet-test-v1";
import { startSession } from "../../forms/session";
import { PreferencesProvider } from "../../ui/preferences";
import { ThemeProvider } from "../../ui/theme";
import { caretRow, type MeasuredLine } from "./caret-line";
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

function question(id: string, form: FormDefinition = janetTestV1): ResolvedQuestion {
  const found = visibleQuestions(form, {}).find((entry) => entry.id === id);
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
    value?: string;
    onSelectionChange?: (event: unknown) => void;
    onTextLayout?: (event: unknown) => void;
    pointerEvents?: string;
    importantForAccessibility?: string;
    accessibilityElementsHidden?: boolean;
    style?: unknown;
  };

function mount(
  id: string,
  extra: { keyboardUp?: boolean; showLinks?: boolean; compactField?: boolean } = {},
  form: FormDefinition = janetTestV1,
) {
  const scrollTo = vi.fn();
  const write = vi.fn();
  const element: ReactElement = (
    <PreferencesProvider>
      <ThemeProvider>
        <QuestionStep
          form={form}
          state={startSession()}
          question={question(id, form)}
          position={1}
          total={12}
          columns={2}
          onChoose={() => {}}
          onToggle={() => {}}
          onWrite={write}
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
    write,
    scrollTo,
    scroll,
    field,
    layout,
    input,
    /** Types into the answer field the way the observer does. */
    typeText: (text: string) =>
      act(() => hostProps(input as ReactTestInstance).onChangeText?.(text)),
    /** Moves the caret, as the keyboard or a tap in the text does. */
    select: (start: number, end: number = start) =>
      act(() =>
        hostProps(input as ReactTestInstance).onSelectionChange?.({
          nativeEvent: { selection: { start, end } },
        }),
      ),
    /** The hidden text the step measures its wrapped lines with, when it renders one. */
    mirror: () => hosts("Text").find((node) => hostProps(node).onTextLayout),
    /** Reports the lines the hidden text laid out, as the native text does after a layout. */
    measure: (lines: readonly MeasuredLine[]) =>
      act(() => {
        const mirror = hosts("Text").find((node) => hostProps(node).onTextLayout);
        mirror && hostProps(mirror).onTextLayout?.({ nativeEvent: { lines } });
      }),
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
  it("updates Continue immediately before the durable answer arrives", () => {
    const m = mount("play_event_summary");
    expect(m.labels()).toContain("Skip for now");
    m.typeText("Children digging");
    expect(m.labels()).toContain("Continue");
    m.typeText("");
    expect(m.labels()).toContain("Skip for now");
    expect(m.write.mock.calls.map(([value]) => value)).toEqual(["Children digging", ""]);
  });

  it("cleans semantic observer initials while preserving an unrelated observer ID", () => {
    const observer = question("observer_initials");
    const form = parseFormDefinition({
      ...janetTestV1,
      columnNaming: "questionId",
      questions: [
        { ...observer, id: "recorded_by", exportColumn: "recorded_by", role: "observer" },
        { ...observer, id: "observer", exportColumn: "observer" },
      ],
    });
    const initials = mount("recorded_by", {}, form);
    initials.typeText("a b\t");
    expect(initials.write).toHaveBeenLastCalledWith("AB");
    expect(hostProps(initials.input as ReactTestInstance).value).toBe("AB");
    const unrelated = mount("observer", {}, form);
    unrelated.typeText("a b\t");
    expect(unrelated.write).toHaveBeenLastCalledWith("a b\t");
  });

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
    // Typed text of two rows: the 76 pt input and its 2 pt border above and below make an 80 pt field.
    compact.typeText("Two children dig.");
    compact.layout(compact.field, 80, 80);
    compact.layout(compact.input, 2, 76);
    // It fits: its foot sits 8 pt above the foot of the area, and the whole field shows.
    const [{ y }] = compact.scrollTo.mock.calls.at(-1) as [{ y: number }];
    expect(y).toBe(80 + 80 + 8 - 89);
    expect(80).toBeGreaterThanOrEqual(y);
    expect(80 + 80).toBeLessThanOrEqual(y + 89);
  });

  // MOB-34 review round 4: an empty input is measured by its placeholder, which wraps past the rows.
  describe("an empty field whose placeholder wraps past the rows", () => {
    it("keeps the top of a two-row field laid out at its placeholder height (a phone in landscape)", () => {
      // The placeholder wraps to 4 lines at the 242 pt text width: the empty input is 120 pt, not the
      // 76 pt of two rows, so the empty field is 124 pt with its border, in an 89 pt area.
      const m = mount("play_event_summary", { keyboardUp: true, compactField: true });
      m.layout(m.scroll, 0, 89);
      m.layout(m.field, 80, 124);
      m.layout(m.input, 2, 120);
      const [{ y }] = m.scrollTo.mock.calls.at(-1) as [{ y: number }];
      // The caret and the first line, 18 pt below the field's top, are inside the area.
      expect(y).toBeLessThanOrEqual(80);
      expect(80 + 18).toBeGreaterThanOrEqual(y);
      expect(80 + 18 + 22).toBeLessThanOrEqual(y + 89);
    });

    it("keeps the top of a four-row field at larger text (an iPhone SE in portrait at 1.24x)", () => {
      // The placeholder box is 141 pt against the unscaled 120 pt minimum; the field is 172 pt in 114 pt.
      const m = mount("play_event_summary", { keyboardUp: true });
      m.layout(m.scroll, 0, 114);
      m.layout(m.field, 80, 172);
      m.layout(m.input, 2, 141);
      expect(m.scrollTo).toHaveBeenLastCalledWith({ y: 80, animated: false });
    });

    it("follows the foot only once text has been typed into the grown box", () => {
      const m = mount("play_event_summary", { keyboardUp: true, compactField: true });
      m.layout(m.scroll, 0, 89);
      m.layout(m.field, 80, 124);
      m.layout(m.input, 2, 120);
      m.typeText("One.\nTwo.\nThree.\nFour.");
      m.layout(m.input, 2, 120);
      expect(m.scrollTo).toHaveBeenLastCalledWith({ y: 80 + 124 + 8 - 89, animated: false });
    });
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

  // MOB-35 review: the caret is not always at the end of the answer, and `Textarea` never scrolls itself.
  describe("a grown answer edited on an earlier line", () => {
    const VIEW = 114;
    const TOP = 80;
    const LINE = 22;
    const SIX = "One.\nTwo.\nThree.\nFour.\nFive.\nSix.";
    /** An iPhone SE in portrait: the 6-line input is 164 pt (16 padding and 6 x 22 each way) in a 195 pt field. */
    const lay = (m: ReturnType<typeof mount>, view = VIEW) => {
      m.layout(m.scroll, 0, view);
      m.layout(m.field, TOP, 195);
      m.layout(m.input, 2, 164);
    };
    /** The y the caret line sits at in the scrolling area's content: the field, the border and the padding, then the lines above it. */
    const lineTop = (line: number) => TOP + 2 + 16 + line * LINE;
    const shows = (m: ReturnType<typeof mount>, line: number, view: number) => {
      const [{ y }] = m.scrollTo.mock.calls.at(-1) as [{ y: number }];
      expect(lineTop(line)).toBeGreaterThanOrEqual(y);
      expect(lineTop(line) + LINE).toBeLessThanOrEqual(y + view);
    };

    it("keeps a caret on line 1 inside the area after a layout change (a rotation with the keyboard open)", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText(SIX);
      m.select(0);
      lay(m);
      shows(m, 0, VIEW);
      // The phone turns: the area is 89 pt tall and the field is laid out again.
      lay(m, 89);
      shows(m, 0, 89);
    });

    it("keeps a caret in the middle of the answer inside the area", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText(SIX);
      // Line 3 begins after "One.\nTwo.\n".
      m.select(10);
      lay(m);
      shows(m, 2, VIEW);
      lay(m, 89);
      shows(m, 2, 89);
    });

    it("still follows the foot while the caret is at the end", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText(SIX);
      m.select(SIX.length);
      lay(m);
      expect(m.scrollTo).toHaveBeenLastCalledWith({ y: TOP + 195 + 8 - VIEW, animated: false });
      // The foot also holds after a layout change.
      lay(m, 89);
      expect(m.scrollTo).toHaveBeenLastCalledWith({ y: TOP + 195 + 8 - 89, animated: false });
    });

    it("falls back to the line breaks before the caret until the lines are measured", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText(SIX);
      m.select(10);
      lay(m);
      // Line 3 begins after "One.\nTwo.\n"; with no measured lines the breaks are all that is known.
      shows(m, 2, VIEW);
    });

    it("follows the foot again when the caret returns to the end", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText(SIX);
      m.select(0);
      lay(m);
      m.select(SIX.length);
      lay(m);
      expect(m.scrollTo).toHaveBeenLastCalledWith({ y: TOP + 195 + 8 - VIEW, animated: false });
    });
  });

  // MOB-35 follow-up (Greptile): the caret's row comes from the measured lines, not from a ratio of characters.
  describe("a caret among wrapped and short lines", () => {
    const TOP = 80;
    const LINE = 22;
    /** What the native text reports for `text` wrapped at `width` characters: each hard-ended line keeps its break. */
    const wrapAt = (text: string, width: number): MeasuredLine[] => {
      const lines: string[] = [];
      const paragraphs = text.split("\n");
      paragraphs.forEach((paragraph, index) => {
        const end = index < paragraphs.length - 1 ? "\n" : "";
        if (paragraph === "") {
          lines.push(end);
          return;
        }
        for (let at = 0; at < paragraph.length; at += width) {
          const last = at + width >= paragraph.length;
          lines.push(paragraph.slice(at, at + width) + (last ? end : ""));
        }
      });
      return lines.map((line, row) => ({ text: line, y: row * LINE, height: LINE }));
    };
    /** 200 characters that wrap into ten rows, then eight one-character lines: 18 rows in all. */
    const MIXED = `${"x".repeat(200)}\n${[..."abcdefgh"].join("\n")}`;
    const lay = (m: ReturnType<typeof mount>, view: number, rowsInBox: number) => {
      m.layout(m.scroll, 0, view);
      m.layout(m.field, TOP, rowsInBox * LINE + 32 + 31);
      m.layout(m.input, 2, rowsInBox * LINE + 32);
    };
    const lineTop = (row: number) => TOP + 2 + 16 + row * LINE;
    const shows = (m: ReturnType<typeof mount>, row: number, view: number) => {
      const [{ y }] = m.scrollTo.mock.calls.at(-1) as [{ y: number }];
      expect(lineTop(row)).toBeGreaterThanOrEqual(y);
      expect(lineTop(row) + LINE).toBeLessThanOrEqual(y + view);
    };

    it("keeps the row of a caret at the end of a long wrapped paragraph in view (a phone in landscape)", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText(MIXED);
      m.measure(wrapAt(MIXED, 20));
      // Offset 199 is the last character of the wrapped paragraph: row 9 of 18, not row 16.
      m.select(199);
      lay(m, 89, 18);
      shows(m, 9, 89);
    });

    it("keeps the caret's row in view after a rotation lays the text out again at another width", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText(MIXED);
      m.measure(wrapAt(MIXED, 20));
      m.select(199);
      lay(m, 114, 18);
      shows(m, 9, 114);
      // The phone turns: the text is wider, so the paragraph wraps into five rows and the text has 13.
      m.measure(wrapAt(MIXED, 40));
      lay(m, 89, 13);
      shows(m, 4, 89);
    });

    it("keeps a caret on a short line after a wrapped paragraph on its row", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText(MIXED);
      m.measure(wrapAt(MIXED, 20));
      // The "c" is the third short line: after the 201 characters of the paragraph and "a\nb\n".
      m.select(201 + 4);
      lay(m, 89, 18);
      shows(m, 12, 89);
    });

    it("still follows the foot with the caret at the end of the mixed answer", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText(MIXED);
      m.measure(wrapAt(MIXED, 20));
      m.select(MIXED.length);
      lay(m, 89, 18);
      expect(m.scrollTo).toHaveBeenLastCalledWith({
        y: TOP + (18 * LINE + 32 + 31) + 8 - 89,
        animated: false,
      });
    });

    it("ignores lines measured for other text and falls back to the line breaks", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText("One.\nTwo.\nThree.\nFour.\nFive.\nSix.");
      m.measure(wrapAt("a very different answer", 10));
      m.select(10);
      lay(m, 89, 6);
      shows(m, 2, 89);
    });

    it("measures with a hidden, untouchable text that adds nothing to the layout", () => {
      const m = mount("play_event_summary", { keyboardUp: true });
      m.typeText(MIXED);
      const mirror = m.mirror();
      expect(mirror).toBeDefined();
      let holder = (mirror as ReactTestInstance).parent;
      while (holder && (holder.type as unknown) !== "View") holder = holder.parent;
      const holderProps = hostProps(holder as ReactTestInstance);
      expect(holderProps.pointerEvents).toBe("none");
      expect(holderProps.importantForAccessibility).toBe("no-hide-descendants");
      expect(holderProps.accessibilityElementsHidden).toBe(true);
      expect(StyleSheet.flatten(holderProps.style as never)).toMatchObject({
        position: "absolute",
        opacity: 0,
      });
      // It mirrors the answer so its wrapping is the field's; an empty answer renders none.
      expect((mirror as ReactTestInstance).children.join("")).toBe(MIXED);
      expect(mount("play_event_summary", { keyboardUp: true }).mirror()).toBeUndefined();
    });
  });

  describe("the caret's measured row", () => {
    const lines: MeasuredLine[] = [
      { text: "xxxx", y: 0, height: 20 },
      { text: "xx\n", y: 20, height: 20 },
      { text: "a\n", y: 40, height: 20 },
      { text: "b", y: 60, height: 20 },
    ];
    const text = "xxxxxx\na\nb";

    it("walks the line texts to the caret's offset", () => {
      expect(caretRow(text, 0, lines)).toEqual({ y: 0, height: 20 });
      expect(caretRow(text, 3, lines)).toEqual({ y: 0, height: 20 });
      expect(caretRow(text, 5, lines)).toEqual({ y: 20, height: 20 });
      expect(caretRow(text, 7, lines)).toEqual({ y: 40, height: 20 });
      expect(caretRow(text, 10, lines)).toEqual({ y: 60, height: 20 });
    });

    it("tells nothing when the lines do not belong to the text", () => {
      expect(caretRow("something else", 3, lines)).toBeNull();
      expect(caretRow(`${text} and more`, 3, lines)).toBeNull();
      expect(caretRow(text, 3, [])).toBeNull();
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
