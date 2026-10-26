import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { questionSchema } from "../../forms/definition";
import { QuestionValueInput } from "./QuestionValueInput";

vi.mock("react-native", () => ({ View: "Field" }));
vi.mock("../../ui", () => ({ TextInput: "Input", Textarea: "Area", Text: "Text", Note: "Note" }));
vi.mock("./TemporalInput", () => ({ TemporalInput: "Temporal" }));
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { value: true, configurable: true });

const mounted: ReactTestRenderer[] = [];
afterEach(() => {
  for (const renderer of mounted.splice(0)) act(() => renderer.unmount());
});

const number = questionSchema.parse({
  id: "amount",
  code: "amount",
  exportColumn: "amount",
  act: "Record",
  label: "Amount",
  source: "Test",
  kind: "number",
  numberMode: "decimal",
});

function mount(props: Parameters<typeof QuestionValueInput>[0]) {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(<QuestionValueInput {...props} />);
  });
  if (!renderer) throw new Error("Input did not mount.");
  mounted.push(renderer);
  return renderer.root;
}

function host(root: ReactTestInstance, name: string) {
  return root.find((node) => typeof node.type === "string" && node.type === name);
}

function properties(node: ReactTestInstance): {
  readonly value?: string;
  readonly keyboardType?: string;
  readonly disableFullscreenUI?: boolean;
  readonly autoCapitalize?: string;
  readonly autoCorrect?: boolean;
  readonly rows?: number;
  readonly showCount?: boolean;
  readonly onLayout?: (event: unknown) => void;
  readonly onChangeText?: (value: string) => void;
  readonly onWrite?: (value: string) => void;
} {
  return node.props;
}

const base = {
  question: number,
  value: 0,
  text: "",
  observer: false,
  rows: 4,
  compactField: false,
  onWrite: vi.fn(),
  onAdvance: vi.fn(),
  onFieldLayout: vi.fn(),
  onInputLayout: vi.fn(),
};

it.each([
  "-",
  "-1.25",
  "1e",
])("displays transient numeric text %j ahead of durable state", (text) => {
  // Given typed numeric text ahead of the stored number.
  const root = mount({ ...base, text });
  // When the controlled input renders.
  const input = host(root, "Input");
  // Then signs, decimals and incomplete notation remain exact.
  expect(properties(input).value).toBe(text);
  expect(properties(input).keyboardType).toBe("numbers-and-punctuation");
  expect(properties(input).disableFullscreenUI).toBe(true);
});

it("passes typed numeric text unchanged to the draft writer", () => {
  // Given a decimal input with a writer.
  const onWrite = vi.fn();
  const input = host(mount({ ...base, onWrite }), "Input");
  // When the observer enters a signed decimal.
  act(() => properties(input).onChangeText?.("-12.50"));
  // Then writing preserves the entered numeric syntax.
  expect(onWrite).toHaveBeenCalledWith("-12.50");
});

it("uses the semantic observer flag for text input behavior", () => {
  // Given a renamed observer question with an ID-based column.
  const question = {
    ...number,
    kind: "text",
    id: "recorded_by",
    exportColumn: "recorded_by",
  } as const;
  // When its semantic observer flag reaches the input.
  const input = host(mount({ ...base, question, observer: true }), "Input");
  // Then the native keyboard offers initials without autocorrection.
  expect(properties(input).autoCapitalize).toBe("characters");
  expect(properties(input).autoCorrect).toBe(false);
});

it("forwards compact multiline sizing and both measurement callbacks", () => {
  // Given a multiline field in a keyboard-constrained viewport.
  const question = { ...number, kind: "text", rows: 4 } as const;
  const onFieldLayout = vi.fn();
  const onInputLayout = vi.fn();
  // When its controlled field renders in compact mode.
  const root = mount({
    ...base,
    question,
    rows: 2,
    compactField: true,
    onFieldLayout,
    onInputLayout,
  });
  // Then its two-row field hides the counter and preserves layout measurements.
  expect(properties(host(root, "Field")).onLayout).toBe(onFieldLayout);
  const input = host(root, "Area");
  expect(properties(input).rows).toBe(2);
  expect(properties(input).showCount).toBe(false);
  expect(properties(input).disableFullscreenUI).toBe(true);
  expect(properties(input).onLayout).toBe(onInputLayout);
});

it("keeps automatic captured values read-only", () => {
  // Given a captured observer code and unrelated transient text.
  const question = { ...number, kind: "text", valueSource: "observerCode" } as const;
  // When an automatic value is displayed.
  const root = mount({ ...base, question, value: "JL", text: "stale" });
  // Then the capture value is shown without an editable field.
  expect(host(root, "Text").children).toEqual(["JL"]);
  for (const name of ["Input", "Field"])
    expect(
      root.findAll((node) => typeof node.type === "string" && node.type === name),
    ).toHaveLength(0);
});

it("forwards manual temporal values and writes to the temporal control", () => {
  // Given a manual date field whose canonical value has been typed.
  const question = questionSchema.parse({
    ...number,
    kind: "dateTime",
    numberMode: undefined,
    dateTime: { mode: "date", timeZone: "UTC" },
  });
  const text = "2026-10-25";
  // When the value entry renders.
  const input = host(mount({ ...base, question, text }), "Temporal");
  // Then the existing temporal control receives the current value and draft writer.
  expect(properties(input).value).toBe(text);
  expect(properties(input).onWrite).toBe(base.onWrite);
});
