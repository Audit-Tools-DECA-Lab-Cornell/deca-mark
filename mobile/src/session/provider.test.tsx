import { DatabaseSync } from "node:sqlite";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SitePackage } from "../packages/site-package";
import { readDraft } from "../storage/draft-store";
import { initializeDatabase, type LocalDatabase } from "../storage/observation-store";
import { adapter, otherOwner, owner } from "../storage/package-store.fixture";
import type { FieldSessionValue } from "./context";
import { FieldSessionProvider, useFieldSession } from "./provider";

const mocks = vi.hoisted(() => {
  const state: { key: string; database: LocalDatabase | null; counter: number } = {
    key: "",
    database: null,
    counter: 0,
  };
  return {
    ...state,
    open: vi.fn<(_id: string) => Promise<SitePackage | undefined>>(),
    wake: vi.fn(),
  };
});
vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => mocks.database }));
vi.mock("expo-crypto", () => ({
  randomUUID: () => `60000000-0000-4000-8000-${String(++mocks.counter).padStart(12, "0")}`,
}));
vi.mock("../auth/provider", () => ({ useAccount: () => ({ key: mocks.key, ready: true }) }));
vi.mock("../data/api/me-provider", () => ({ useMe: () => ({ profile: null }) }));
vi.mock("../features/auth/profile-store", () => ({ useProfile: () => ({ initials: "QA" }) }));
vi.mock("../sync/provider", () => ({ useSync: () => ({ wake: mocks.wake }) }));
vi.mock("../packages/hosted/provider", () => ({
  useHostedSites: () => ({ sites: {}, installed: [] }),
}));
vi.mock("../packages/open", () => ({ openSitePackage: mocks.open }));

const style: SitePackage["bases"]["day"] = { version: 8, sources: {}, layers: [] };
const pkg: SitePackage = {
  id: "legacy-shell-map",
  name: "Synthetic legacy map",
  meta: "Synthetic",
  availability: "on-device",
  formVersion: "shell-v1",
  inventoryFormVersion: "janet-inventory-v1",
  version: "v7",
  siteId: "sample-garden",
  sizeOnDevice: "Synthetic",
  inheritedContext: "",
  centre: [0.5, 0.5],
  bounds: [0, 0, 1, 1],
  bases: { day: style, night: style, aerial: style },
  layers: [],
  zones: [
    {
      zoneId: "practice:A",
      displayAnchor: [0.5, 0.5],
      polygon: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
      id: "A",
      label: "Original",
      centre: [0.5, 0.5],
      west: 0,
      south: 0,
      east: 1,
      north: 1,
    },
    {
      zoneId: "practice:B",
      displayAnchor: [0.8, 0.8],
      polygon: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
      id: "B",
      label: "Other",
      centre: [0.8, 0.8],
      west: 0,
      south: 0,
      east: 1,
      north: 1,
    },
  ],
};
const snapshots: FieldSessionValue[] = [];
let root: ReactTestRenderer | undefined;
let sqlite: DatabaseSync;
function Probe() {
  snapshots.push(useFieldSession());
  return null;
}
function Tree() {
  return (
    <FieldSessionProvider>
      <Probe />
    </FieldSessionProvider>
  );
}
function latest() {
  const value = snapshots.at(-1);
  if (!value) throw new Error("Session did not render");
  return value;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.key = owner;
  mocks.counter = 0;
  mocks.open.mockReset();
  mocks.open.mockResolvedValue(pkg);
  sqlite = new DatabaseSync(":memory:");
  mocks.database = adapter(sqlite);
  await initializeDatabase(mocks.database);
  snapshots.length = 0;
  await act(async () => {
    root = create(<Tree />);
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  sqlite.close();
  vi.unstubAllGlobals();
});
async function open() {
  await act(async () => {
    expect(await latest().openPackage(pkg.id)).toMatchObject({ ok: true });
  });
}
async function switchAccount(key: string) {
  mocks.key = key;
  await act(async () => {
    root?.update(<Tree />);
  });
}
async function saveA() {
  await open();
  await act(async () => {
    latest().place([0.5, 0.5]);
  });
  await act(async () => {
    latest().dispatch({ kind: "write", question: "observer", value: "AA" });
    latest().dispatch({ kind: "write", question: "people", value: "2" });
    latest().dispatch({ kind: "write", question: "notes", value: "Synthetic A observation" });
  });
  await act(async () => {
    expect(await latest().save()).toMatchObject({ ok: true });
  });
  expect(latest().inProgress).toBeNull();
  expect(latest().state.answers).toEqual({ observer: "AA" });
}

it("clears carried answers after a saved record before account B opens its first draft", async () => {
  await saveA();
  const firstB = snapshots.length;
  await switchAccount(otherOwner);
  expect(snapshots[firstB]?.state.answers).toEqual({});
  expect(snapshots[firstB]?.placed).toBeNull();
  expect(latest().state.answers).toEqual({});
  await open();
  await act(async () => {
    latest().place([0.8, 0.8]);
  });
  expect(latest().state.answers).toEqual({});
  if (!mocks.database) throw new Error("Database missing");
  expect(await readDraft(mocks.database, otherOwner)).toMatchObject({
    owner: otherOwner,
    answers: {},
  });
  expect(
    sqlite.prepare("SELECT COUNT(*) total FROM observations WHERE owner_scope = ?").get(owner),
  ).toEqual({ total: 1 });
});

it("ignores retained A callbacks after A to B to A rather than mutating the new session", async () => {
  await saveA();
  const stale = latest();
  await switchAccount(otherOwner);
  await switchAccount(owner);
  await open();
  const before = latest();
  const alternateZone = pkg.zones[1];
  if (!alternateZone) throw new Error("Alternate zone missing");
  await act(async () => {
    stale.place([0.9, 0.9]);
    stale.startZoneRecord();
    stale.dispatch({ kind: "write", question: "observer", value: "STALE" });
    stale.nudgeTo([0.9, 0.9]);
    stale.chooseZone(alternateZone);
    stale.chooseRoundType("inventory");
    stale.toggleFreshPeriod();
    stale.setArmed(true);
    stale.announce("STALE STATUS");
    stale.discard();
    expect(await stale.openPackage(pkg.id)).toMatchObject({ ok: false });
    expect(await stale.save()).toMatchObject({ ok: false });
    await stale.discardRecovered();
  });
  expect(latest().state).toEqual(before.state);
  expect(latest().placed).toEqual(before.placed);
  expect(latest().zone).toEqual(before.zone);
  expect(latest().roundType).toEqual(before.roundType);
  expect(latest().freshPeriod).toEqual(before.freshPeriod);
  expect(latest().armed).toEqual(before.armed);
  expect(latest().status).toEqual(before.status);
  if (!mocks.database) throw new Error("Database missing");
  expect(await readDraft(mocks.database, owner)).toBeNull();
});

it("persists a zone switch before another render or answer and restores it after remount", async () => {
  await open();
  await act(async () => latest().place([0.5, 0.5]));
  const next = pkg.zones[1];
  if (!next || !mocks.database) throw new Error("Fixture missing");
  await act(async () => latest().chooseZone(next));
  expect((await readDraft(mocks.database, owner))?.context.zoneId).toBe("B");
  await act(async () => {
    root?.unmount();
    root = create(<Tree />);
  });
  expect(latest().recovered?.context.zoneId).toBe("B");
});

it("keeps the exact package throughout a collect visit and releases it on leaving", async () => {
  await open();
  latest().beginVisit();
  mocks.open.mockClear();
  await act(async () => {
    expect(await latest().openPackage(pkg.id)).toMatchObject({ ok: true, sitePackage: pkg });
    expect(await latest().openPackage("newer-map")).toMatchObject({ ok: false });
  });
  expect(mocks.open).not.toHaveBeenCalled();
  latest().endVisit();
  await act(async () => {
    expect(await latest().openPackage("newer-map")).toMatchObject({ ok: true });
  });
  expect(mocks.open).toHaveBeenCalledOnce();
});
