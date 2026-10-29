import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ObservationsScreen from "../../../app/(app)/(tabs)/observations/index";
import {
  takeAlerts,
  takeAnnouncements,
  takeNavigation,
} from "../../ui/native.fixture";
import { render } from "../../ui/screen.fixture";
import type { QueueRecord } from "../preview/fixtures";
import { record, resetWorld, stopsIn, world } from "./observations.fixture";

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

const REJECTED =
  "Needs attention. DECA Mark did not accept North meadow for this point on map v1. The record keeps its number and stays on this device. Tell your coordinator.";
const PRACTICE = "Practice record: stays on this device and is never uploaded";

/** One record in every state the list can draw, across two zones, newest first. */
function everyState(): QueueRecord[] {
  return [
    record("a1", "onDevice", { time: "11:34" }),
    record("a2", "attention", { time: "11:32", problem: REJECTED }),
    record("a3", "uploading", { time: "11:30", zone: "Woodland edge", roundType: "reliability" }),
    record("a4", "uploaded", { time: "10:52", zone: "Woodland edge", roundType: "inventory" }),
  ];
}

beforeEach(() => {
  resetWorld();
  takeAlerts();
  takeAnnouncements();
  takeNavigation();
});

function rowOf(screen: ReturnType<typeof render>, id: string) {
  return screen.renderer.root.find(
    (node) => (node.type as unknown) === "View" && node.props.testID === `observation-${id}`,
  );
}

describe("the list uses the four queue words (MOB-38)", () => {
  it("says On device, Uploading, Uploaded and Needs attention for the four states", () => {
    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    for (const word of ["On device", "Uploading", "Uploaded", "Needs attention"]) {
      expect(screen.says(word), word).toBe(true);
    }
  });

  it("each record's one stop names its own state word", () => {
    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    const words: Record<string, string> = {
      a1: "On device",
      a2: "Needs attention",
      a3: "Uploading",
      a4: "Uploaded",
    };
    for (const [id, word] of Object.entries(words)) {
      const [stop] = stopsIn(rowOf(screen, id));
      expect(stop?.label, id).toContain(`${word}.`);
    }
  });

  it("never says the old words: Held, Synced, Pending, Failed or Sent", () => {
    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    const said = screen.texts().join(" | ");
    for (const old of ["Held", "Synced", "Pending", "Failed", "Sent", "held for signal"]) {
      expect(said, old).not.toContain(old);
    }
  });

  it("draws each state with its glyph, word and tone from the contract", () => {
    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    const badges = screen.renderer.root.findAll(
      (node) => (node.type as unknown) === "View" && node.props.accessibilityRole === "text",
    );
    const labels = badges.map((badge) => badge.props.accessibilityLabel);
    expect(labels).toEqual(expect.arrayContaining(["On device", "Needs attention", "Uploading", "Uploaded"]));
  });
});

describe("one accessibility element per record (A11Y-01)", () => {
  it("reads each record as a single stop, with its number, zone, round, time, state and reason", () => {
    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    expect(stopsIn(rowOf(screen, "a2"))).toEqual([
      {
        label:
          "OBS-A2. North meadow, Standard round, 11:32. Needs attention. DECA Mark did not accept North meadow for this point on map v1. The record keeps its number and stays on this device. Tell your coordinator.",
      },
    ]);
    expect(stopsIn(rowOf(screen, "a4"))).toEqual([
      { label: "OBS-A4. Woodland edge, Inventory round, 10:52. Uploaded." },
    ]);
    for (const id of ["a1", "a2", "a3", "a4"]) expect(stopsIn(rowOf(screen, id))).toHaveLength(1);
  });

  it("hides the row's parts from the screen reader, so TalkBack does not stop on them either", () => {
    world.records = [record("a2", "attention", { problem: REJECTED })];
    const screen = render(<ObservationsScreen />);
    const hidden = rowOf(screen, "a2").findAll(
      (node) =>
        node.props.importantForAccessibility === "no-hide-descendants" &&
        node.props.accessibilityElementsHidden === true,
    );
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("gives the screen a heading, and no stop for the records beyond their own", () => {
    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    const headings = screen.renderer.root
      .findAll((node) => node.props.accessibilityRole === "header")
      .map((node) => node.props.children);
    expect(headings).toContain("Observations");
    // A record is a stop of its own, so the list is the heading, the zone filter, then one stop each.
    const list = screen.renderer.root.find(
      (node) => (node.type as unknown) === "FlatList",
    );
    const rows = stopsIn(list).filter((stop) => stop.label.startsWith("OBS-"));
    expect(rows).toHaveLength(4);
  });
});

describe("practice records (MOB-37's words, until MOB-43)", () => {
  it("says a practice record stays on this device and is never uploaded, in its one stop", () => {
    world.records = [
      record("b1", "onDevice", { practice: true, zone: "Practice garden", storage: PRACTICE }),
      record("b2", "onDevice"),
    ];
    const screen = render(<ObservationsScreen />);
    const [stop] = stopsIn(rowOf(screen, "b1"));
    expect(stop?.label).toContain(`${PRACTICE}.`);
    expect(screen.says(PRACTICE)).toBe(true);
    expect(stopsIn(rowOf(screen, "b2"))[0]?.label).not.toContain("Practice");
  });

  it("counts only the records that can upload as not uploaded", () => {
    world.records = [
      record("b1", "onDevice", { practice: true, zone: "Practice garden", storage: PRACTICE }),
      record("b2", "onDevice"),
      record("b3", "uploaded"),
    ];
    const screen = render(<ObservationsScreen />);
    expect(screen.says("1 not uploaded · 1 uploaded")).toBe(true);
  });
});

describe("the zone chips", () => {
  it("are offered when records are in more than one zone, with All zones chosen first", () => {
    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    const group = screen.renderer.root.find(
      (node) => node.props.accessibilityRole === "radiogroup" && node.props.accessibilityLabel === "Zone",
    );
    const chips = group.findAll((node) => node.props.accessibilityRole === "radio");
    expect(chips.map((chip) => chip.props.accessibilityLabel)).toEqual([
      "All zones",
      "North meadow",
      "Woodland edge",
    ]);
    expect(chips.map((chip) => chip.props.accessibilityState.checked)).toEqual([true, false, false]);
  });

  it("are left out when every record is in one zone", () => {
    world.records = [record("a1", "onDevice"), record("a2", "uploaded")];
    const screen = render(<ObservationsScreen />);
    expect(screen.controls()).not.toContain("All zones");
  });

  it("show only the chosen zone's records, say how many, and can be cleared", async () => {
    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    await screen.press("Woodland edge");
    const shown = () =>
      screen.renderer.root
        .findAll((node) => String(node.props.testID ?? "").startsWith("observation-"))
        .filter((node) => (node.type as unknown) === "View")
        .map((node) => node.props.testID);
    expect(shown()).toEqual(["observation-a3", "observation-a4"]);
    expect(takeAnnouncements()).toEqual(["Woodland edge: 2 of 4 observations shown."]);
    await screen.press("All zones");
    expect(shown()).toHaveLength(4);
    expect(takeAnnouncements()).toEqual(["All zones: 4 of 4 observations shown."]);
  });
});

describe("Retry these uploads", () => {
  it("is offered only when a record needs attention, and says what retrying does", () => {
    world.records = [record("a1", "onDevice"), record("a3", "uploading")];
    expect(render(<ObservationsScreen />).controls()).not.toContain("Retry these uploads");

    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    expect(screen.controls()).toContain("Retry these uploads");
    expect(screen.says("1 observation needs attention.")).toBe(true);
    expect(screen.says("Retrying sends the same record again and does not change it.")).toBe(true);
  });

  it("calls sync.retry(), never wake()", async () => {
    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    await screen.press("Retry these uploads");
    expect(world.calls).toEqual(["retry"]);
  });

  it("says in the plural when several need attention", () => {
    world.records = [
      record("a1", "attention", { problem: REJECTED }),
      record("a2", "attention", { problem: REJECTED }),
    ];
    const screen = render(<ObservationsScreen />);
    expect(screen.says("2 observations need attention.")).toBe(true);
    expect(screen.says("Retrying sends the same records again and does not change them.")).toBe(
      true,
    );
  });
});

describe("pull to refresh", () => {
  function pull(screen: ReturnType<typeof render>) {
    const list = screen.renderer.root.find((node) => (node.type as unknown) === "FlatList");
    const control = list.props.refreshControl as { props: { onRefresh: () => void } };
    act(() => control.props.onRefresh());
  }

  it("calls the real wake() on a device", () => {
    world.records = everyState();
    pull(render(<ObservationsScreen />));
    expect(world.calls).toEqual(["wake"]);
  });

  it("sends nothing in preview, which shows sample records", () => {
    world.mode = "preview";
    world.records = everyState();
    pull(render(<ObservationsScreen />));
    expect(world.calls).toEqual([]);
  });
});

describe("the states around the list (DESIGN, Collector screen states)", () => {
  it("keeps the title while it reads, and says it is reading", () => {
    world.loading = true;
    const screen = render(<ObservationsScreen />);
    expect(screen.says("Observations")).toBe(true);
    expect(screen.says("Reading records from this device…")).toBe(true);
  });

  it("says nothing was removed when the records could not be read, and reads again", async () => {
    world.error = "The queue could not be read.";
    const screen = render(<ObservationsScreen />);
    expect(screen.says("The records on this device could not be read.")).toBe(true);
    expect(screen.says("They are still on this device; nothing was removed.")).toBe(true);
    await screen.press("Try again");
    expect(world.calls).toEqual(["read again"]);
  });

  it("is plain when there is nothing yet, and points to Projects", async () => {
    const screen = render(<ObservationsScreen />);
    expect(screen.says("No observations yet")).toBe(true);
    expect(screen.says("Records you save appear here, with their upload state.")).toBe(true);
    await screen.press("Go to projects");
    expect(takeNavigation()).toEqual(["/"]);
  });

  it("says offline records remain on this device and upload later", () => {
    world.online = false;
    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    expect(screen.says("Records remain on this device and upload later.")).toBe(true);
  });

  it("says what the last upload attempt said, and that the records are still here", () => {
    world.syncError = "Server unavailable. Your record is saved and will retry.";
    world.records = [record("a1", "onDevice")];
    const screen = render(<ObservationsScreen />);
    expect(screen.says("Uploading is waiting.")).toBe(true);
    expect(screen.says("Server unavailable. Your record is saved and will retry.")).toBe(true);
  });

  it("marks sample records in preview", () => {
    world.mode = "preview";
    world.records = everyState();
    expect(render(<ObservationsScreen />).says("Sample")).toBe(true);
    world.mode = "device";
    expect(render(<ObservationsScreen />).says("Sample")).toBe(false);
  });

  it("has no link back to a map, a studies page or a second screen", () => {
    world.records = everyState();
    const screen = render(<ObservationsScreen />);
    for (const old of ["Back to the map", "Studies", "Account and synchronisation", "On this device"]) {
      expect(screen.controls().join("|"), old).not.toContain(old);
    }
  });
});
