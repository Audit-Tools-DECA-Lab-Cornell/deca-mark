import { describe, expect, it, vi } from "vitest";
import { shellV1 } from "../../forms/fixtures/shell-v1";
import { startSession } from "../../forms/session";
import { isDisabled, render } from "../../ui/screen.fixture";
import { ReviewStep } from "./ReviewStep";

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

function review(placementBlock: string | null) {
  const onAdjust = vi.fn();
  const onSave = vi.fn(async () => null);
  const screen = render(
    <ReviewStep
      form={shellV1}
      state={startSession()}
      summary="OBS-3F2A1B · North meadow · Standard round · map v3"
      onJump={() => {}}
      onBack={() => {}}
      onSave={onSave}
      onDiscard={() => {}}
      placementBlock={placementBlock}
      onAdjust={onAdjust}
    />,
  );
  return { screen, onAdjust, onSave };
}

describe("ReviewStep's save gate on a map from DECA Mark (MUI-4)", () => {
  it("keeps the record when its point is no longer in its zone, and offers to adjust it", async () => {
    const { screen, onAdjust, onSave } = review(
      "Not saved yet. The point is outside North meadow on map v3. Adjust the point or switch zone. Your answers are kept.",
    );
    expect(screen.says("Not saved yet.")).toBe(true);
    expect(
      screen.says(
        "The point is outside North meadow on map v3. Adjust the point or switch zone. Your answers are kept.",
      ),
    ).toBe(true);
    expect(isDisabled(screen.control("Save on this device"))).toBe(true);
    await screen.press("Save on this device");
    expect(onSave).not.toHaveBeenCalled();
    await screen.press("Adjust point");
    expect(onAdjust).toHaveBeenCalledOnce();
  });

  it("saves when the point is still in its zone", () => {
    const { screen } = review(null);
    expect(screen.says("Not saved yet.")).toBe(false);
    expect(isDisabled(screen.control("Save on this device"))).toBe(false);
    expect(screen.controls()).not.toContain("Adjust point");
  });
});
