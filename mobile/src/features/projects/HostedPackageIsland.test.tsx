import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteVersions } from "../../packages/zone-read-models";
import { takeAlerts, takeAnnouncements } from "../../ui/native.fixture";
import { isDisabled, render } from "../../ui/screen.fixture";
import { HostedPackageIsland } from "./HostedPackageIsland";

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

// MOB-33's useSiteVersions, as the island reads it: the test sets the versions and records each call.
const data = vi.hoisted(() => ({
  versions: null as unknown,
  removed: true,
  calls: [] as string[],
}));
vi.mock("../../packages/zone-read-models", () => ({
  useSiteVersions: () => ({
    ...(data.versions as object),
    referencesProblem: null,
    downloadPackage: async (id: string) => {
      data.calls.push(`download ${id}`);
    },
    cancelDownload: (id: string) => {
      data.calls.push(`cancel ${id}`);
    },
    refresh: async () => {
      data.calls.push("refresh");
    },
    remove: async (id: string) => {
      data.calls.push(`remove ${id}`);
      return { removed: data.removed };
    },
  }),
}));

const MB = 1024 * 1024;
const none = { unfinished: 0, unsent: 0, attention: 0, retained: 0, openSession: false };

function installed(version: number, references = none) {
  return {
    packageId: `pkg-v${version}`,
    version,
    status: "verified" as const,
    bytes: 11 * MB,
    installedAt: "2026-10-10T09:00:00Z",
    references,
  };
}

function island(versions: SiteVersions) {
  data.versions = versions;
  const onSetUp = vi.fn();
  const screen = render(
    <HostedPackageIsland
      siteId="site-1"
      siteName="Fall Creek"
      opening={false}
      problem={null}
      onSetUp={onSetUp}
    />,
  );
  return { screen, onSetUp };
}

beforeEach(() => {
  data.removed = true;
  data.calls = [];
  takeAlerts();
  takeAnnouncements();
});

describe("a hosted site's maps (UI plan 4.2, MUI-6, MUI-10)", () => {
  it("map v1 installed and v2 published: v1 stays the next session's map, v2 downloads beside it", async () => {
    const { screen, onSetUp } = island({
      available: { packageId: "pkg-v2", version: 2, archiveBytes: 12 * MB },
      installed: [installed(1)],
      nextSessionPackageId: "pkg-v1",
      lastCheckedAt: null,
      refreshProblem: null,
      download: null,
    });
    expect(screen.says("Map package v1")).toBe(true);
    expect(screen.says("A newer map is available.")).toBe(true);
    expect(
      screen.says(
        "Map v2 is available. Download it now to use it from your next session. Your unfinished and saved observations keep map v1.",
      ),
    ).toBe(true);
    await screen.press("Set up this session");
    expect(onSetUp).toHaveBeenCalledWith("pkg-v1");
    await screen.press("Download v2 · 12.0 MB");
    expect(data.calls).toEqual(["download pkg-v2"]);
  });

  it("shows a download part by part, with the installed map still ready", () => {
    const { screen } = island({
      available: { packageId: "pkg-v2", version: 2, archiveBytes: 12 * MB },
      installed: [installed(1)],
      nextSessionPackageId: "pkg-v1",
      lastCheckedAt: null,
      refreshProblem: null,
      download: { packageId: "pkg-v2", part: 1, state: "running" },
    });
    expect(screen.says("Downloading · part 2 of 4")).toBe(true);
    expect(screen.controls()).toContain("Cancel download");
    expect(screen.controls()).not.toContain("Download v2 · 12.0 MB");
    expect(isDisabled(screen.control("Set up this session"))).toBe(false);
  });

  it("refuses to remove a map something still uses, and says what uses it", () => {
    const { screen } = island({
      available: { packageId: "pkg-v2", version: 2, archiveBytes: 12 * MB },
      installed: [installed(2), installed(1, { ...none, unfinished: 1, unsent: 3 })],
      nextSessionPackageId: "pkg-v2",
      lastCheckedAt: null,
      refreshProblem: null,
      download: null,
    });
    expect(screen.says("Older maps on this device")).toBe(true);
    expect(isDisabled(screen.control("Remove map v1"))).toBe(true);
    expect(screen.says("Used by 1 unfinished observation and 3 records not uploaded yet.")).toBe(
      true,
    );
    expect(isDisabled(screen.control("Remove map v2"))).toBe(false);
  });

  it("asks before removing, and says so when the data layer finds a use at the last moment", async () => {
    data.removed = false;
    const { screen } = island({
      available: { packageId: "pkg-v2", version: 2, archiveBytes: 12 * MB },
      installed: [installed(2), installed(1)],
      nextSessionPackageId: "pkg-v2",
      lastCheckedAt: null,
      refreshProblem: null,
      download: null,
    });
    await screen.press("Remove map v1");
    const [alert] = takeAlerts();
    expect(alert?.title).toBe("Remove Fall Creek map v1 from this device?");
    expect(data.calls).toEqual([]);
    await alert?.buttons?.find((button) => button.text === "Remove map")?.onPress?.();
    await vi.waitFor(() => {
      expect(screen.says("Map v1 was not removed: something on this device still uses it.")).toBe(
        true,
      );
    });
    expect(data.calls).toEqual(["remove pkg-v1"]);
  });
});
