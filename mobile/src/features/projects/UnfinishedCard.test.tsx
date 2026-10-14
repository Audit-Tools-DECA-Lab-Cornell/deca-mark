import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recovered } from "../../packages/zone-read-models";
import { takeAlerts, takeAnnouncements, takeNavigation } from "../../ui/native.fixture";
import { isDisabled, render } from "../../ui/screen.fixture";
import { ParkedDrafts, UnfinishedCard, useUnfinished } from "./UnfinishedCard";

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

// The data layer's MOB-33 hooks, as the cards read them: the test sets the drafts and records each call.
const data = vi.hoisted(() => ({
  online: null as boolean | null,
  active: null as unknown,
  parked: [] as unknown[],
  occupied: false,
  inProgress: null as unknown,
  /** What the session's restoreParked does: reopen the draft, leave it kept, or fail. */
  restore: "reopens" as "reopens" | "keeps" | "throws",
  /** A practice draft recovered after a restart: it ships with the app, so it has no binding. */
  unbound: null as unknown,
  /** The hosted downloads by site, as the data layer keeps their failures. */
  downloads: {} as Record<string, unknown>,
  calls: [] as string[],
}));
vi.mock("../../packages/hosted/context", () => ({
  useHostedSites: () => ({
    sites: {},
    installed: [],
    errors: {},
    revision: 0,
    downloads: data.downloads,
  }),
}));
vi.mock("../../ui/OnlineIndicator", () => ({
  OnlineIndicator: () => null,
  useOnline: () => data.online,
}));
vi.mock("../../packages/zone-read-models", () => ({
  useRecoveredDraft: () => ({
    active: data.active,
    parked: data.parked,
    unreadable: [],
    problem: null,
    resume: async () => {
      data.calls.push("resume");
      return true;
    },
    park: async () => {
      data.calls.push("park");
    },
    restoreParked: async (id: string) => {
      data.calls.push(`restoreParked ${id}`);
      if (data.restore === "throws") throw new Error("The package could not be opened.");
      if (data.restore === "reopens") data.inProgress = { packageId: "pkg-v1" };
    },
    discard: async () => {
      data.calls.push("discard");
    },
    discardParked: async (id: string) => {
      data.calls.push(`discardParked ${id}`);
    },
    redownload: async (id: string) => {
      data.calls.push(`redownload ${id}`);
    },
  }),
}));
vi.mock("../../session/provider", () => ({
  useFieldSession: () => ({
    recovered: data.unbound ?? (data.occupied ? { id: "draft-1", binding: {} } : null),
    inProgress: data.inProgress,
    parked: [],
    state: { answers: {} },
    resumeRecovered: async () => {
      data.calls.push("session resume");
      return true;
    },
    discardRecovered: async () => {
      data.calls.push("session discard");
    },
  }),
}));
vi.mock("../preview/data-source", () => ({ useDataSource: () => ({ mode: "device" }) }));

const MB = 1024 * 1024;

function draft(status: Recovered["status"], overrides: Partial<Recovered> = {}): Recovered {
  return {
    draftId: "draft-1",
    formVersion: "janet-test-v1",
    pinned: {
      packageId: "pkg-v1",
      version: 1,
      siteId: "site-1",
      zone: { id: "zone-nm", code: "NM", label: "North meadow" },
    },
    placed: true,
    answered: 3,
    asked: 8,
    status,
    parked: false,
    redownload: { possible: true, bytes: 12 * MB },
    ...overrides,
  };
}

function card(model: Recovered) {
  data.active = model;
  return render(<UnfinishedCard unfinished={{ kind: "recovered", model, problem: null }} />);
}

beforeEach(() => {
  data.online = null;
  data.active = null;
  data.parked = [];
  data.occupied = false;
  data.inProgress = null;
  data.restore = "reopens";
  data.unbound = null;
  data.downloads = {};
  data.calls = [];
  takeAlerts();
  takeAnnouncements();
  takeNavigation();
});

describe("an unfinished observation after a restart (MUI-7)", () => {
  it("ready: resumes on its own map and zone", async () => {
    const screen = card(draft("ready"));
    expect(screen.says("North meadow · map v1")).toBe(true);
    expect(screen.says("Point placed, 3 of 8 answered.")).toBe(true);
    expect(screen.controls()).toEqual(["Resume", "Discard draft"]);
    await screen.press("Resume");
    expect(data.calls).toEqual(["resume"]);
    expect(takeNavigation()).toEqual(["/collect"]);
  });

  it("package missing: offers that same map again, or keeping it for later", async () => {
    const screen = card(draft("package_missing"));
    expect(screen.says("Map v1 is not on this device. Your point and answers are kept.")).toBe(
      true,
    );
    expect(screen.controls()).toEqual([
      "Download map v1 again · 12.0 MB",
      "Keep for later",
      "Discard draft",
    ]);
    await screen.press("Download map v1 again · 12.0 MB");
    await screen.press("Keep for later");
    expect(data.calls).toEqual(["redownload draft-1", "park"]);
    expect(takeAnnouncements()).toContain("Kept for later. You can start collecting again.");
  });

  it("package missing and offline: says to connect, with no download to press", () => {
    data.online = false;
    const screen = card(draft("package_missing"));
    expect(screen.says("Connect to download map v1 again.")).toBe(true);
    expect(screen.controls()).toEqual(["Keep for later", "Discard draft"]);
  });

  it("package unavailable: keeps it for the coordinator", () => {
    const screen = card(
      draft("package_unavailable", { redownload: { possible: false, bytes: null } }),
    );
    expect(
      screen.says(
        "Map v1 cannot be downloaded with your current access. Your point and answers stay on this device. Ask your coordinator.",
      ),
    ).toBe(true);
    expect(screen.controls()).toEqual(["Keep for your coordinator", "Discard draft"]);
  });

  it("zone missing: names the zone's code and the map, never another zone", () => {
    const screen = card(draft("zone_missing"));
    expect(
      screen.says(
        "This observation's zone (NM) is not in map v1 on this device. Your point and answers are kept.",
      ),
    ).toBe(true);
    expect(screen.controls()).toEqual([
      "Download map v1 again · 12.0 MB",
      "Keep for later",
      "Discard draft",
    ]);
  });

  it("form missing and nothing to download: keeps it for the coordinator", () => {
    const screen = card(draft("form_missing", { redownload: { possible: false, bytes: null } }));
    expect(screen.says("The form for this observation is not in map v1 on this device.")).toBe(
      true,
    );
    expect(screen.says("Keep it for your coordinator.")).toBe(true);
    expect(screen.controls()).toEqual(["Keep for your coordinator", "Discard draft"]);
  });

  it("asks before discarding, and discards only when confirmed", async () => {
    const screen = card(draft("ready"));
    await screen.press("Discard draft");
    const [alert] = takeAlerts();
    expect(alert?.title).toBe("Discard this draft?");
    expect(alert?.buttons?.map((button) => button.text)).toEqual(["Keep draft", "Discard draft"]);
    expect(data.calls).toEqual([]);
    alert?.buttons?.find((button) => button.text === "Discard draft")?.onPress?.();
    expect(data.calls).toEqual(["discard"]);
  });
});

describe("a practice draft after a restart", () => {
  function Home() {
    const unfinished = useUnfinished();
    return unfinished ? <UnfinishedCard unfinished={unfinished} /> : null;
  }

  beforeEach(() => {
    data.unbound = {
      id: "practice-1",
      formVersion: "shell-v1",
      context: { zoneLabel: "Practice lawn", roundType: "standard" },
      coordinates: [0.5, 0.5],
      answers: {},
    };
  });

  it("keeps its Resume and Discard, through the field session, though it has no hosted map", async () => {
    const screen = render(<Home />);
    expect(screen.says("Reading the map and zone")).toBe(false);
    expect(screen.controls()).toEqual(["Resume", "Discard draft"]);
    await screen.press("Resume");
    expect(data.calls).toEqual(["session resume"]);
    expect(takeNavigation()).toEqual(["/collect"]);
  });

  it("discards it only when confirmed, and says so", async () => {
    const screen = render(<Home />);
    await screen.press("Discard draft");
    const [alert] = takeAlerts();
    alert?.buttons?.find((button) => button.text === "Discard draft")?.onPress?.();
    await vi.waitFor(() => expect(takeAnnouncements()).toContain("Draft discarded."));
    expect(data.calls).toEqual(["session discard"]);
  });
});

describe("a re-download that does not help", () => {
  it("says why on the card, so the observer knows whether to reconnect or ask", () => {
    data.downloads = {
      "site-1": { state: "failed", packageId: "pkg-v1", part: 1, message: "", unavailable: false },
    };
    const screen = card(draft("package_missing"));
    expect(
      screen.says(
        "Map v1 did not finish downloading. Your point and answers are kept. Try again with a connection.",
      ),
    ).toBe(true);
    expect(screen.controls()).toContain("Download map v1 again · 12.0 MB");
  });

  it("says so on a kept draft too", () => {
    data.parked = [draft("zone_missing", { draftId: "draft-2", parked: true })];
    data.downloads = {
      "site-1": {
        state: "verify_failed",
        packageId: "pkg-v1",
        part: 3,
        message: "",
        unavailable: false,
      },
    };
    const screen = render(<ParkedDrafts />);
    expect(
      screen.says(
        "Map v1 could not be checked. Your point and answers are kept. Tell your coordinator.",
      ),
    ).toBe(true);
  });
});

describe("observations kept for later", () => {
  const parked = draft("ready", { draftId: "draft-2", parked: true });

  it("lists each with its map and zone, and resumes it once nothing else is unfinished", async () => {
    data.parked = [parked];
    const screen = render(<ParkedDrafts />);
    expect(screen.says("1 unfinished on this device")).toBe(true);
    expect(screen.says("North meadow · map v1")).toBe(true);
    expect(isDisabled(screen.control("Resume"))).toBe(false);
    await screen.press("Resume");
    expect(data.calls).toEqual(["restoreParked draft-2"]);
    expect(takeNavigation()).toEqual(["/collect"]);
  });

  for (const outcome of ["keeps", "throws"] as const)
    it(`says so when the restore cannot reopen it (${outcome === "keeps" ? "its map changed" : "the restore fails"}), and stays ready to try again`, async () => {
      data.parked = [parked];
      data.restore = outcome;
      const screen = render(<ParkedDrafts />);
      await screen.press("Resume");
      expect(takeNavigation()).toEqual([]);
      expect(screen.says("This draft could not be reopened here. It stays on this device.")).toBe(
        true,
      );
      expect(takeAnnouncements()).toContain(
        "This draft could not be reopened here. It stays on this device.",
      );
      const resume = screen.control("Resume");
      expect(isDisabled(resume)).toBe(false);
      expect(
        (resume.props as { accessibilityState?: { busy?: boolean } }).accessibilityState?.busy,
      ).toBeFalsy();
    });

  it("waits while another observation is unfinished, and says why", () => {
    data.parked = [parked];
    data.occupied = true;
    const screen = render(<ParkedDrafts />);
    expect(isDisabled(screen.control("Resume"))).toBe(true);
    expect(screen.says("Resume or discard the unfinished observation above first.")).toBe(true);
  });
});
