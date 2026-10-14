import { describe, expect, it, vi } from "vitest";
import type { Coordinate } from "../../domain/observation";
import type { SiteZone } from "../../maps/sample-site";
import { RadioRows, Segmented } from "../../ui";
import { isDisabled, render } from "../../ui/screen.fixture";
import type { AimStore } from "./aim-store";
import { PlaceStep } from "./PlaceStep";
import { placementState } from "./placement";

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

// The map is not drawn here: the cross's position comes from the test, and the placement state from
// the real geometry (`placementState` over `zoneCovers`), as CollectMap's useAimZone computes it.
const aimed = vi.hoisted(() => ({ point: [0, 0] as [number, number] }));
vi.mock("./CollectMap", async () => {
  const { placementState: state } = await import("./placement");
  return {
    useAimZone: (
      _aim: unknown,
      zones: readonly SiteZone[],
      zone: SiteZone,
      bound: boolean,
      version: number | string,
    ) => ({
      centre: aimed.point,
      zoom: 21,
      moving: false,
      placement: state(aimed.point, zone, zones, bound, version),
      hint: null,
    }),
  };
});

/** A rectangle zone over [west, east] × [south, north], with its full boundary. */
function box(id: string, label: string, west: number, south: number, east: number, north: number) {
  const ring: Coordinate[] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
  const centre: Coordinate = [(west + east) / 2, (south + north) / 2];
  return {
    id,
    zoneId: `zone-${id}`,
    label,
    centre,
    displayAnchor: centre,
    west,
    south,
    east,
    north,
    polygon: [ring],
  } satisfies SiteZone;
}

// North meadow | Slide side by side; Swings below both, sharing their bottom edges; nothing east of Slide.
const meadow = box("NM", "North meadow", 0, 0.001, 0.001, 0.002);
const slide = box("SL", "Slide", 0.001, 0.001, 0.002, 0.002);
const swings = box("SW", "Swings", 0, 0, 0.002, 0.001);
const zones = [meadow, slide, swings];

function place(at: Coordinate, { bound = true, version = 3 as number | string } = {}) {
  aimed.point = [at[0], at[1]];
  const onSwitchZone = vi.fn();
  const onPlace = vi.fn();
  const screen = render(
    <PlaceStep
      aim={{} as AimStore}
      zones={zones}
      zone={meadow}
      bound={bound}
      version={version}
      roundType="standard"
      adjusting={false}
      lastSaved={null}
      onPlace={onPlace}
      onKeep={() => {}}
      onNudge={() => {}}
      onZoomIn={() => {}}
      onSwitchZone={onSwitchZone}
    />,
  );
  return { screen, onSwitchZone, onPlace, place: () => screen.control("Place point here") };
}

describe("PlaceStep on a map from DECA Mark (MUI-3, MUI-4)", () => {
  it("inside the session's zone: says so and places", async () => {
    const { screen, place: button, onPlace } = place([0.0005, 0.0015]);
    expect(placementState([0.0005, 0.0015], meadow, zones, true, 3).kind).toBe("inside");
    expect(screen.says("In North meadow")).toBe(true);
    expect(isDisabled(button())).toBe(false);
    expect(screen.renderer.root.findAllByType(Segmented)).toHaveLength(0);
    await screen.press("Place point here");
    expect(onPlace).toHaveBeenCalledOnce();
  });

  it("on a shared edge: names both zones, keeps the session's zone chosen, and places", async () => {
    const { screen, place: button, onSwitchZone } = place([0.001, 0.0015]);
    expect(screen.says("On the edge of North meadow and Slide")).toBe(true);
    expect(isDisabled(button())).toBe(false);
    const [choice] = screen.renderer.root.findAllByType(Segmented);
    const segmented = choice?.props as Parameters<typeof Segmented>[0];
    expect(segmented.value).toBe("NM");
    expect(segmented.options.map((option) => option.label)).toEqual(["North meadow", "Slide"]);
    await screen.press("Slide");
    expect(onSwitchZone).toHaveBeenCalledWith(slide);
  });

  it("inside another zone: offers the switch, and does not place until the observer acts", async () => {
    const { screen, place: button, onSwitchZone } = place([0.0015, 0.0015]);
    expect(screen.says("Outside North meadow · in Slide")).toBe(true);
    expect(isDisabled(button())).toBe(true);
    expect(screen.says("Switch to Slide or move the ×.")).toBe(true);
    await screen.press("Switch to Slide");
    expect(onSwitchZone).toHaveBeenCalledWith(slide);
  });

  it("between two other zones: asks for one of them in rows, none chosen, and does not place", async () => {
    const { screen, place: button, onSwitchZone } = place([0.0015, 0.001]);
    expect(screen.says("Outside North meadow · on the edge of Slide and Swings")).toBe(true);
    expect(isDisabled(button())).toBe(true);
    expect(screen.says("Choose one of these zones or move the ×.")).toBe(true);
    expect(screen.renderer.root.findAllByType(Segmented)).toHaveLength(0);
    const [rows] = screen.renderer.root.findAllByType(RadioRows);
    expect((rows?.props as Parameters<typeof RadioRows>[0]).value).toBeNull();
    await screen.press("Swings");
    expect(onSwitchZone).toHaveBeenCalledWith(swings);
  });

  it("outside every zone: names the map version and does not place", () => {
    const { screen, place: button } = place([0.003, 0.0015]);
    expect(screen.says("Outside every zone on map v3")).toBe(true);
    expect(isDisabled(button())).toBe(true);
    expect(screen.says("Move the × into a zone.")).toBe(true);
    expect(screen.controls()).not.toContain("Switch to Slide");
  });
});

describe("PlaceStep on the practice map", () => {
  it("places outside the zone, saying where the cross is", () => {
    const { screen, place: button } = place([0.003, 0.0015], { bound: false, version: "practice" });
    expect(screen.says("Outside North meadow")).toBe(true);
    expect(isDisabled(button())).toBe(false);
  });
});
