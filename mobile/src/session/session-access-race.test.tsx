import { DatabaseSync } from "node:sqlite";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SitePackage } from "../packages/site-package";
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
  const state: { key: string; database: LocalDatabase | null; counter: number; blocked: boolean } =
    {
      key: "",
      database: null,
      counter: 0,
      blocked: false,
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
  useHostedSites: () => ({
    sites: {},
    installed: [],
    problems: mocks.blocked ? { [packageIdentity.projectId]: "no_access" } : {},
    allowedProjects: mocks.blocked ? [] : null,
  }),
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
  mocks.blocked = false;
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
it("rechecks current membership after a map-open wait within the same account", async () => {
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
  let release: (value: SitePackage) => void = () => {
    throw new Error("Open did not start");
  };
  mocks.open.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const opening = latest().openPackage(managed.id);
  await vi.waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
  mocks.blocked = true;
  await act(async () => {
    root?.update(<Tree />);
  });
  release(managed);
  expect(await opening).toMatchObject({
    ok: false,
    reason: expect.stringContaining("no longer accessible"),
  });
  expect(latest().sitePackage).toBeNull();
});
