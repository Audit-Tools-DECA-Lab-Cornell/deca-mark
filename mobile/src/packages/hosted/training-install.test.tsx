import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "../../data/api/client";
import type { LocalDatabase } from "../../storage/observation-store";
import { listCatalog } from "../../storage/package-catalog";
import { boundFixture, ids } from "./bound-fixture.test-helper";
import type { HostedValue } from "./context";
import type { ImmutablePackageFiles } from "./installation";
import { harness, hash, issuer, otherOwner, owner } from "./lifecycle.test-helper";
import type { PackageSource } from "./prepare";
import { HostedSitesProvider, useHostedSites } from "./provider";
import type { HostedSite } from "./schemas";

/**
 * MOB-43: Training's Practice garden installs like any other site, and a site whose served form this
 * build cannot read is refused with "Update DECA Mark to use this form" and nothing of it is installed.
 * The form comes through the real API client from a stubbed `GET /form-versions/{code}`, so what the
 * server serves (or leaves out) is what the install reads.
 */

const mocks = vi.hoisted(() => {
  const fields: {
    database: LocalDatabase | null;
    files: ImmutablePackageFiles | null;
    source: PackageSource | null;
    sites: HostedSite[];
    projects: { project_id: string; is_training: boolean }[];
  } = { database: null, files: null, source: null, sites: [], projects: [] };
  return { ...fields };
});
vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => mocks.database }));
vi.mock("expo-crypto", () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock("react-native", () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) } }));
// One object for each, so the provider's effects do not run again on every render.
vi.mock("../../auth/provider", () => {
  const account = {
    key: owner,
    scope: { issuer },
    account: { id: ids.form },
    client: {
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: ids.form }, access_token: "synthetic-test-token" } },
        }),
      },
    },
    session: {},
  };
  return { useAccount: () => account };
});
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
  readSiteList: () => null,
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
function latest() {
  if (!view) throw new Error("Provider missing");
  return view;
}

/** The schema version `GET /v1/projects/{project}/form-versions/{code}` serves; `undefined` leaves it out. */
let servedVersion: unknown;
function serve(schemaVersion: unknown) {
  servedVersion = schemaVersion;
}

/** Mounts the provider for an account whose only project is Training (a fresh account) or another. */
async function mount(isTraining: boolean) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  h = await harness();
  const fixture = boundFixture();
  const api = createApiClient("https://api.example.test", async () => "synthetic-test-token");
  mocks.database = h.database;
  mocks.files = h.files;
  mocks.sites = [fixture.site];
  mocks.projects = [{ project_id: ids.project, is_training: isTraining }];
  mocks.source = {
    ...fixture.source,
    formVersion: (code) => api.formVersion(ids.project, code, new AbortController().signal),
  };
  vi.stubGlobal("fetch", async (request: Request) => {
    const { pathname } = new URL(request.url);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    if (pathname.endsWith("/sites")) return json(mocks.sites);
    const code = pathname.split("/form-versions/")[1];
    if (code) {
      const { schema_version: _fixture, ...served } = await fixture.source.formVersion(
        decodeURIComponent(code),
      );
      return json(
        servedVersion === undefined ? served : { ...served, schema_version: servedVersion },
      );
    }
    return new Response(
      JSON.stringify({ error: { code: "not_found", message: "x", details: {} } }),
      {
        status: 404,
      },
    );
  });
  await act(async () => {
    root = create(
      <HostedSitesProvider>
        <Probe />
      </HostedSitesProvider>,
    );
  });
}
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  view = undefined;
  h.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function download() {
  await act(async () => {
    await latest().download(ids.project, ids.site);
  });
}
async function nothingInstalled() {
  expect(latest().installed).toEqual([]);
  expect(await listCatalog(h.database, owner, ids.project)).toEqual([]);
  expect(h.files.staged()).toEqual([]);
  expect(await listCatalog(h.database, otherOwner, ids.project)).toEqual([]);
}

describe.each([
  ["Training", true],
  ["a project a manager created", false],
])("a site of %s", (_project, isTraining) => {
  beforeEach(() => mount(isTraining));

  it("is listed for the account to download", async () => {
    serve(2);
    expect(latest().sites[ids.project]).toMatchObject([{ site_id: ids.site }]);
  });

  it("installs when its form is served with schema version 2", async () => {
    serve(2);
    await download();
    expect(latest().downloads[ids.site]).toBeUndefined();
    expect(latest().installed).toMatchObject([
      { identity: { projectId: ids.project }, status: "verified" },
    ]);
    expect(await listCatalog(h.database, owner, ids.project)).toHaveLength(1);
  });

  it.each([
    ["an unknown schema version (3)", 3],
    ["a schema version this build no longer reads (1)", 1],
    ["no schema version", undefined],
    ["a schema version that is not a number", "2"],
  ])("is refused with 'Update DECA Mark to use this form' and nothing installed when its form is served with %s", async (_name, version) => {
    serve(version);
    await download();
    expect(latest().downloads[ids.site]).toMatchObject({
      state: "verify_failed",
      message: expect.stringContaining("Update DECA Mark to use this form."),
    });
    await nothingInstalled();
  });
});
