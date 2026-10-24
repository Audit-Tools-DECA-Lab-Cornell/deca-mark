import { readFileSync } from "node:fs";
import type { ReactElement } from "react";
import { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { visibleQuestions } from "../../forms/engine";
import { janetTestV1 } from "../../forms/fixtures/janet-test-v1";
import { startSession } from "../../forms/session";
import { siteZones } from "../../maps/sample-site";
import type { SitePackage } from "../../packages/site-package";
import { FieldSessionContext, type FieldSessionValue } from "../../session/context";
import { render, type Screen } from "../../ui/screen.fixture";
import { CollectScreen } from "./CollectScreen";

/**
 * MOB-34 (audit C01): while the observer types, the answer field and Continue stay above the keyboard
 * on every pilot device (D33), the map stays mounted, and nothing animates the map's height.
 *
 * The component tests have no layout engine, so the frames are modelled the way the audit's
 * reproduction (`cloud/w3/skeptic-C01/kav-repro.mjs`) does: the panel's bottom edge is the window's
 * bottom edge, less the safe-area inset, less whatever bottom padding the keyboard adds. That padding
 * is read from the rendered tree. The simulator and emulator frame checks are listed in MOB-34.
 */

const device = vi.hoisted(() => ({
  os: "ios" as "ios" | "android",
  window: { width: 402, height: 874 },
  bottomInset: 34,
  /** The size of the software keyboard on this device, and the height showing now (0 when hidden). */
  keyboardSize: 0,
  keyboardHeight: 0,
  mapMounts: 0,
  mapUnmounts: 0,
  listeners: new Map<string, Set<(event: unknown) => void>>(),
}));

vi.mock("react-native", async () => {
  const { reactNative } = await import("../../ui/native.fixture");
  return {
    ...reactNative,
    Platform: {
      get OS() {
        return device.os;
      },
      select: <T,>(options: { ios?: T; android?: T; default?: T }) =>
        device.os === "ios"
          ? (options.ios ?? options.default)
          : (options.android ?? options.default),
    },
    Dimensions: {
      get: () => ({ ...device.window, scale: 2, fontScale: 1 }),
    },
    useWindowDimensions: () => ({ ...device.window, scale: 2, fontScale: 1 }),
    BackHandler: { addEventListener: () => ({ remove: () => {} }) },
    findNodeHandle: () => null,
    Keyboard: {
      dismiss: () => {},
      isVisible: () => device.keyboardHeight > 0,
      metrics: () =>
        device.keyboardHeight > 0 ? { height: device.keyboardHeight, screenY: 0 } : undefined,
      addListener: (name: string, handler: (event: unknown) => void) => {
        const set = device.listeners.get(name) ?? new Set();
        set.add(handler);
        device.listeners.set(name, set);
        return { remove: () => set.delete(handler) };
      },
    },
  };
});
vi.mock(
  "react-native-reanimated",
  async () => (await import("../../ui/native.fixture")).reanimated,
);
vi.mock("expo-sqlite/kv-store", async () => (await import("../../ui/native.fixture")).kvStore);
vi.mock("expo-haptics", async () => (await import("../../ui/native.fixture")).haptics);
vi.mock("../../ui/Icon", async () => (await import("../../ui/native.fixture")).icon);
vi.mock("../../ui/fonts", async () => (await import("../../ui/native.fixture")).fonts);
vi.mock("react-native-svg", async () => (await import("../../ui/native.fixture")).svg);
vi.mock("react-native-safe-area-context", async () => {
  const { safeArea } = await import("../../ui/native.fixture");
  return {
    ...safeArea,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: device.bottomInset, left: 0 }),
  };
});
vi.mock("expo-status-bar", async () => (await import("../../ui/native.fixture")).statusBar);
vi.mock("expo-router", async () => (await import("../../ui/native.fixture")).router);

// The session is a context value the test supplies; the real provider reaches into SQLite.
vi.mock("../../session/provider", async () => ({
  useFieldSession: (await import("../../session/context")).useFieldSession,
  shortLabel: (await import("../../domain/labels")).shortLabel,
}));
vi.mock("../../storage/use-observations", () => ({
  useObservations: () => ({ records: [], loading: false, error: null, retry: () => {} }),
}));

// MapLibre is native. The stand-in counts how often it mounts, which is what "never remounted" means.
vi.mock("./CollectMap", async () => {
  const react = await import("react");
  const { placementState } = await import("./placement");
  return {
    CollectMap: () => {
      react.useEffect(() => {
        device.mapMounts += 1;
        return () => {
          device.mapUnmounts += 1;
        };
      }, []);
      return react.createElement("Map", { testID: "collect-map" });
    },
    useAimZone: (_aim: unknown, zones: typeof siteZones, zone: (typeof siteZones)[number]) => ({
      centre: zone.centre,
      zoom: 21,
      moving: false,
      placement: placementState(zone.centre, zone, zones, false, "practice"),
      hint: null,
    }),
  };
});

function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error("Nothing to take the first of.");
  return item;
}

const zone = first(siteZones);

const sitePackage = {
  id: "fall-creek",
  name: "Fall Creek",
  siteId: "site-fall-creek",
  projectId: "project-janet",
  version: "v1",
  zones: siteZones,
} as SitePackage;

const SUMMARY = "play_event_summary";

function sessionAtSummary(): FieldSessionValue {
  const index = visibleQuestions(janetTestV1, {}).findIndex((question) => question.id === SUMMARY);
  expect(index).toBeGreaterThan(-1);
  return {
    pinned: null,
    parked: [],
    parkRecovered: async () => {},
    restoreParked: async () => {},
    discardParked: async () => {},
    beginVisit: () => {},
    endVisit: () => {},
    sitePackage,
    form: janetTestV1,
    zone,
    roundType: "standard",
    freshPeriod: false,
    placed: zone.centre,
    placementSource: "hand",
    armed: false,
    state: { ...startSession(), index },
    status: "",
    recovered: null,
    unreadableDraft: false,
    context: null,
    inProgress: {
      id: "OBS-1",
      startedAt: "2026-10-24T10:00:00.000Z",
      owner: "account",
      packageId: sitePackage.id,
      packageName: sitePackage.name,
    },
    saves: [],
    roundBlock: null,
    zoneBlock: null,
    openPackage: async () => ({ ok: false, reason: "" }),
    chooseZone: () => {},
    chooseRoundType: () => {},
    toggleFreshPeriod: () => {},
    setArmed: () => {},
    place: () => {},
    startZoneRecord: () => {},
    nudgeTo: () => {},
    dispatch: () => ({ state: startSession(), destination: "stay", autoAdvance: false }),
    save: async () => ({ ok: false, problems: [] }),
    discard: () => {},
    resumeRecovered: async () => undefined,
    discardRecovered: async () => {},
    announce: () => {},
  };
}

/** Collect on the play-event summary, the 4-row required text answer of `janet-test-v1`, with a word typed. */
function open(): Screen {
  const element: ReactElement = (
    <FieldSessionContext.Provider value={sessionAtSummary()}>
      <CollectScreen />
    </FieldSessionContext.Provider>
  );
  const screen = render(element);
  const field = screen.renderer.root.find(
    (node) =>
      isHostNamed(node, "TextInput") &&
      (node.props as { accessibilityLabel?: string }).accessibilityLabel ===
        "Describe the play event",
  );
  act(() => {
    (field.props as { onChangeText: (text: string) => void }).onChangeText("Two children dig.");
  });
  return screen;
}

/** The style properties these tests read. */
type Style = Partial<
  Record<"height" | "padding" | "paddingBottom" | "overflow" | "position" | "display", unknown>
>;

/** The flattened style of a host node, however React Native's arrays nest it. */
function styleOf(node: ReactTestInstance): Style {
  const flatten = (style: unknown): Style =>
    !style
      ? {}
      : Array.isArray(style)
        ? Object.assign({}, ...style.map(flatten))
        : (style as Style);
  return flatten((node.props as { style?: unknown }).style);
}

const isHost = (node: ReactTestInstance) => typeof node.type === "string";
const isHostNamed = (node: ReactTestInstance, name: string) => (node.type as unknown) === name;

/** Every host ancestor of a node, nearest first. */
function ancestors(node: ReactTestInstance): ReactTestInstance[] {
  const chain: ReactTestInstance[] = [];
  for (let parent = node.parent; parent; parent = parent.parent)
    if (isHost(parent)) chain.push(parent);
  return chain;
}

/**
 * How far the bottom of a control sits above the window's safe area: the bottom padding of every
 * ancestor. The keyboard must raise this by exactly the part of the keyboard that covers the screen.
 */
function lift(screen: Screen, label: string): number {
  return ancestors(screen.control(label)).reduce((sum, node) => {
    const padding = styleOf(node).paddingBottom;
    return sum + (typeof padding === "number" ? padding : 0);
  }, 0);
}

function byTestID(screen: Screen, testID: string): ReactTestInstance {
  const found = screen.renderer.root.findAll(
    (node) => isHost(node) && (node.props as { testID?: string }).testID === testID,
  );
  const [first] = found;
  if (!first) throw new Error(`No element with testID "${testID}".`);
  return first;
}

/**
 * Raises or lowers the keyboard as React Native reports it. `keyboardSize` is the height React Native
 * sends: on iOS the whole keyboard, home indicator included; on Android the IME inset less the
 * system-bar inset (`ReactRootView.java`, guarded below).
 */
async function keyboard(visible: boolean): Promise<void> {
  const ios = device.os === "ios";
  const name = visible
    ? ios
      ? "keyboardWillShow"
      : "keyboardDidShow"
    : ios
      ? "keyboardWillHide"
      : "keyboardDidHide";
  device.keyboardHeight = visible ? device.keyboardSize : 0;
  await act(async () => {
    for (const handler of device.listeners.get(name) ?? [])
      handler({
        endCoordinates: {
          screenX: 0,
          screenY: device.window.height - device.keyboardHeight,
          width: device.window.width,
          height: device.keyboardHeight,
        },
      });
  });
}

type Pilot = {
  readonly name: string;
  readonly os: "ios" | "android";
  readonly width: number;
  readonly height: number;
  /** The safe-area inset under the content: the home indicator, or Android's navigation bar. */
  readonly inset: number;
  /** How much of the window the keyboard covers, suggestion bar included: its top edge to the bottom. */
  readonly keyboard: number;
};

/** The D33 families, portrait and landscape. The 17 Pro portrait row is the audit's measured run. */
const PILOT_DEVICES: readonly Pilot[] = [
  { name: "iPhone 17 Pro, portrait", os: "ios", width: 402, height: 874, inset: 34, keyboard: 335 },
  { name: "iPhone SE, portrait", os: "ios", width: 375, height: 667, inset: 0, keyboard: 260 },
  {
    name: "iPhone 17 Pro, landscape",
    os: "ios",
    width: 874,
    height: 402,
    inset: 21,
    keyboard: 220,
  },
  {
    name: "Android phone, portrait",
    os: "android",
    width: 412,
    height: 915,
    inset: 24,
    keyboard: 320,
  },
  {
    name: "Android phone, landscape",
    os: "android",
    width: 915,
    height: 412,
    inset: 24,
    keyboard: 200,
  },
  { name: "iPad, portrait", os: "ios", width: 834, height: 1194, inset: 20, keyboard: 350 },
  { name: "iPad, landscape", os: "ios", width: 1194, height: 834, inset: 20, keyboard: 380 },
  {
    name: "Samsung Galaxy tablet, portrait",
    os: "android",
    width: 800,
    height: 1280,
    inset: 24,
    keyboard: 400,
  },
  {
    name: "Samsung Galaxy tablet, landscape",
    os: "android",
    width: 1280,
    height: 800,
    inset: 24,
    keyboard: 360,
  },
];

function use(pilot: Pilot) {
  device.os = pilot.os;
  device.window = { width: pilot.width, height: pilot.height };
  device.bottomInset = pilot.inset;
  device.keyboardSize = pilot.os === "ios" ? pilot.keyboard : pilot.keyboard - pilot.inset;
}

beforeEach(() => {
  device.mapMounts = 0;
  device.mapUnmounts = 0;
  device.listeners.clear();
  device.keyboardHeight = 0;
  device.keyboardSize = 0;
});

describe("the answer field and Continue end above the keyboard (audit C01)", () => {
  for (const pilot of PILOT_DEVICES) {
    it(`${pilot.name}: the panel's bottom edge meets the keyboard's top edge`, async () => {
      use(pilot);
      const kbTop = pilot.height - pilot.keyboard;
      const screen = open();
      const resting = lift(screen, "Continue");
      expect(screen.controls()).toContain("Back");

      await keyboard(true);

      const raised = lift(screen, "Continue") - resting;
      const panelBottom = pilot.height - pilot.inset - raised;
      // Frames, not visibility: maxY of the panel is at or above the keyboard's minY, and not higher.
      expect(panelBottom).toBeLessThanOrEqual(kbTop);
      expect(panelBottom).toBeGreaterThanOrEqual(kbTop - 0.5);

      await keyboard(false);
      expect(lift(screen, "Continue")).toBe(resting);
    });
  }
});

describe("the map stays mounted and its slot changes size instantly, never by animation", () => {
  it("a phone in portrait shuts the map slot to zero height by style while the keyboard is up", async () => {
    use(PILOT_DEVICES[0] as Pilot);
    const screen = open();
    const resting = styleOf(byTestID(screen, "collect-map-slot"));
    expect(resting.height).toBe("46%");

    await keyboard(true);
    const shut = styleOf(byTestID(screen, "collect-map-slot"));
    expect(shut.height).toBe(0);
    expect(shut.padding).toBe(0);
    expect(shut.overflow).toBe("hidden");

    await keyboard(false);
    expect(styleOf(byTestID(screen, "collect-map-slot")).height).toBe("46%");
  });

  it("never unmounts the map and never hides it with display: none, which unmounts on Fabric", async () => {
    use(PILOT_DEVICES[0] as Pilot);
    const screen = open();
    expect(device.mapMounts).toBe(1);
    await keyboard(true);
    for (const node of [
      byTestID(screen, "collect-map"),
      ...ancestors(byTestID(screen, "collect-map")),
    ])
      expect(styleOf(node).display).not.toBe("none");
    await keyboard(false);
    await keyboard(true);
    await keyboard(false);
    expect(device.mapMounts).toBe(1);
    expect(device.mapUnmounts).toBe(0);
  });

  it("keeps the map at the size it had while the slot is shut, so the GL view is never resized", async () => {
    use(PILOT_DEVICES[0] as Pilot);
    const screen = open();
    const frame = byTestID(screen, "collect-map-frame");
    // The slot reports the height the map had when the keyboard rose: 292 pt of a 874 pt window.
    await act(async () => {
      (frame.props as { onLayout: (event: unknown) => void }).onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 378, height: 292 } },
      });
    });
    await keyboard(true);
    expect(styleOf(byTestID(screen, "collect-map-slot")).height).toBe(0);
    const kept = styleOf(byTestID(screen, "collect-map-frame"));
    expect(kept.position).toBe("absolute");
    expect(kept.height).toBe(292);
  });

  it("a tablet in portrait shuts the slot too: there is no room for map, panel and keyboard", async () => {
    use(PILOT_DEVICES[5] as Pilot);
    const screen = open();
    await keyboard(true);
    expect(styleOf(byTestID(screen, "collect-map-slot")).height).toBe(0);
  });

  it("leaves the map slot alone in landscape, where the panel has its own column", async () => {
    use(PILOT_DEVICES[6] as Pilot);
    const screen = open();
    await keyboard(true);
    expect(styleOf(byTestID(screen, "collect-map-slot")).height).toBeUndefined();
    expect(device.mapMounts).toBe(1);
  });
});

describe("what hides while the keyboard is up", () => {
  const SAYS_STATUS = "on device";

  it("a phone in portrait hides the status row and keeps the header, the strip and the links", async () => {
    use(PILOT_DEVICES[0] as Pilot);
    const screen = open();
    expect(screen.says(SAYS_STATUS)).toBe(true);
    await keyboard(true);
    expect(screen.says(SAYS_STATUS)).toBe(false);
    expect(screen.controls()).toContain("Leave collecting");
    expect(screen.controls()).toContain("Review answers");
    await keyboard(false);
    expect(screen.says(SAYS_STATUS)).toBe(true);
  });

  it("a phone in landscape also hides the header, the mode strip and the links row", async () => {
    use(PILOT_DEVICES[2] as Pilot);
    const screen = open();
    expect(screen.controls()).toContain("Leave collecting");
    expect(screen.controls()).toContain("Review answers");
    await keyboard(true);
    expect(screen.says(SAYS_STATUS)).toBe(false);
    expect(screen.controls()).not.toContain("Leave collecting");
    expect(screen.controls()).not.toContain("Review answers");
    expect(screen.controls()).not.toContain("Place");
    // Back and Continue stay: they are what the observer needs next.
    expect(screen.controls()).toContain("Back");
    expect(screen.controls()).toContain("Continue");
    await keyboard(false);
    expect(screen.controls()).toContain("Leave collecting");
    expect(screen.controls()).toContain("Review answers");
  });

  it("a tablet in landscape has room for all of it", async () => {
    use(PILOT_DEVICES[6] as Pilot);
    const screen = open();
    await keyboard(true);
    expect(screen.says(SAYS_STATUS)).toBe(true);
    expect(screen.controls()).toContain("Leave collecting");
    expect(screen.controls()).toContain("Review answers");
  });
});

describe("no component of Collect avoids the keyboard by stock KeyboardAvoidingView", () => {
  it("renders none, so React Native's parent-relative frame and its LayoutAnimation never apply", async () => {
    for (const os of ["ios", "android"] as const) {
      use({ ...(PILOT_DEVICES[0] as Pilot), os });
      const screen = open();
      await keyboard(true);
      const stock = screen.renderer.root.findAll((node) =>
        isHostNamed(node, "KeyboardAvoidingView"),
      );
      expect(stock).toHaveLength(0);
    }
  });
});

describe("the numbers this relies on come from the installed React Native (0.86.3)", () => {
  const root = new URL("../../../node_modules/react-native/", import.meta.url);
  const read = (path: string) => readFileSync(new URL(path, root), "utf8");

  it("Android reports the keyboard's height without the system bars, so the lift is the height itself", () => {
    expect(read("ReactAndroid/src/main/java/com/facebook/react/ReactRootView.java")).toContain(
      "int height = imeInsets.bottom - barInsets.bottom;",
    );
  });

  it("the stock KeyboardAvoidingView animates every frame that changes with its padding, the map's included", () => {
    const source = read("Libraries/Components/Keyboard/KeyboardAvoidingView.js");
    expect(source).toContain("LayoutAnimation.configureNext({");
    // and it compares a parent-relative frame with a window coordinate (audit C01).
    expect(source).toContain("return Math.max(frame.y + frame.height - keyboardY, 0);");
    expect(source).toContain("this._frame = event.nativeEvent.layout;");
  });
});
