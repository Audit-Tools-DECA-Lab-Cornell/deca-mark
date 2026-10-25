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
import { PreferencesProvider } from "../../ui/preferences";
import { render, type Screen } from "../../ui/screen.fixture";
import { ThemeProvider } from "../../ui/theme";
import { CollectScreen } from "./CollectScreen";

/**
 * MOB-35 (audit C21) shares this harness: rotating the device re-arranges one tree and never remounts
 * the map or the step panel. See the last describe block.
 *
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
  measureMap(screen);
  return screen;
}

/** The stacked layout reports the map frame's height once it is laid out; side by side has no frame. */
function measureMap(screen: Screen, height = 292) {
  const [frame] = screen.renderer.root.findAll(
    (node) => isHost(node) && (node.props as { testID?: string }).testID === "collect-map-frame",
  );
  if (!frame) return;
  act(() => {
    (frame.props as { onLayout: (event: unknown) => void }).onLayout({
      nativeEvent: { layout: { x: 0, y: 0, width: 378, height } },
    });
  });
}

/** Collect with the keyboard already up when it mounts, before the map has been laid out. */
function openWithKeyboardUp(session: FieldSessionValue = sessionAtSummary()): Screen {
  device.keyboardHeight = device.keyboardSize;
  return render(
    <FieldSessionContext.Provider value={session}>
      <CollectScreen />
    </FieldSessionContext.Provider>,
  );
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

describe("arriving with the keyboard already up", () => {
  it("leaves the slot open until the map has been measured, so the GL view never mounts at height 0", async () => {
    use(PILOT_DEVICES[0] as Pilot);
    const screen = openWithKeyboardUp();
    expect(styleOf(byTestID(screen, "collect-map-slot")).height).toBe("46%");
    expect(styleOf(byTestID(screen, "collect-map-frame")).position).not.toBe("absolute");
    expect(styleOf(byTestID(screen, "collect-map-frame")).height).toBeUndefined();
    measureMap(screen);
    expect(styleOf(byTestID(screen, "collect-map-slot")).height).toBe(0);
    expect(styleOf(byTestID(screen, "collect-map-frame")).height).toBe(292);
    expect(device.mapMounts).toBe(1);
    expect(device.mapUnmounts).toBe(0);
  });

  it("does not shut the map on the Place step, which has no field to type in", () => {
    use(PILOT_DEVICES[0] as Pilot);
    const screen = openWithKeyboardUp({ ...sessionAtSummary(), placed: null, inProgress: null });
    measureMap(screen);
    expect(styleOf(byTestID(screen, "collect-map-slot")).height).toBe("46%");
    expect(screen.says("on device")).toBe(true);
  });

  it("keeps the header on the Place step of a phone in landscape", () => {
    use(PILOT_DEVICES[2] as Pilot);
    const screen = openWithKeyboardUp({ ...sessionAtSummary(), placed: null, inProgress: null });
    expect(screen.controls()).toContain("Leave collecting");
  });
});

describe("the text field in a short scrolling area (audit C01, review round 1)", () => {
  /** The minimum height the answer field is drawn at: its padding and its rows. */
  const fieldHeight = (screen: Screen) => {
    const field = screen.renderer.root.find(
      (node) =>
        isHostNamed(node, "TextInput") &&
        (node.props as { accessibilityLabel?: string }).accessibilityLabel ===
          "Describe the play event",
    );
    const { minHeight } = styleOf(field) as { minHeight?: number };
    return minHeight;
  };
  const counter = (screen: Screen) => screen.texts().some((text) => /\d+ \/ 1000/.test(text));

  it("shows four rows and the counter at rest, and on a phone in portrait with the keyboard up", async () => {
    use(PILOT_DEVICES[0] as Pilot);
    const screen = open();
    expect(fieldHeight(screen)).toBe(120);
    expect(counter(screen)).toBe(true);
    await keyboard(true);
    expect(fieldHeight(screen)).toBe(120);
    expect(counter(screen)).toBe(true);
  });

  it("shows two rows and no counter on a phone in landscape with the keyboard up, so the first line has room", async () => {
    for (const pilot of [PILOT_DEVICES[2], PILOT_DEVICES[4]] as Pilot[]) {
      use(pilot);
      const screen = open();
      expect(fieldHeight(screen)).toBe(120);
      await keyboard(true);
      // 16 + 16 padding and two 22 pt lines: 76 pt, which fits the 81 to 89 pt a landscape phone leaves.
      expect(fieldHeight(screen)).toBe(76);
      expect(counter(screen)).toBe(false);
      await keyboard(false);
      expect(fieldHeight(screen)).toBe(120);
      expect(counter(screen)).toBe(true);
    }
  });

  it("keeps four rows on a tablet in landscape, which has room", async () => {
    use(PILOT_DEVICES[6] as Pilot);
    const screen = open();
    await keyboard(true);
    expect(fieldHeight(screen)).toBe(120);
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

/** Turns the device: the window changes size and the screen renders again, as a rotation does. */
function rotate(screen: Screen, session: FieldSessionValue) {
  const { width, height } = device.window;
  device.window = { width: height, height: width };
  act(() => {
    screen.renderer.update(
      <PreferencesProvider>
        <ThemeProvider>
          <FieldSessionContext.Provider value={session}>
            <CollectScreen />
          </FieldSessionContext.Provider>
        </ThemeProvider>
      </PreferencesProvider>,
    );
  });
}

/**
 * The rendered instance behind a host node: the same object for as long as the node stays mounted, a
 * new one when React unmounts and mounts it again. The test renderer keeps it on the fiber, which is
 * how a component test sees "mounted again" without a layout engine.
 */
function instanceOf(node: ReactTestInstance): object {
  const { stateNode } = (node as unknown as { _fiber: { stateNode: object | null } })._fiber;
  if (!stateNode) throw new Error("The node has no rendered instance.");
  return stateNode;
}

const answerField = (screen: Screen) =>
  screen.renderer.root.find(
    (node) =>
      isHostNamed(node, "TextInput") &&
      (node.props as { accessibilityLabel?: string }).accessibilityLabel ===
        "Describe the play event",
  );

describe("rotating keeps the field map and the step mounted (audit C21)", () => {
  const TABLETS = [PILOT_DEVICES[5], PILOT_DEVICES[7]] as Pilot[];
  const PHONES = [PILOT_DEVICES[0], PILOT_DEVICES[4]] as Pilot[];

  for (const pilot of [...TABLETS, ...PHONES]) {
    it(`${pilot.name}: Answer keeps the map, the panel and the typed answer through a rotation and back`, () => {
      use(pilot);
      const session = sessionAtSummary();
      const screen = open();
      const map = instanceOf(byTestID(screen, "collect-map"));
      const panel = instanceOf(byTestID(screen, "collect-panel"));
      const field = instanceOf(answerField(screen));
      expect(device.mapMounts).toBe(1);

      rotate(screen, session);
      expect(device.mapMounts).toBe(1);
      expect(device.mapUnmounts).toBe(0);
      expect(instanceOf(byTestID(screen, "collect-map")) === map).toBe(true);
      expect(instanceOf(byTestID(screen, "collect-panel")) === panel).toBe(true);
      expect(instanceOf(answerField(screen)) === field).toBe(true);
      expect((answerField(screen).props as { value?: string }).value).toBe("Two children dig.");

      rotate(screen, session);
      expect(device.mapMounts).toBe(1);
      expect(device.mapUnmounts).toBe(0);
      expect(instanceOf(byTestID(screen, "collect-map")) === map).toBe(true);
      expect(instanceOf(answerField(screen)) === field).toBe(true);
      expect((answerField(screen).props as { value?: string }).value).toBe("Two children dig.");
    });

    it(`${pilot.name}: Place keeps the map and the panel through a rotation`, () => {
      use(pilot);
      const session = { ...sessionAtSummary(), placed: null, inProgress: null };
      const screen = render(
        <FieldSessionContext.Provider value={session}>
          <CollectScreen />
        </FieldSessionContext.Provider>,
      );
      const map = instanceOf(byTestID(screen, "collect-map"));
      const panel = instanceOf(byTestID(screen, "collect-panel"));
      expect(screen.controls()).toContain("Place point here");

      rotate(screen, session);
      expect(device.mapMounts).toBe(1);
      expect(device.mapUnmounts).toBe(0);
      expect(instanceOf(byTestID(screen, "collect-map")) === map).toBe(true);
      expect(instanceOf(byTestID(screen, "collect-panel")) === panel).toBe(true);
      expect(screen.controls()).toContain("Place point here");
    });
  }

  it("arranges the same tree by style: side by side in landscape, stacked in portrait", () => {
    use(PILOT_DEVICES[5] as Pilot);
    const session = sessionAtSummary();
    const screen = open();
    const slot = () => styleOf(byTestID(screen, "collect-map-slot"));
    const panelStyle = () => styleOf(byTestID(screen, "collect-panel"));
    expect(slot().height).toBe("46%");
    expect(panelStyle().width).toBeUndefined();
    rotate(screen, session);
    expect(slot().height).toBeUndefined();
    expect(panelStyle().width).toBeGreaterThan(0);
    rotate(screen, session);
    expect(slot().height).toBe("46%");
    expect(panelStyle().width).toBeUndefined();
  });

  it("a rotation with the keyboard up shuts or opens the slot without remounting the map", async () => {
    use(PILOT_DEVICES[0] as Pilot);
    const session = sessionAtSummary();
    const screen = open();
    await keyboard(true);
    expect(styleOf(byTestID(screen, "collect-map-slot")).height).toBe(0);
    rotate(screen, session);
    expect(styleOf(byTestID(screen, "collect-map-slot")).height).toBeUndefined();
    rotate(screen, session);
    expect(device.mapMounts).toBe(1);
    expect(device.mapUnmounts).toBe(0);
  });
});
