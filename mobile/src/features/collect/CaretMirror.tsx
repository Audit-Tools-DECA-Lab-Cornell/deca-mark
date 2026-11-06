import { Text, View } from "react-native";
import { useTheme } from "../../ui";
import type { MeasuredLine } from "./caret-line";

/**
 * A hidden copy of a multi-line answer, laid out at the field's text width in its font, so that
 * `onTextLayout` reports where each wrapped line really sits. The text box itself never reports its
 * lines or scrolls, and spreading rows over the characters goes wrong as soon as a long wrapped
 * paragraph is followed by short lines. The copy is absolutely positioned and transparent, takes no
 * touches and is hidden from the screen reader, so it adds nothing to the layout, the scroll height
 * or what is read aloud.
 */
export function CaretMirror({
  text,
  onLines,
}: {
  readonly text: string;
  readonly onLines: (lines: readonly MeasuredLine[]) => void;
}) {
  const theme = useTheme();
  // The same inset as `TextInput`: its border, then the field's horizontal padding.
  const inset = theme.size.tileBorder + theme.space.s4;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: "absolute", top: 0, left: inset, right: inset, opacity: 0 }}
    >
      <Text
        accessible={false}
        maxFontSizeMultiplier={1.8}
        style={[theme.type.answer, { color: "transparent" }]}
        onTextLayout={(event) => onLines(event.nativeEvent.lines)}
      >
        {text}
      </Text>
    </View>
  );
}
