import { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountScreen from "../../../app/(app)/(tabs)/account/index";
import { saveObservation } from "../../storage/observation-store";
import { installPackage } from "../../storage/package-catalog";
import { boundRecord, entry, memoryDatabase, owner } from "../../storage/package-store.fixture";
import { takeAlerts, takeAnnouncements, takeNavigation } from "../../ui/native.fixture";
import { render } from "../../ui/screen.fixture";

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

/** What the Account screen reads: the real queue over a real table, a sync revision the test bumps. */
const world = vi.hoisted(() => ({
  database: null as unknown,
  owner: "",
  revision: 0,
  listeners: new Set<() => void>(),
  /** While set, the table read waits for it, so the screen can be looked at in between. */
  gate: null as Promise<void> | null,
  reads: 0,
}));
vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => world.database }));
vi.mock("../../auth/provider", () => ({
  useAccount: () => ({
    key: world.owner,
    ready: true,
    account: { id: "50000000-0000-4000-8000-00000000000a", email: "observer@fieldmaps.test" },
    session: { user: { id: "50000000-0000-4000-8000-00000000000a" } },
  }),
}));
vi.mock("../../sync/provider", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useSync: () => ({
      revision: useSyncExternalStore(
        (listener) => {
          world.listeners.add(listener);
          return () => world.listeners.delete(listener);
        },
        () => world.revision,
      ),
      wake: () => {},
    }),
  };
});
vi.mock("../../session/provider", () => ({
  shortLabel: (id: string) => id.slice(-4),
  useFieldSession: () => ({ recovered: null, inProgress: null, parked: [] }),
}));
vi.mock("../preview/data-source", async () => {
  const { useQueueForMode } = await import("../preview/queue");
  return { useQueue: () => useQueueForMode("device") };
});
vi.mock("../../data/api/me-provider", () => ({
  useMe: () => ({ profile: { display_name: "Mobile Observer", observer_initials: "MO" } }),
}));
vi.mock("../auth/profile-store", () => ({
  useProfile: () => ({ saved: true, name: "Mobile Observer", initials: "MO", pending: false }),
}));
vi.mock("../auth/ResumeUploadsNote", () => ({ ResumeUploadsNote: () => null }));
vi.mock("../onboarding/components", () => ({ ProfileQueuedLine: () => null }));
vi.mock("../../layout/orientation", () => ({ useOrientationChoice: () => ["device", () => null] }));
vi.mock("../projects/parts", async () => {
  const { createElement } = await import("react");
  const { Text } = await import("../../ui/Text");
  return {
    AccountMark: () => null,
    PageIntro: ({ title }: { title: string }) => createElement(Text, null, title),
  };
});

const LOADING = "Reading records from this device…";
const settle = () =>
  act(async () => {
    for (let i = 0; i < 40; i++) await Promise.resolve();
  });

beforeEach(() => {
  world.revision = 0;
  world.gate = null;
  world.reads = 0;
  takeAlerts();
  takeAnnouncements();
  takeNavigation();
});

describe("Account while the sync revision moves (MOB-39)", () => {
  async function open() {
    const { db, sqlite } = await memoryDatabase();
    await installPackage(db, owner, entry);
    await saveObservation(db, boundRecord, owner);
    world.owner = owner;
    world.database = {
      execAsync: db.execAsync.bind(db),
      runAsync: db.runAsync.bind(db),
      getAllAsync: async (sql: string, ...parameters: (string | number)[]) => {
        if (sql.includes("FROM observations WHERE owner_scope = ? ORDER BY")) {
          world.reads++;
          await world.gate;
        }
        return db.getAllAsync(sql, ...parameters);
      },
    };
    return { sqlite };
  }
  const bump = () =>
    act(async () => {
      world.revision++;
      for (const listener of world.listeners) listener();
    });

  it("reads the records on the first visit and says so", async () => {
    const { sqlite } = await open();
    try {
      const screen = render(<AccountScreen />);
      expect(screen.says(LOADING)).toBe(true);
      await settle();
      expect(screen.says(LOADING)).toBe(false);
      expect(screen.says("On device")).toBe(true);
    } finally {
      sqlite.close();
    }
  });

  it("keeps showing the counts when a bump with no change makes it read again", async () => {
    const { sqlite } = await open();
    try {
      const screen = render(<AccountScreen />);
      await settle();
      expect(world.reads).toBe(1);
      let release: () => void = () => {};
      world.gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await bump();
      expect(world.reads).toBe(2);
      expect(screen.says(LOADING)).toBe(false);
      expect(screen.says("On device")).toBe(true);
      release();
      await settle();
      expect(screen.says(LOADING)).toBe(false);
      expect(screen.says("On device")).toBe(true);
    } finally {
      sqlite.close();
    }
  });
});
