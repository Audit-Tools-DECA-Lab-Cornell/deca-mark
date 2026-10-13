import { DatabaseSync } from "node:sqlite";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MeSnapshot } from "../../data/api/me-cache";
import { MeProvider, useMe } from "../../data/api/me-provider";
import { initializeDatabase, type LocalDatabase } from "../../storage/observation-store";
import { adapter } from "../../storage/package-store.fixture";
import { boundFixture, ids } from "./bound-fixture";
import { HostedSitesProvider, useHostedSites } from "./provider";
import type { HostedSite } from "./schemas";

const mocks = vi.hoisted(() => {
  const state: { account: { id: string } | null; database: LocalDatabase | null } = {
    account: null,
    database: null,
  };
  return {
    ...state,
    markAccountDeleted: vi.fn(),
    readSiteList: vi.fn<(_issuer: string, _user: string, _project: string) => HostedSite[] | null>(
      () => null,
    ),
    readMe: vi.fn<(_user: string) => MeSnapshot | null>(() => null),
  };
});

vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
vi.mock("../../auth/provider", () => ({
  useAccount: () => ({
    account: mocks.account,
    client: null,
    session: null,
    restored: true,
    markAccountDeleted: mocks.markAccountDeleted,
    key: JSON.stringify([
      "https://api.example.test",
      "https://auth.example.test",
      mocks.account?.id ?? null,
      ids.project,
    ]),
    scope: { issuer: "https://auth.example.test" },
  }),
}));
vi.mock("../../platform/config", () => ({
  connection: { apiUrl: "https://api.example.test", supabaseUrl: "https://auth.example.test" },
}));
vi.mock("../../data/api/me-file", () => ({
  meFileStore: (_issuer: string, user: string) => ({
    read: () => mocks.readMe(user),
    write: vi.fn(),
  }),
}));
vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => mocks.database }));
vi.mock("expo-crypto", () => ({ randomUUID: () => "synthetic-attempt" }));
vi.mock("./device", () => ({
  readSiteList: mocks.readSiteList,
  writeSiteList: vi.fn(),
  devicePackageFiles: {
    read: () => null,
    staged: () => [],
    stage: vi.fn(),
    publish: vi.fn(),
    discard: vi.fn(),
  },
  deviceSha256: async () => "a".repeat(64),
  apiPackageSource: vi.fn(),
}));

let root: ReactTestRenderer | undefined;
let sqlite: DatabaseSync;
let renders = 0;
const memberships: ReturnType<typeof useMe>[] = [];
const hosted: ReturnType<typeof useHostedSites>[] = [];

function Probe() {
  memberships.push(useMe());
  hosted.push(useHostedSites());
  renders += 1;
  if (renders > 20) throw new Error("Hosted sites did not settle within 20 renders");
  return null;
}

function Tree() {
  return (
    <MeProvider>
      <HostedSitesProvider>
        <Probe />
      </HostedSitesProvider>
    </MeProvider>
  );
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.account = null;
  mocks.readSiteList.mockClear();
  mocks.readSiteList.mockImplementation(() => null);
  mocks.readMe.mockImplementation(() => null);
  sqlite = new DatabaseSync(":memory:");
  mocks.database = adapter(sqlite);
  await initializeDatabase(mocks.database);
  renders = 0;
  memberships.length = 0;
  hosted.length = 0;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  sqlite.close();
  vi.unstubAllGlobals();
});

it("hides account A cached sites on the first B render and restores only A's own cache on return", async () => {
  mocks.readMe.mockImplementation((user) => ({
    activeProjectId: ids.project,
    identity: {
      profile: {
        user_id: user,
        display_name: null,
        observer_initials: null,
        locale: null,
        created_at: "2026-10-11T10:00:00Z",
      },
      organization_memberships: [],
      project_memberships: [
        {
          project_id: ids.project,
          code: "synthetic",
          name: "Synthetic",
          organization_id: ids.site,
          role: "observer",
          is_training: false,
        },
      ],
    },
  }));
  mocks.readSiteList.mockImplementation((_issuer, user) => [
    { ...boundFixture().site, name: user },
  ]);
  mocks.account = { id: ids.form };
  await act(async () => {
    root = create(<Tree />);
  });
  expect(hosted.at(-1)?.sites[ids.project]?.[0]?.name).toBe(ids.form);
  const beforeB = hosted.length;
  mocks.account = { id: ids.zone };
  await act(async () => {
    root?.update(<Tree />);
  });
  expect(hosted[beforeB]?.sites).toEqual({});
  expect(hosted.at(-1)?.sites[ids.project]?.[0]?.name).toBe(ids.zone);
  const beforeA = hosted.length;
  mocks.account = { id: ids.form };
  await act(async () => {
    root?.update(<Tree />);
  });
  expect(hosted[beforeA]?.sites).toEqual({});
  expect(hosted.at(-1)?.sites[ids.project]?.[0]?.name).toBe(ids.form);
});

it.each([
  null,
  { id: "cached-account" },
])("settles startup without a profile snapshot for account %j", async (account) => {
  mocks.account = account;
  await act(async () => {
    root = create(<Tree />);
  });
  expect(renders).toBeGreaterThan(1);
  expect(memberships.at(-1)?.ready).toBe(true);
  expect(hosted.at(-1)?.sites).toEqual({});
  expect(hosted.at(-1)?.errors).toEqual({});
  expect(hosted.at(-1)?.signedIn).toBe(false);
  for (const value of memberships) {
    expect(value.projects).toBe(memberships[0]?.projects);
    expect(value.organizations).toBe(memberships[0]?.organizations);
  }
  expect(mocks.readSiteList).not.toHaveBeenCalled();
});
