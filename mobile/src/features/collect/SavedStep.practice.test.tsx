import { describe, expect, it, vi } from "vitest";
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

/** MOB-37: Saved says what the uploader does with a practice record, in the contract's words. */

const save: SessionSave = {
  id: "OBS-3F2A1B",
  zoneId: "A",
  zoneLabel: "Zone A · West lawn",
  roundType: "standard",
  savedAt: "2026-10-24T10:00:00.000Z",
  heldOnly: false,
};

function show(overrides: Partial<SessionSave>) {
  return render(
    <SavedStep
      save={{ ...save, ...overrides }}
      nextZone={null}
      formVersion="janet-test-v1"
      mapVersion="map v3"
      onNext={() => {}}
      onInventoryZone={() => {}}
      onChangeRound={() => {}}
      onRecords={() => {}}
    />,
  );
}

describe("Saved, upload line", () => {
  it("calls a record that cannot upload a practice record that stays here", () => {
    const screen = show({ heldOnly: true });
    expect(screen.says("Practice record: stays on this device and is never uploaded")).toBe(true);
    expect(screen.says("Held")).toBe(false);
    expect(screen.says("is not published to the server yet")).toBe(false);
  });

  it("says a bound record uploads by itself", () => {
    const screen = show({ heldOnly: false });
    expect(screen.says("Uploads by itself whenever the app is open and online")).toBe(true);
    expect(screen.says("Practice record")).toBe(false);
  });
});
