import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../../storage/observation-store";
import { boundFixture, boundManifest, ids } from "./bound-fixture";
import type { HostedValue } from "./context";
import type { ImmutablePackageFiles } from "./installation";
import {
  deferred,
  harness,
  hash,
  issuer,
  nextFixture,
  otherOwner,
  owner,
} from "./lifecycle.test-helper";
import { PackageOperations } from "./operations";
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
  // What the signed-in account looks like to the provider. A token refresh replaces `session` (and
  // the access token the client hands out) while the user stays the same; `userId: null` is signed out.
  const auth = {
    userId: null as string | null,
    session: null as object | null,
    token: "synthetic-test-token",
  };
  return {
    ...fields,
    auth,
    client: {
      auth: {
        getSession: async () => ({
          data: {
            session: auth.session ? { user: { id: auth.userId }, access_token: auth.token } : null,
          },
        }),
      },
    },
  };
});
vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => mocks.database }));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock("react-native", () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) } }));
vi.mock("../../auth/provider", () => ({
  useAccount: () => {
    const { userId, session } = mocks.auth;
    return {
      key: userId === null ? "local" : userId === ids.form ? owner : otherOwner,
      scope: userId === null ? null : { issuer },
      account: userId === null ? null : { id: userId },
      client: mocks.client,
      session,
    };
  },
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
const authorizations: (string | null)[] = [];
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h = await harness();
  mocks.database = h.database;
  mocks.files = h.files;
  mocks.source = nextFixture().source;
  mocks.sites = [nextFixture().site];
  mocks.projects = [{ project_id: ids.project, is_training: false }];
  mocks.auth.userId = ids.form;
  mocks.auth.session = {};
  mocks.auth.token = "synthetic-test-token";
  authorizations.length = 0;
  vi.stubGlobal("fetch", async (request: Request) => {
    authorizations.push(request.headers.get("authorization"));
    return new URL(request.url).pathname.endsWith("/sites")
      ? new Response(JSON.stringify(mocks.sites), {
          headers: { "Content-Type": "application/json" },
        })
      : new Response(
          JSON.stringify({
            error: { code: "not_found", message: "Synthetic unavailable", details: {} },
          }),
          { status: 404 },
        );
  });
  await act(async () => {
    root = create(<Tree />);
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  view = undefined;
  h.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("publishes a completed newer install even when queued exact recovery fails", async () => {
  vi.setSystemTime(new Date("2026-10-15T10:00:04Z"));
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

/** A newer published version of the same site, as `nextFixture` is for version 8. */
function versionNine() {
  const id = "30000000-0000-4000-8000-000000000099";
  const f = boundFixture({ ...boundManifest, package_id: id, package_version: 9 });
  return {
    ...f,
    site: {
      ...f.site,
      current_package_id: id,
      package: { ...f.site.package, package_id: id, package_version: 9 },
    },
  };
}

/** Version 8 is installed and version 9 is mid-download, held until `release` resolves. */
async function downloadingVersionNine() {
  await act(async () => {
    await latest().download(ids.project, ids.site);
  });
  const f = versionNine();
  mocks.sites = [f.site];
  await act(async () => {
    await latest().refresh(ids.project);
  });
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
  const finish = () =>
    act(async () => {
      release.resolve();
      await pending;
    });
  return { finish };
}

async function rerender() {
  await act(async () => {
    root?.update(<Tree />);
  });
}

function installedVersions() {
  return latest()
    .installed.map((entry) => [entry.identity.packageVersion, entry.status])
    .sort();
}

it("keeps a running download, the installed list and the catalog when the token refreshes", async () => {
  const { finish } = await downloadingVersionNine();
  expect(installedVersions()).toEqual([[8, "verified"]]);
  const catalog = vi.spyOn(PackageOperations.prototype, "catalog");
  const dispose = vi.spyOn(PackageOperations.prototype, "dispose");
  const before = { installed: latest().installed, refresh: latest().refresh };
  // TOKEN_REFRESHED: a new session object, and a new access token, for the same user.
  mocks.auth.session = {};
  mocks.auth.token = "refreshed-token";
  await rerender();
  expect
    .soft({
      download: latest().downloads[ids.site]?.state,
      installedKept: latest().installed === before.installed,
      operationsKept: latest().refresh === before.refresh,
      catalogRuns: catalog.mock.calls.length,
      disposed: dispose.mock.calls.length,
    })
    .toEqual({
      download: "downloading",
      installedKept: true,
      operationsKept: true,
      catalogRuns: 0,
      disposed: 0,
    });
  await finish();
  expect(latest().downloads[ids.site]).toBeUndefined();
  expect(installedVersions()).toEqual([
    [8, "verified"],
    [9, "verified"],
  ]);
});

it("sends the access token the session holds now, not the one it held at the last render", async () => {
  await act(async () => {
    await latest().refresh(ids.project);
  });
  expect(authorizations.at(-1)).toBe("Bearer synthetic-test-token");
  mocks.auth.session = {};
  mocks.auth.token = "refreshed-token";
  await rerender();
  await act(async () => {
    await latest().refresh(ids.project);
  });
  expect(authorizations.at(-1)).toBe("Bearer refreshed-token");
});

it("disposes the running operations when the observer signs out", async () => {
  const { finish } = await downloadingVersionNine();
  const dispose = vi.spyOn(PackageOperations.prototype, "dispose");
  mocks.auth.userId = null;
  mocks.auth.session = null;
  await rerender();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(latest().downloads).toEqual({});
  expect(latest().installed).toEqual([]);
  expect(latest().signedIn).toBe(false);
  await finish();
  // The aborted download installed nothing: only version 8 is on the device for the account.
  expect(latest().installed).toEqual([]);
  expect((await h.operations.catalog()).map((entry) => entry.identity.packageVersion)).toEqual([8]);
});

it("disposes the running operations when the same account loses its session", async () => {
  const { finish } = await downloadingVersionNine();
  const dispose = vi.spyOn(PackageOperations.prototype, "dispose");
  mocks.auth.session = null;
  await rerender();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(latest().downloads).toEqual({});
  expect(latest().signedIn).toBe(false);
  await finish();
  expect((await h.operations.catalog()).map((entry) => entry.identity.packageVersion)).toEqual([8]);
});

it("starts over when a different user signs in", async () => {
  const { finish } = await downloadingVersionNine();
  const dispose = vi.spyOn(PackageOperations.prototype, "dispose");
  const catalog = vi.spyOn(PackageOperations.prototype, "catalog");
  mocks.auth.userId = ids.zone;
  mocks.auth.session = {};
  await rerender();
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(catalog).toHaveBeenCalledTimes(1);
  expect(latest().downloads).toEqual({});
  expect(latest().installed).toEqual([]);
  expect(latest().signedIn).toBe(true);
  await finish();
  // The first user's download never lands in the second user's list.
  expect(latest().installed).toEqual([]);
  expect(latest().downloads).toEqual({});
});
