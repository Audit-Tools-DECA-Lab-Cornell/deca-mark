import type { ReactElement } from "react";
import { act, create, type ReactTestInstance, type ReactTestRenderer } from "react-test-renderer";
import { PreferencesProvider } from "./preferences";
import { ThemeProvider } from "./theme";

/**
 * Renders a component in the Day theme over the stand-ins of `native.fixture.tsx`, and reads the
 * result as a screen reader meets it: its words and its controls. Import it after the mocks.
 */

/** What a rendered screen says and offers, as a screen reader would meet it. */
export type Screen = {
  readonly renderer: ReactTestRenderer;
  /** Every run of text on screen, in order. */
  texts: () => string[];
  /** Whether any text on screen contains this. */
  says: (text: string) => boolean;
  /** The pressable control with this accessibility label (a button's words). */
  control: (label: string) => ReactTestInstance;
  /** Every pressable control's label, in order. */
  controls: () => string[];
  /** Presses a control and lets its effects run. */
  press: (label: string) => Promise<void>;
  /** Types into the text field with this test ID, as its `onChangeText` receives it. */
  type: (testID: string, text: string) => Promise<void>;
};

function textOf(node: ReactTestInstance | string): string {
  if (typeof node === "string") return node;
  return node.children.map(textOf).join("");
}

/** The props a host stand-in carries that a test reads. */
type HostProps = {
  readonly accessibilityLabel?: unknown;
  readonly accessibilityState?: { readonly disabled?: boolean } | undefined;
  readonly disabled?: boolean | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly onChangeText?: ((text: string) => void) | undefined;
  readonly testID?: string | undefined;
};

const propsOf = (node: ReactTestInstance) => node.props as HostProps;
const isHost = (node: ReactTestInstance, name: string) => (node.type as unknown) === name;

// React runs effects and state updates inside act() only when told this is a test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export function render(element: ReactElement): Screen {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(
      <PreferencesProvider>
        <ThemeProvider>{element}</ThemeProvider>
      </PreferencesProvider>,
    );
  });
  if (!renderer) throw new Error("The screen did not render.");
  const root = renderer.root;
  const pressables = () => root.findAll((node) => isHost(node, "Pressable"));
  const labelOf = (node: ReactTestInstance) => {
    const label = propsOf(node).accessibilityLabel;
    return typeof label === "string" ? label : textOf(node);
  };
  const screen: Screen = {
    renderer,
    texts: () =>
      root
        .findAll((node) => isHost(node, "Text"))
        .map((node) => textOf(node))
        .filter((text) => text.length > 0),
    says: (text) => screen.texts().some((line) => line.includes(text)),
    control: (label) => {
      const found = pressables().find((node) => labelOf(node) === label);
      if (!found)
        throw new Error(`No control "${label}". Controls: ${screen.controls().join(" | ")}`);
      return found;
    },
    controls: () => pressables().map(labelOf),
    press: async (label) => {
      const target = screen.control(label);
      await act(async () => {
        propsOf(target).onPress?.();
      });
    },
    type: async (testID, text) => {
      const field = root.find(
        (node) => isHost(node, "TextInput") && propsOf(node).testID === testID,
      );
      await act(async () => {
        propsOf(field).onChangeText?.(text);
      });
    },
  };
  return screen;
}

/** Whether a control is off, as its accessibility state says. */
export function isDisabled(control: ReactTestInstance): boolean {
  const props = propsOf(control);
  return props.accessibilityState?.disabled === true || props.disabled === true;
}
