import type { ReactTestInstance } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { siteZones } from "../../maps/sample-site";
import type { SessionSave } from "../../session/provider";
import { render } from "../../ui/screen.fixture";
import { SavedStep } from "./SavedStep";

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

/** MOB-34: Saved's forward action is pinned, so a phone's short panel never hides it. */

const save: SessionSave = {
  id: "OBS-3F2A1B",
  zoneId: "A",
  zoneLabel: "Zone A · West lawn",
  roundType: "standard",
  savedAt: "2026-10-24T10:00:00.000Z",
  heldOnly: false,
};

function show(
  overrides: Partial<SessionSave> = {},
  nextZone: (typeof siteZones)[number] | null = null,
) {
  return render(
    <SavedStep
      save={{ ...save, ...overrides }}
      nextZone={nextZone}
      formVersion="janet-test-v1"
      mapVersion="map v3"
      onNext={() => {}}
      onInventoryZone={() => {}}
      onChangeRound={() => {}}
      onRecords={() => {}}
    />,
  );
}

const scrolls = (node: ReactTestInstance) => {
  for (let parent = node.parent; parent; parent = parent.parent)
    if ((parent.type as unknown) === "ScrollView") return true;
  return false;
};

describe("Saved pins its forward action outside the scrolling card", () => {
  it("pins 'Place the next observation' and scrolls the card and the quieter links", () => {
    const screen = show();
    expect(scrolls(screen.control("Place the next observation"))).toBe(false);
    expect(scrolls(screen.control("Change zone or round"))).toBe(true);
    expect(scrolls(screen.control("Records on this device"))).toBe(true);
    expect(screen.says("Saved on this device")).toBe(true);
  });

  it("pins the inventory's next zone", () => {
    const next = siteZones[1];
    if (!next) throw new Error("The practice site has fewer than two zones.");
    const screen = show({ roundType: "inventory" }, next);
    const label = screen.controls().find((entry) => entry.startsWith("Inventory "));
    expect(label).toBeDefined();
    expect(scrolls(screen.control(label ?? ""))).toBe(false);
  });

  it("pins 'Finish the inventory round' when every zone is done", () => {
    const screen = show({ roundType: "inventory" }, null);
    expect(scrolls(screen.control("Finish the inventory round"))).toBe(false);
  });
});
