import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MeProvider, useMe } from "./me-provider";

const userA = "50000000-0000-4000-8000-000000000055";
const userB = "40000000-0000-4000-8000-000000000044";

const mocks = vi.hoisted(() => {
  const auth: {
    account: { id: string } | null;
    session: object | null;
    markAccountDeleted: () => void;
  } = { account: null, session: null, markAccountDeleted: () => {} };
  return {
    auth,
    client: {
      auth: {
        getSession: async () => ({
          data: {
            session: auth.session
              ? { user: { id: auth.account?.id }, access_token: "token" }
              : null,
          },
        }),
      },
    },
    cache: new Map<string, string>(),
    deleted: false,
  };
});

vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
vi.mock("../../auth/provider", () => ({
  useAccount: () => ({
    account: mocks.auth.account,
    client: mocks.client,
    session: mocks.auth.session,
    restored: true,
    markAccountDeleted: mocks.auth.markAccountDeleted,
  }),
}));
vi.mock("../../platform/config", () => ({
  connection: { apiUrl: "https://api.example.test", supabaseUrl: "https://auth.example.test" },
}));
vi.mock("./me-file", () => ({
  meFileStore: (_issuer: string, user: string) => ({
    read: () => {
      const text = mocks.cache.get(user);
      return text ? JSON.parse(text) : null;
    },
    write: (snapshot: unknown) => mocks.cache.set(user, JSON.stringify(snapshot)),
  }),
}));

let root: ReactTestRenderer | undefined;
let reads: string[] = [];
const values: ReturnType<typeof useMe>[] = [];

function Probe() {
  values.push(useMe());
  return null;
}
function Tree() {
  return (
    <MeProvider>
      <Probe />
    </MeProvider>
  );
}
function latest() {
  const value = values.at(-1);
  if (!value) throw new Error("Provider missing");
  return value;
}
function identity(user: string) {
  return {
    profile: {
      user_id: user,
      display_name: null,
      observer_initials: null,
      locale: null,
      created_at: "2026-10-11T10:00:00Z",
    },
    organization_memberships: [],
    project_memberships: [],
  };
}
async function rerender() {
  await act(async () => {
    root?.update(<Tree />);
  });
}
/** Signs in as `user` with a session the way `onAuthStateChange` would hand it over. */
function signIn(user: string) {
  mocks.auth.account = { id: user };
  mocks.auth.session = {};
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  reads = [];
  values.length = 0;
  mocks.cache.clear();
  mocks.deleted = false;
  mocks.auth.markAccountDeleted = vi.fn();
  signIn(userA);
  vi.stubGlobal("fetch", async (request: Request) => {
    reads.push(`${request.method} ${new URL(request.url).pathname}`);
    return mocks.deleted
      ? new Response(
          JSON.stringify({
            error: { code: "account_deleted", message: "Synthetic deleted", details: {} },
          }),
          { status: 403 },
        )
      : new Response(JSON.stringify(identity(mocks.auth.account?.id ?? userA)), {
          headers: { "Content-Type": "application/json" },
        });
  });
  await act(async () => {
    root = create(<Tree />);
  });
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  vi.unstubAllGlobals();
});

it("reads /v1/me once at sign-in", async () => {
  expect(reads).toEqual(["GET /v1/me"]);
  expect(latest()).toMatchObject({ ready: true, profile: { user_id: userA } });
});

it("keeps what it knows and does not read /v1/me again when the token refreshes", async () => {
  const before = values.length;
  // TOKEN_REFRESHED: a new session object and, because the account is the session's user, a new
  // `markAccountDeleted` callback, for the same user.
  mocks.auth.session = {};
  mocks.auth.markAccountDeleted = vi.fn();
  await rerender();
  expect(reads).toEqual(["GET /v1/me"]);
  for (const value of values.slice(before))
    expect(value).toMatchObject({ ready: true, profile: { user_id: userA } });
});

it("calls the newest markAccountDeleted when the server reports the account deleted", async () => {
  const stale = mocks.auth.markAccountDeleted;
  const newest = vi.fn();
  mocks.auth.session = {};
  mocks.auth.markAccountDeleted = newest;
  await rerender();
  mocks.deleted = true;
  await act(async () => {
    await latest().refresh();
  });
  expect(reads).toEqual(["GET /v1/me", "GET /v1/me"]);
  expect(newest).toHaveBeenCalledTimes(1);
  expect(stale).not.toHaveBeenCalled();
});

it("starts over for a different account and hides the first account's profile at once", async () => {
  const before = values.length;
  signIn(userB);
  await rerender();
  expect(values[before]).toMatchObject({ ready: false, profile: null });
  expect(latest()).toMatchObject({ ready: true, profile: { user_id: userB } });
  expect(reads).toEqual(["GET /v1/me", "GET /v1/me"]);
});

it("reads nothing and shows no profile once the observer signs out", async () => {
  mocks.auth.account = null;
  mocks.auth.session = null;
  await rerender();
  expect(latest()).toMatchObject({ ready: true, profile: null });
  expect(reads).toEqual(["GET /v1/me"]);
});

it("reads again when the same account gets a session back after losing it", async () => {
  mocks.auth.session = null;
  await rerender();
  expect(reads).toEqual(["GET /v1/me"]);
  expect(latest()).toMatchObject({ ready: true, profile: { user_id: userA } });
  mocks.auth.session = {};
  await rerender();
  expect(reads).toEqual(["GET /v1/me", "GET /v1/me"]);
});
