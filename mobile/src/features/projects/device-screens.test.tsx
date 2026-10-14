import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectScreen from "../../../app/(app)/(tabs)/(projects)/[project]";
import SiteScreen from "../../../app/(app)/(tabs)/(projects)/[project]/[site]";
import BriefScreen from "../../../app/(app)/(tabs)/(projects)/[project]/[site]/brief";
import ProjectsHome from "../../../app/(app)/(tabs)/(projects)/index";
import { shellV1 } from "../../forms/fixtures/shell-v1";
import { startSession } from "../../forms/session";
import type { SitePackage } from "../../packages/site-package";
import type { Recovered, SiteVersions } from "../../packages/zone-read-models";
import { isDisabled, render } from "../../ui/screen.fixture";

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

// Device data, as the screens read it: one project with one hosted site (Fall Creek, three zones),
// map v1 verified on this device and map v2 published. The data layer's hooks are stood in for;
// the screens, their labels and the Projects cards are the real ones.
const data = vi.hoisted(() => ({
  params: {} as Record<string, string>,
  versions: null as unknown,
  active: null as unknown,
  session: null as unknown,
}));
vi.mock("expo-router", async () => ({
  ...(await import("../../ui/native.fixture")).router,
  useLocalSearchParams: () => data.params,
}));

const project = {
  id: "proj-1",
  name: "Play Study",
  org: "Cornell DECA Lab",
  summary: "1 site",
  siteIds: ["site-1"],
  training: false,
};
const site = {
  id: "site-1",
  projectId: "proj-1",
  name: "Fall Creek",
  zones: ["North meadow", "Slide", "Swings"],
  packageId: "pkg-v2",
  packageVersion: "v2",
  sizeMb: 12,
  initialDownload: "notDownloaded" as const,
  verifiedLabel: "",
  bundled: false,
  download: { state: "notDownloaded" as const, receivedMb: 0, totalMb: 12, assets: [] },
};
vi.mock("../preview", () => ({
  PREVIEW_ACCOUNT: { name: "Preview", initials: "PV" },
  useDataSource: () => ({ mode: "device" }),
  useProjects: () => [project],
  useProject: (id: string) => (id === project.id ? project : undefined),
  useSites: (id: string) => (id === project.id ? [site] : []),
  useSite: (id: string) => (id === site.id ? site : undefined),
}));
vi.mock("../preview/data-source", () => ({ useDataSource: () => ({ mode: "device" }) }));
vi.mock("../../data/api/me-provider", () => ({
  useMe: () => ({ ready: true, error: null, profile: null }),
}));
vi.mock("../auth/profile-store", () => ({ useProfile: () => ({ initials: "QA", name: "Quinn" }) }));
vi.mock("../onboarding/pending-invitation-store", () => ({
  usePendingInvitation: () => ({ code: null }),
  takeFreshInvitation: () => null,
}));
vi.mock("../onboarding/pending-invitation-note", () => ({
  PendingInvitationProjectsNote: () => null,
}));
vi.mock("../../packages/hosted/context", () => ({
  useHostedSites: () => ({
    sites: { "proj-1": [{ site_id: "site-1", name: "Fall Creek" }] },
    installed: [],
    downloads: {},
  }),
}));
vi.mock("../../packages/zone-read-models", () => ({
  siteVersionSnapshot: () => data.versions,
  useSiteVersions: () => data.versions,
  useRecoveredDraft: () => ({
    active: data.active,
    parked: [],
    unreadable: [],
    problem: null,
    resume: async () => true,
    park: async () => {},
    restoreParked: async () => {},
    discard: async () => {},
    discardParked: async () => {},
    redownload: async () => {},
  }),
}));
vi.mock("../../session/provider", () => ({ useFieldSession: () => data.session }));
// The bundled sample maps load images; no bundled site is drawn here.
vi.mock("../../packages/bundled", () => ({ bundledPackage: () => undefined }));
vi.mock("../../packages/open", () => ({ packageFacts: () => null }));

const MB = 1024 * 1024;
const none = { unfinished: 0, unsent: 0, attention: 0, retained: 0, openSession: false };
const v1InstalledV2Published: SiteVersions = {
  available: { packageId: "pkg-v2", version: 2, archiveBytes: 12 * MB },
  installed: [
    {
      packageId: "pkg-v1",
      version: 1,
      status: "verified",
      bytes: 11 * MB,
      installedAt: "2026-10-10T09:00:00Z",
      references: none,
    },
  ],
  nextSessionPackageId: "pkg-v1",
  lastCheckedAt: null,
  refreshProblem: null,
  download: null,
};

function zone(id: string, label: string) {
  const ring: [number, number][] = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ];
  return {
    id,
    zoneId: `zone-${id}`,
    label,
    centre: [0.5, 0.5] as [number, number],
    displayAnchor: [0.5, 0.5] as [number, number],
    west: 0,
    south: 0,
    east: 1,
    north: 1,
    polygon: [ring],
  };
}
const style: SitePackage["bases"]["day"] = { version: 8, sources: {}, layers: [] };
const v1: SitePackage = {
  id: "pkg-v1",
  name: "Fall Creek",
  meta: "Synthetic",
  availability: "on-device",
  formVersion: shellV1.version,
  inventoryFormVersion: "janet-inventory-v1",
  version: "v1",
  siteId: "site-1",
  sizeOnDevice: "11.0 MB",
  inheritedContext: "",
  centre: [0.5, 0.5],
  bounds: [0, 0, 1, 1],
  bases: { day: style, night: style, aerial: style },
  layers: [],
  zones: [zone("NM", "North meadow"), zone("SL", "Slide"), zone("SW", "Swings")],
};

function brief(active: Recovered | null) {
  data.params = { project: "proj-1", site: "site-1" };
  data.active = active;
  data.session = {
    sitePackage: v1,
    form: shellV1,
    zone: v1.zones[0],
    roundType: "standard",
    freshPeriod: false,
    inProgress: null,
    recovered: active ? { id: active.draftId, binding: {} } : null,
    parked: [],
    pinned: {
      packageId: "pkg-v1",
      version: 1,
      siteId: "site-1",
      zone: { id: "NM", code: "NM", label: "North meadow" },
    },
    state: startSession(),
    zoneBlock: null,
    roundBlock: null,
    dispatch: () => {},
    chooseZone: () => {},
    chooseRoundType: () => {},
    toggleFreshPeriod: () => {},
    resumeRecovered: async () => true,
  };
  return render(<BriefScreen />);
}

beforeEach(() => {
  data.versions = v1InstalledV2Published;
  data.active = null;
  data.session = {
    recovered: null,
    inProgress: null,
    parked: [],
    state: startSession(),
  };
});

describe("map v1 installed and map v2 published, on device data (UI plan 4.1 to 4.3)", () => {
  it("Projects: the project is ready offline and counts the site with a newer map", () => {
    const screen = render(<ProjectsHome />);
    expect(screen.says("1 site ready offline · map update for 1 site")).toBe(true);
  });

  it("Project: the site row names the installed and the published map, and is ready offline", () => {
    data.params = { project: "proj-1" };
    const screen = render(<ProjectScreen />);
    expect(screen.controls()).toContain(
      "Fall Creek, 3 zones · map v1 · v2 available · 12.0 MB, Ready offline",
    );
  });

  it("Site: says the map is on this device, as the package island does, though v2 is not", () => {
    data.params = { project: "proj-1", site: "site-1" };
    const screen = render(<SiteScreen />);
    expect(screen.says("3 zones: North meadow, Slide, Swings.")).toBe(true);
    expect(screen.says("The map opens on the collect screen.")).toBe(true);
    expect(screen.says("Download once. Verify here. Collect without signal.")).toBe(false);
    expect(screen.says("Map package v1")).toBe(true);
    expect(isDisabled(screen.control("Set up this session"))).toBe(false);
  });

  it("Brief: says which map this session uses, beside the published one", () => {
    const screen = brief(null);
    expect(
      screen.says(
        "This session uses map v1, the newest map on this device. Map v2 has been published. Download it when you have a connection.",
      ),
    ).toBe(true);
    expect(isDisabled(screen.control("Start collection"))).toBe(false);
  });

  it("Brief: an unfinished observation here is offered first, and a new visit waits for it", () => {
    const screen = brief({
      draftId: "draft-1",
      formVersion: "janet-test-v1",
      pinned: {
        packageId: "pkg-v1",
        version: 1,
        siteId: "site-1",
        zone: { id: "NM", code: "NM", label: "North meadow" },
      },
      placed: true,
      answered: 3,
      asked: 8,
      status: "ready",
      parked: false,
      redownload: { possible: true, bytes: 11 * MB },
    });
    expect(screen.says("North meadow · map v1")).toBe(true);
    expect(screen.controls()).toContain("Resume");
    expect(isDisabled(screen.control("Start collection"))).toBe(true);
    expect(
      screen.says("Resume or discard the unfinished observation at Fall Creek (map v1)."),
    ).toBe(true);
  });
});
