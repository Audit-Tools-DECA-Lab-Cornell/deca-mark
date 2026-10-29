import { readFileSync } from "node:fs";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TabsLayout from "../../../app/(app)/(tabs)/_layout";
import ObservationsTab from "../../../app/(app)/(tabs)/observations/index";
import { takeNavigation } from "../../ui/native.fixture";
import { PreferencesProvider } from "../../ui/preferences";
import { TabDock } from "../../ui/TabDock";
import { ThemeProvider } from "../../ui/theme";
import { record, resetWorld, tabScreens, tabsBar, world } from "./observations.fixture";
import { insideTabs, realRouteTree } from "./route-tree.fixture";

vi.mock("react-native", async () => (await import("./observations.fixture")).nativeWithList);
vi.mock("expo-router", async () => (await import("./observations.fixture")).routerWithRedirect);
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
vi.mock("../preview/data-source", async () => (await import("./observations.fixture")).dataSource);
vi.mock("../../sync/provider", async () => (await import("./observations.fixture")).sync);
vi.mock("../../ui/OnlineIndicator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ui/OnlineIndicator")>()),
  useOnline: () => world.online,
}));
vi.mock("../../data/api/me-provider", () => ({
  useMe: () => ({ profile: { display_name: "Mobile Observer", observer_initials: "MO" } }),
}));
vi.mock("../auth/profile-store", () => ({
  useProfile: () => ({ saved: true, name: "Mobile Observer", initials: "MO", pending: false }),
}));
vi.mock("../auth/ResumeUploadsNote", () => ({ ResumeUploadsNote: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * MOB-38, the router-level proof that tapping Observations keeps the dock.
 *
 * `renderRouter` from expo-router's testing library cannot load here (it needs Jest's globals and
 * `@testing-library/react-native`; this package runs Vitest and installs neither), so this is the
 * closest real router test: the app's real route tree, built from the real file names by expo-router's
 * own route builder (`route-tree.fixture.ts`), and the real screens mounted over stand-ins for the
 * native modules. It cannot show what the tab navigator draws; the device check does that.
 */

const tree = realRouteTree();

beforeEach(() => {
  resetWorld();
  takeNavigation();
  tabScreens.length = 0;
  tabsBar.current = null;
});

function mount(element: ReturnType<typeof createElement>) {
  act(() => {
    create(
      <PreferencesProvider>
        <ThemeProvider>{element}</ThemeProvider>
      </PreferencesProvider>,
    );
  });
}

describe("the Observations tab sits inside the tab navigator that draws the dock", () => {
  it("is a route of (app) > (tabs), the same navigator as Projects and Account", () => {
    expect(tree.resolve("/observations")?.chain).toEqual([
      "(app)",
      "(tabs)",
      "observations",
      "index",
    ]);
    expect(insideTabs(tree.resolve("/"))).toBe(true);
    expect(insideTabs(tree.resolve("/account"))).toBe(true);
  });

  it("is a tab of the layout whose tab bar is the dock", () => {
    mount(createElement(TabsLayout));
    expect(tabScreens).toEqual(["(projects)", "observations", "account"]);
    const bar = (tabsBar.current as (props: object) => { type: unknown })({});
    expect(bar.type).toBe(TabDock);
  });

  it("goes nowhere when it opens: whatever it navigates to is still inside (tabs)", () => {
    world.records = [record("a1", "onDevice")];
    mount(createElement(ObservationsTab));
    const moves = [...world.redirects, ...takeNavigation()];
    for (const href of moves) {
      expect(insideTabs(tree.resolve(href)), `opening Observations went to ${href}`).toBe(true);
    }
  });
});

describe("no second, legacy records screen is left outside the tabs", () => {
  it("has no root route that is not an app group, a layout screen or the not-found page", () => {
    const outside = tree.routes.filter((route) => !insideTabs(route));
    const names = outside.map((route) => route.chain.join(" > ")).sort();
    expect(names.filter((name) => !name.includes(" > "))).toEqual(["+not-found"]);
  });

  it("has no /records route and no records.tsx", () => {
    expect(tree.resolve("/records")).toBeNull();
    expect(tree.files).not.toContain("./records.tsx");
  });

  it("declares in the root layout only routes that exist", () => {
    const layout = readFileSync(new URL("../../../app/_layout.tsx", import.meta.url), "utf8");
    const declared = [...layout.matchAll(/<Stack\.Screen name="([^"]+)"/g)].map((match) => match[1]);
    const topLevel = new Set(tree.routes.map((route) => route.chain[0]));
    for (const name of declared) expect(topLevel.has(name ?? ""), `${name} has no route`).toBe(true);
  });
});
