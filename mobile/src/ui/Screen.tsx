import { StatusBar } from "expo-status-bar";
import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dockClearance } from "./TabDock";
import { type Theme, useStyles, useTheme } from "./theme";

export type ScreenProps = {
  children?: ReactNode;
  /** Scrolls the content; the footer stays pinned. */
  scroll?: boolean | undefined;
  /** Lifts the content and footer above the keyboard. */
  keyboard?: boolean | undefined;
  /** Pads the content by the 20 px gutter (default). Turn it off for edge-to-edge maps. */
  padded?: boolean | undefined;
  /** A pinned bottom area: the screen's main action ("Place the next observation"). */
  footer?: ReactNode;
  /** Clears the floating tab dock, for the screens of a tab. */
  dock?: boolean | undefined;
  /** Extra style for the content column (inside the gutter). */
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string | undefined;
};

function screenStyles(t: Theme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.c.ground },
    fill: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    footer: { paddingTop: t.space.s3, gap: t.space.s3, backgroundColor: t.c.ground },
  });
}

/**
 * The ground every collector screen stands on: Contour ground, safe areas, the 20 px gutter, an
 * optional scroll and keyboard lift, a pinned footer, and room for the tab dock.
 */
export function Screen({
  children,
  scroll = false,
  keyboard = false,
  padded = true,
  footer,
  dock = false,
  contentStyle,
  testID,
}: ScreenProps) {
  const t = useTheme();
  const s = useStyles(screenStyles);
  const insets = useSafeAreaInsets();
  const gutter = padded ? t.layout.gutter : 0;
  // The dock floats over the bottom of the screen; the last content or the footer ends above it,
  // measured with the dock's own formula so the two never drift apart.
  const bottom = dock ? dockClearance(t, insets.bottom) : insets.bottom;

  const sides: ViewStyle = {
    paddingLeft: insets.left + gutter,
    paddingRight: insets.right + gutter,
  };
  // The pinned actions keep the gutter even when the content runs edge to edge (a map).
  const footerSides: ViewStyle = {
    paddingLeft: insets.left + t.layout.gutter,
    paddingRight: insets.right + t.layout.gutter,
  };
  const content: ViewStyle = {
    ...sides,
    paddingTop: insets.top,
    paddingBottom: footer ? t.space.s4 : bottom + t.space.s6,
  };

  const body = scroll ? (
    <ScrollView
      style={s.fill}
      contentContainerStyle={[s.scrollContent, content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[s.fill, content, contentStyle]}>{children}</View>
  );

  const pinned = footer ? (
    <View style={[s.footer, footerSides, { paddingBottom: bottom + t.space.s4 }]}>{footer}</View>
  ) : null;

  return (
    <View testID={testID} style={s.screen}>
      {/* Dark glyphs on the Day ground, light on Dusk. The root layout keeps "light" for the old
          Nocturne screens; this one wins while a Contour screen is mounted. */}
      <StatusBar style={t.scheme === "dusk" ? "light" : "dark"} />
      {keyboard ? (
        // Edge-to-edge on both platforms: the window does not resize, so padding lifts the content.
        <KeyboardAvoidingView style={s.fill} behavior="padding">
          {body}
          {pinned}
        </KeyboardAvoidingView>
      ) : (
        <>
          {body}
          {pinned}
        </>
      )}
    </View>
  );
}
