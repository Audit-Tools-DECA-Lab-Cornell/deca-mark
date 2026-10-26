import { useEffect, useState } from "react";
import { Keyboard, type KeyboardEvent, Platform } from "react-native";

/**
 * The software keyboard as the screens meet it. iOS reports it as it starts to move, so whatever moves
 * with it moves together; Android reports it once it has arrived. `keyboardWillChangeFrame` is left
 * out on purpose: iOS sends it before it undocks or floats the keyboard, and a floating keyboard covers
 * nothing (React Native's own avoidance listens to Show and Hide alone, for the same reason).
 */
function listen(onShow: (event: KeyboardEvent) => void, onHide: () => void): () => void {
  const ios = Platform.OS === "ios";
  const shown = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", onShow);
  const hidden = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", onHide);
  return () => {
    shown.remove();
    hidden.remove();
  };
}

/** Whether the software keyboard is up. */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(() => Keyboard.isVisible());
  useEffect(
    () =>
      listen(
        () => setVisible(true),
        () => setVisible(false),
      ),
    [],
  );
  return visible;
}

/**
 * How tall the software keyboard is, in points, as React Native reports it: 0 while it is hidden. iOS
 * counts the home-indicator inset in it. Android does not: `ReactRootView` sends the IME inset less
 * the system-bar inset (`imeInsets.bottom - barInsets.bottom`).
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(() =>
    Keyboard.isVisible() ? (Keyboard.metrics()?.height ?? 0) : 0,
  );
  useEffect(
    () =>
      listen(
        (event) => setHeight(event.endCoordinates.height),
        () => setHeight(0),
      ),
    [],
  );
  return height;
}

/**
 * How far a screen that already keeps the safe area clear must lift its bottom edge to end where the
 * keyboard begins. Pad by this much; it needs no layout measurement and no animation, which is why
 * Collect uses it and not React Native's `KeyboardAvoidingView` (MOB-34). On iOS the keyboard's height
 * reaches under the home indicator, which the safe area already clears; on Android the reported height
 * already leaves out the system bars.
 */
export function keyboardLift(keyboardHeight: number, bottomInset: number): number {
  return Math.max(0, Platform.OS === "ios" ? keyboardHeight - bottomInset : keyboardHeight);
}
