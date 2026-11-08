import { describe, expect, it, vi } from "vitest";
import { CollectorVersionError, UNREADABLE_VERSION_MESSAGE } from "../storage/database-migrations";
import { ScreenFailure } from "./ScreenFailure";
import { render } from "./screen.fixture";

vi.mock("react-native", async () => (await import("./native.fixture")).reactNative);
vi.mock("react-native-reanimated", async () => (await import("./native.fixture")).reanimated);
vi.mock("expo-sqlite/kv-store", async () => (await import("./native.fixture")).kvStore);
vi.mock("expo-haptics", async () => (await import("./native.fixture")).haptics);
vi.mock("./Icon", async () => (await import("./native.fixture")).icon);
vi.mock("./fonts", async () => (await import("./native.fixture")).fonts);
vi.mock("react-native-svg", async () => (await import("./native.fixture")).svg);
vi.mock("react-native-safe-area-context", async () => (await import("./native.fixture")).safeArea);
vi.mock("expo-status-bar", async () => (await import("./native.fixture")).statusBar);
vi.mock("expo-router", async () => (await import("./native.fixture")).router);

describe("what the root error screen says when collection cannot start", () => {
  it("shows the version sentence, exactly, with no retry", () => {
    const screen = render(<ScreenFailure error={new CollectorVersionError()} retry={() => {}} />);
    expect(screen.texts()).toContain(
      "This version cannot read the records on this device. Update DECA Mark; nothing was deleted.",
    );
    expect(screen.texts()).toContain("Update DECA Mark");
    expect(screen.says("point and answers")).toBe(false);
    expect(screen.controls()).toEqual([]);
    expect(UNREADABLE_VERSION_MESSAGE).toBe(new CollectorVersionError().message);
  });

  it("keeps the old words and Try again for any other failure", async () => {
    const retry = vi.fn();
    const screen = render(<ScreenFailure error={new Error("disk full")} retry={retry} />);
    expect(
      screen.says(
        "The screen could not load, but the point and answers you entered are kept. disk full",
      ),
    ).toBe(true);
    await screen.press("Try again");
    expect(retry).toHaveBeenCalledOnce();
  });
});
