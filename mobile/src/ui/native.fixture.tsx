import { createElement, type ReactNode, useEffect } from "react";

/**
 * Component tests without a device: stand-ins for React Native's host components and the native
 * modules the Contour primitives use; `screen.fixture.tsx` renders with them. Each test file mocks
 * the modules itself (`vi.mock` is hoisted per file):
 *
 *   vi.mock("react-native", async () => (await import("../../ui/native.fixture")).reactNative);
 *   vi.mock("react-native-reanimated", async () => (await import("../../ui/native.fixture")).reanimated);
 *   vi.mock("expo-sqlite/kv-store", async () => (await import("../../ui/native.fixture")).kvStore);
 *   vi.mock("expo-haptics", async () => (await import("../../ui/native.fixture")).haptics);
 *   vi.mock("../../ui/Icon", async () => (await import("../../ui/native.fixture")).icon);
 *   vi.mock("../../ui/fonts", async () => (await import("../../ui/native.fixture")).fonts);
 *   vi.mock("react-native-svg", async () => (await import("../../ui/native.fixture")).svg);
 *   vi.mock("react-native-safe-area-context", async () => (await import("../../ui/native.fixture")).safeArea);
 *   vi.mock("expo-status-bar", async () => (await import("../../ui/native.fixture")).statusBar);
 *   vi.mock("expo-router", async () => (await import("../../ui/native.fixture")).router);
 *
 * Host components keep their props, so a test sees accessibility labels, states and hints as a
 * screen reader would. Styles are not computed; layout is checked on the simulator.
 */

type HostProps = { children?: ReactNode | ((state: { pressed: boolean }) => ReactNode) };

function host(name: string) {
  function Host({ children, ...props }: HostProps & Record<string, unknown>) {
    const content = typeof children === "function" ? children({ pressed: false }) : children;
    return createElement(name, props, content);
  }
  Host.displayName = name;
  return Host;
}

type Style = Record<string, unknown> | null | undefined | false | readonly Style[];

function flatten(style: Style): Record<string, unknown> {
  if (!style) return {};
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten));
  return style as Record<string, unknown>;
}

const announcements: string[] = [];
const alerts: {
  title: string;
  message: string | undefined;
  buttons: readonly AlertButton[] | undefined;
}[] = [];
type AlertButton = { text: string; style?: string; onPress?: () => void };

export const reactNative = {
  View: host("View"),
  Text: host("Text"),
  Pressable: host("Pressable"),
  ScrollView: host("ScrollView"),
  KeyboardAvoidingView: host("KeyboardAvoidingView"),
  TextInput: host("TextInput"),
  StyleSheet: {
    create: <T,>(styles: T): T => styles,
    flatten,
    hairlineWidth: 1,
    absoluteFill: {},
    absoluteFillObject: {},
  },
  Platform: {
    OS: "ios",
    select: <T,>(options: { ios?: T; default?: T }) => options.ios ?? options.default,
  },
  Alert: {
    alert: (title: string, message?: string, buttons?: readonly AlertButton[]) => {
      alerts.push({ title, message, buttons });
    },
  },
  Appearance: { setColorScheme: () => {}, getColorScheme: () => "light" },
  AccessibilityInfo: {
    announceForAccessibility: (message: string) => {
      announcements.push(message);
    },
    announceForAccessibilityWithOptions: (message: string) => {
      announcements.push(message);
    },
    isReduceMotionEnabled: async () => true,
    isScreenReaderEnabled: async () => false,
    addEventListener: () => ({ remove: () => {} }),
  },
  Keyboard: {
    dismiss: () => {},
    isVisible: () => false,
    addListener: () => ({ remove: () => {} }),
  },
  AppState: { currentState: "active", addEventListener: () => ({ remove: () => {} }) },
};

export const reanimated = {
  default: { View: host("Animated.View") },
  useSharedValue: <T,>(initial: T) => {
    let value = initial;
    return {
      get: () => value,
      set: (next: T) => {
        value = next;
      },
    };
  },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useReducedMotion: () => true,
  withTiming: <T,>(value: T) => value,
  Easing: { bezier: () => (t: number) => t, linear: (t: number) => t },
};

const stored = new Map<string, string>();
export const kvStore = {
  default: {
    getItemSync: (key: string) => stored.get(key) ?? null,
    setItemSync: (key: string, value: string) => {
      stored.set(key, value);
    },
  },
};

export const haptics = {
  impactAsync: async () => {},
  notificationAsync: async () => {},
  selectionAsync: async () => {},
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
};

export const svg = {
  default: host("Svg"),
  Circle: host("Circle"),
  ClipPath: host("ClipPath"),
  Defs: host("Defs"),
  G: host("G"),
  Path: host("Path"),
  RadialGradient: host("RadialGradient"),
  Rect: host("Rect"),
  Stop: host("Stop"),
};

export const safeArea = {
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: host("SafeAreaProvider"),
  SafeAreaView: host("SafeAreaView"),
};

export const statusBar = { StatusBar: () => null };

const navigation: string[] = [];
const routerValue = {
  push: (href: string) => {
    navigation.push(href);
  },
  replace: (href: string) => {
    navigation.push(href);
  },
  navigate: (href: string) => {
    navigation.push(href);
  },
  back: () => {
    navigation.push("back");
  },
  dismissTo: (href: string) => {
    navigation.push(href);
  },
  canGoBack: () => false,
};
const searchParams: { current: Record<string, string> } = { current: {} };
/** The route params the next render reads (`useLocalSearchParams`). */
export function setSearchParams(params: Record<string, string>): void {
  searchParams.current = params;
}
export const router = {
  router: routerValue,
  useRouter: () => routerValue,
  useLocalSearchParams: () => searchParams.current,
  /** Runs once the screen has mounted, as a first focus does. */
  useFocusEffect: (effect: () => undefined | (() => void)) => {
    useEffect(effect, [effect]);
  },
  Link: host("Link"),
};

/** Routes pushed since the last call, then cleared ("back" for a back). */
export function takeNavigation(): string[] {
  return navigation.splice(0);
}

/** The font files are not loaded; each weight keeps its family name. */
export const fonts = {
  contourFonts: {},
  fontFamily: (weight: number, mono = false) => `${mono ? "mono" : "sans"}-${weight}`,
};

/** Glyphs draw nothing here; a control's words and label carry its meaning. */
export const icon = {
  Icon: () => null,
  isIconName: (name: string) => typeof name === "string" && name.length > 0,
};

/** Announcements and alerts made since the last call, then cleared. */
export function takeAnnouncements(): string[] {
  return announcements.splice(0);
}

export function takeAlerts() {
  return alerts.splice(0);
}
