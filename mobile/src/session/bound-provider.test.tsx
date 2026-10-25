import { DatabaseSync } from "node:sqlite";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SitePackage } from "../packages/site-package";
import { readDraft } from "../storage/draft-store";
import { initializeDatabase, type LocalDatabase } from "../storage/observation-store";
import { installPackage } from "../storage/package-catalog";
import {
  adapter,
  entry,
  owner,
  identity as packageIdentity,
} from "../storage/package-store.fixture";
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
  id: "shell-map",
  name: "Synthetic shell map",
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
it("freezes managed UUID bindings at placement and persists an explicit zone switch", async () => {
  if (!mocks.database) throw new Error("Database missing");
  await installPackage(mocks.database, owner, entry);
  const zones = pkg.zones.map((zone, index) => ({
    ...zone,
    zoneId: `50000000-0000-4000-8000-00000000000${index + 1}`,
    geometrySha256: "b".repeat(64),
  }));
  const managed: SitePackage = {
    ...pkg,
    id: packageIdentity.packageId,
    siteId: packageIdentity.siteId,
    packageIdentity,
    projectId: packageIdentity.projectId,
    zones,
  };
  mocks.open.mockResolvedValue(managed);
  await act(async () => {
    expect(await latest().openPackage(managed.id)).toMatchObject({ ok: true });
  });
  await act(async () => latest().place([0.5, 0.5]));
  expect(latest().pinned?.zone.id).toBe(zones[0]?.zoneId);
  expect((await readDraft(mocks.database, owner))?.binding).toMatchObject({
    packageId: managed.id,
    packageVersion: 7,
    zoneId: zones[0]?.zoneId,
  });
  const other = zones[1];
  if (!other) throw new Error("Second zone missing");
  await act(async () => latest().chooseZone(other));
  expect((await readDraft(mocks.database, owner))?.binding?.zoneId).toBe(other.zoneId);
  await act(async () => {
    root?.unmount();
    root = create(<Tree />);
  });
  await act(async () => {
    await latest().resumeRecovered();
  });
  expect(latest().pinned).toMatchObject({
    packageId: managed.id,
    version: 7,
    zone: { id: other.zoneId, code: "B" },
  });
});

it("retains an outside-zone point as a draft and refuses its local save", async () => {
  if (!mocks.database) throw new Error("Database missing");
  await installPackage(mocks.database, owner, entry);
  const managed = {
    ...pkg,
    id: packageIdentity.packageId,
    siteId: packageIdentity.siteId,
    packageIdentity,
    projectId: packageIdentity.projectId,
    zones: pkg.zones.map((zone) => ({
      ...zone,
      zoneId: "50000000-0000-4000-8000-000000000001",
      geometrySha256: "b".repeat(64),
    })),
  };
  mocks.open.mockResolvedValue(managed);
  await act(async () => {
    await latest().openPackage(managed.id);
  });
  await act(async () => latest().place([2, 2]));
  await act(async () => {
    expect(await latest().save()).toMatchObject({
      ok: false,
      message: expect.stringContaining("outside"),
    });
  });
  expect((await readDraft(mocks.database, owner))?.coordinates).toEqual([2, 2]);
  expect(sqlite.prepare("SELECT COUNT(*) total FROM observations").get()).toEqual({ total: 0 });
});
