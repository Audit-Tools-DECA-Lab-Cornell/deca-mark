import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../../storage/observation-store";
import { ids } from "./bound-fixture";
import type { HostedValue } from "./context";
import type { ImmutablePackageFiles } from "./installation";
import { deferred, harness, hash, issuer, nextFixture, owner } from "./lifecycle.test-helper";
import type { PackageSource } from "./prepare";
import { HostedSitesProvider, useHostedSites } from "./provider";
import type { HostedSite } from "./schemas";

const mocks = vi.hoisted(() => {
  const fields: {
    database: LocalDatabase | null;
    files: ImmutablePackageFiles | null;
    source: PackageSource | null;
    sites: HostedSite[];
    projects: { project_id: string; is_training: boolean }[];
  } = { database: null, files: null, source: null, sites: [], projects: [] };
  return {
    ...fields,
    client: {
      auth: {
        getSession: async () => ({
          data: {
            session: {
              user: { id: "50000000-0000-4000-8000-000000000055" },
              access_token: "synthetic-test-token",
            },
          },
        }),
      },
    },
    session: {},
  };
});
vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => mocks.database }));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock("react-native", () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) } }));
vi.mock("../../auth/provider", () => ({
  useAccount: () => ({
    key: owner,
    scope: { issuer },
    account: { id: ids.form },
    client: mocks.client,
    session: mocks.session,
  }),
}));
vi.mock("../../data/api/me-provider", () => ({
  useMe: () => ({ projects: mocks.projects, profile: { user_id: ids.form } }),
}));
vi.mock("../../platform/config", () => ({ connection: { apiUrl: "https://api.example.test" } }));
vi.mock("./device", () => ({
  get devicePackageFiles() {
    return mocks.files;
  },
  deviceSha256: (bytes: Uint8Array) => hash(bytes),
  apiPackageSource: () => mocks.source,
  readSiteList: () => mocks.sites,
  readSiteCheckedAt: () => null,
  writeSiteList: () => {},
}));
let h: Awaited<ReturnType<typeof harness>>;
let root: ReactTestRenderer | undefined;
let view: HostedValue | undefined;
function Probe() {
  view = useHostedSites();
  return null;
}
function Tree() {
  return (
    <HostedSitesProvider>
      <Probe />
    </HostedSitesProvider>
  );
}
function latest() {
  if (!view) throw new Error("Provider missing");
  return view;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h = await harness();
  mocks.database = h.database;
  mocks.files = h.files;
  mocks.source = nextFixture().source;
  mocks.sites = [nextFixture().site];
  mocks.projects = [{ project_id: ids.project, is_training: false }];
  vi.stubGlobal("fetch", async (request: Request) =>
    new URL(request.url).pathname.endsWith("/sites")
      ? new Response(JSON.stringify(mocks.sites), {
          headers: { "Content-Type": "application/json" },
        })
      : new Response(
          JSON.stringify({
            error: { code: "not_found", message: "Synthetic unavailable", details: {} },
          }),
          { status: 404 },
        ),
  );
  await act(async () => {
    root = create(<Tree />);
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  view = undefined;
  h.close();
  vi.unstubAllGlobals();
});

it("publishes a completed newer install even when queued exact recovery fails", async () => {
  const f = nextFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  mocks.source = {
    ...f.source,
    archive: async () => {
      entered.resolve();
      await release.promise;
      return f.bytes;
    },
  };
  let first: Promise<void> = Promise.resolve();
  await act(async () => {
    first = latest().download(ids.project, ids.site);
    await entered.promise;
  });
  let recovery: Promise<void> = Promise.resolve();
  await act(async () => {
    recovery = latest().download(ids.project, ids.site, ids.package);
  });
  await act(async () => {
    release.resolve();
    await first;
    await recovery;
  });
  expect(latest().installed).toMatchObject([
    { identity: { packageVersion: 8 }, status: "verified" },
  ]);
  expect(latest().downloads[ids.site]).toMatchObject({
    packageId: ids.package,
    state: "failed",
    unavailable: true,
  });
});

it("clears running progress when membership is removed during a download", async () => {
  const f = nextFixture();
  const entered = deferred<void>();
  const release = deferred<void>();
  mocks.source = {
    ...f.source,
    archive: async () => {
      entered.resolve();
      await release.promise;
      return f.bytes;
    },
  };
  let pending: Promise<void> = Promise.resolve();
  await act(async () => {
    pending = latest().download(ids.project, ids.site);
    await entered.promise;
  });
  expect(latest().downloads[ids.site]?.state).toBe("downloading");
  mocks.projects = [];
  await act(async () => {
    root?.update(<Tree />);
  });
  await act(async () => {
    release.resolve();
    await pending;
  });
  expect(latest().downloads[ids.site]).toBeUndefined();
  expect(latest().installed).toEqual([]);
});
