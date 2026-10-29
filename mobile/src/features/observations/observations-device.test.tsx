import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import ObservationsScreen from "../../../app/(app)/(tabs)/observations/index";
import { saveObservation } from "../../storage/observation-store";
import { installPackage } from "../../storage/package-catalog";
import {
  boundRecord,
  entry,
  memoryDatabase,
  otherOwner,
  owner,
} from "../../storage/package-store.fixture";
import { PreferencesProvider } from "../../ui/preferences";
import { ThemeProvider } from "../../ui/theme";
import { stopsIn } from "./observations.fixture";

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
vi.mock("../../ui/OnlineIndicator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../ui/OnlineIndicator")>()),
  useOnline: () => true,
}));
vi.mock("../../data/api/me-provider", () => ({
  useMe: () => ({ profile: { display_name: "Mobile Observer", observer_initials: "MO" } }),
}));
vi.mock("../auth/profile-store", () => ({
  useProfile: () => ({ saved: true, name: "Mobile Observer", initials: "MO", pending: false }),
}));
vi.mock("../auth/ResumeUploadsNote", () => ({ ResumeUploadsNote: () => null }));

/**
 * The real queue and the real list over a real SQLite file: what each stored state reads as on screen,
 * and that another account's records are not on it.
 */
const world = vi.hoisted(() => ({
  database: null as unknown,
  owner: "",
  calls: [] as string[],
}));
vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => world.database }));
vi.mock("../../auth/provider", () => ({
  useAccount: () => ({ key: world.owner, ready: true }),
}));
vi.mock("../../sync/provider", () => ({
  useSync: () => ({
    revision: 0,
    error: "",
    wake: () => {
      world.calls.push("wake");
    },
    retry: async () => {
      world.calls.push("retry");
    },
  }),
}));
vi.mock("../../session/provider", async () => ({
  shortLabel: (await import("../../domain/labels")).shortLabel,
}));
vi.mock("../preview/data-source", async () => {
  const { useQueueForMode } = await import("../preview/queue");
  return {
    useQueue: () => useQueueForMode("device"),
    useDataSource: () => ({ mode: "device" }),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ID = {
  waiting: "60000000-0000-4000-8000-0000000000b1",
  uploaded: "60000000-0000-4000-8000-0000000000b2",
  refused: "60000000-0000-4000-8000-0000000000b3",
  practice: "60000000-0000-4000-8000-0000000000b4",
  elsewhere: "60000000-0000-4000-8000-0000000000b5",
};
const REFUSED =
  "Needs attention. DECA Mark did not accept Old label for this point on map v7. The record keeps its number and stays on this device. Tell your coordinator.";

const bound = (id: string, createdAt: string) => ({ ...boundRecord, id, createdAt });
const practice = {
  id: ID.practice,
  coordinates: [-76.485, 42.448],
  createdAt: "2026-10-11T09:00:00.000Z",
  storageStatus: "local-only",
  siteId: "sample-garden",
  formVersion: "shell-v1",
  observer: "QA",
  people: 3,
  notes: "",
};

let view: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => view?.unmount());
  view = undefined;
  world.calls = [];
});

async function open() {
  const { db, sqlite } = await memoryDatabase();
  await installPackage(db, owner, entry);
  await saveObservation(db, bound(ID.waiting, "2026-10-11T12:00:00.000Z"), owner);
  await saveObservation(db, bound(ID.uploaded, "2026-10-11T11:00:00.000Z"), owner);
  await saveObservation(db, bound(ID.refused, "2026-10-11T10:00:00.000Z"), owner);
  await saveObservation(db, practice as never, owner);
  await installPackage(db, otherOwner, entry);
  await saveObservation(db, bound(ID.elsewhere, "2026-10-11T13:00:00.000Z"), otherOwner);
  sqlite.exec(`UPDATE observations SET sync_state = 'synced' WHERE id = '${ID.uploaded}'`);
  sqlite.exec(
    `UPDATE observations SET sync_state = 'needs-attention', sync_error = '${REFUSED}' WHERE id = '${ID.refused}'`,
  );
  world.database = db;
  world.owner = owner;
  await act(async () => {
    view = create(
      <PreferencesProvider>
        <ThemeProvider>
          <ObservationsScreen />
        </ThemeProvider>
      </PreferencesProvider>,
    );
  });
  await act(async () => {
    for (let i = 0; i < 60; i++) await Promise.resolve();
  });
  return sqlite;
}

function stop(id: string) {
  const row = view?.root.find(
    (node) => (node.type as unknown) === "View" && node.props.testID === `observation-${id}`,
  );
  if (!row) throw new Error(`No row for ${id}`);
  const stops = stopsIn(row);
  expect(stops).toHaveLength(1);
  return stops[0]?.label ?? "";
}

describe("the Observations list over the device's own records (MOB-38)", () => {
  it("reads each stored state in the contract's words, from MOB-37's map", async () => {
    const sqlite = await open();
    try {
      expect(stop(ID.waiting)).toMatch(/^OBS-600000\. Old label, Standard round, .+\. On device\.$/);
      expect(stop(ID.uploaded)).toMatch(/\. Uploaded\.$/);
      expect(stop(ID.refused)).toMatch(/\. Needs attention\. DECA Mark did not accept Old label/);
      expect(stop(ID.practice)).toContain(
        "On device. Practice record: stays on this device and is never uploaded.",
      );
    } finally {
      sqlite.close();
    }
  });

  it("dates each record, so a list that spans days is not read as one day", async () => {
    const sqlite = await open();
    try {
      expect(stop(ID.waiting)).toMatch(/Oct 11 · \d\d:\d\d/);
    } finally {
      sqlite.close();
    }
  });

  it("never reads Uploaded for a record the device has no receipt for", async () => {
    const sqlite = await open();
    try {
      const words = [ID.waiting, ID.refused, ID.practice].map(stop);
      for (const label of words) expect(label).not.toMatch(/Uploaded\./);
    } finally {
      sqlite.close();
    }
  });

  it("lists this account's records only: another account's stay under its own scope", async () => {
    const sqlite = await open();
    try {
      const ids = view?.root
        .findAll(
          (node) =>
            (node.type as unknown) === "View" &&
            String(node.props.testID ?? "").startsWith("observation-"),
        )
        .map((node) => node.props.testID);
      expect(ids).toHaveLength(4);
      expect(ids).not.toContain(`observation-${ID.elsewhere}`);
    } finally {
      sqlite.close();
    }
  });

  it("sends the refused record again only through sync.retry()", async () => {
    const sqlite = await open();
    try {
      const retry = view?.root.find(
        (node) =>
          (node.type as unknown) === "Pressable" &&
          node.props.accessibilityLabel === "Retry these uploads",
      );
      await act(async () => {
        retry?.props.onPress();
      });
      expect(world.calls).toEqual(["retry"]);
    } finally {
      sqlite.close();
    }
  });
});
