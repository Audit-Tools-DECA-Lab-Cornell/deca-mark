import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDatabase } from "../storage/observation-store";
import { saveObservation } from "../storage/observation-store";
import { installPackage } from "../storage/package-catalog";
import { boundRecord, entry, memoryDatabase, owner } from "../storage/package-store.fixture";
import { receipt, scope } from "./bound-upload.fixture";
import { SyncProvider, useSync } from "./provider";

const mocks = vi.hoisted(() => {
  const database: { database: LocalDatabase | null } = { database: null };
  return {
    ...database,
    accountKey: "",
    userId: "40000000-0000-4000-8000-000000000001",
    signedIn: true,
    token: "token",
    app: "active",
    foreground: (_value: string) => {},
    network: (_value: { isConnected: boolean; isInternetReachable: boolean }) => {},
    getSession: vi.fn(),
    deleted: vi.fn(),
  };
});
vi.mock("expo-sqlite", () => ({ useSQLiteContext: () => mocks.database }));
vi.mock("react-native", () => ({
  AppState: {
    get currentState() {
      return mocks.app;
    },
    addEventListener: (_event: string, listener: typeof mocks.foreground) => {
      mocks.foreground = listener;
      return { remove: vi.fn() };
    },
  },
}));
vi.mock("@react-native-community/netinfo", () => ({
  default: {
    addEventListener: (listener: typeof mocks.network) => {
      mocks.network = listener;
      return vi.fn();
    },
  },
}));
vi.mock("./config", () => ({ connection: { apiUrl: "https://api.synthetic.invalid" } }));
const client = { auth: { getSession: mocks.getSession } };
vi.mock("../auth/provider", () => ({
  useAccount: () => ({
    key: mocks.accountKey,
    scope: { ...scope, userId: mocks.userId },
    session: mocks.signedIn ? { user: { id: mocks.userId }, access_token: mocks.token } : null,
    client,
    ready: true,
    accountDeleted: false,
    markAccountDeleted: mocks.deleted,
  }),
}));
let view: ReactTestRenderer | undefined;
let sync: ReturnType<typeof useSync>;
function Probe() {
  sync = useSync();
  return null;
}
function Tree() {
  return (
    <SyncProvider>
      <Probe />
    </SyncProvider>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  mocks.accountKey = owner;
  mocks.userId = scope.userId;
  mocks.signedIn = true;
  mocks.token = "token";
  mocks.app = "active";
  mocks.getSession.mockImplementation(async () => ({
    data: { session: { user: { id: mocks.userId }, access_token: mocks.token } },
  }));
});
afterEach(async () => {
  await act(async () => {
    view?.unmount();
  });
  view = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function flush() {
  await act(async () => {
    for (let i = 0; i < 12; i++) await Promise.resolve();
  });
}
function answer(id = boundRecord.id) {
  return new Response(JSON.stringify({ ...receipt, observation_id: id }));
}

describe("Actual foreground SyncProvider", () => {
  it("holds offline, uploads on reconnect, wakes after save and resumes foreground without duplicate drains", async () => {
    const { db, sqlite } = await memoryDatabase();
    mocks.database = db;
    const sent: string[] = [];
    vi.stubGlobal("fetch", async (request: Request) => {
      sent.push(request.url);
      return answer(request.url.split("/").at(-1));
    });
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      await act(async () => {
        view = create(<Tree />);
      });
      await act(async () => mocks.network({ isConnected: false, isInternetReachable: false }));
      await flush();
      expect(sent).toHaveLength(0);
      await act(async () => {
        mocks.network({ isConnected: true, isInternetReachable: true });
        mocks.network({ isConnected: true, isInternetReachable: true });
      });
      await flush();
      expect(sent).toHaveLength(1);
      const next = { ...boundRecord, id: "60000000-0000-4000-8000-000000000002" };
      await saveObservation(db, next, owner);
      await act(async () => {
        sync.wake();
        sync.wake();
      });
      await flush();
      expect(sent).toHaveLength(2);
      mocks.app = "background";
      await act(async () => mocks.foreground("background"));
      await saveObservation(db, { ...next, id: "60000000-0000-4000-8000-000000000003" }, owner);
      await act(async () => sync.wake());
      await flush();
      expect(sent).toHaveLength(2);
      mocks.app = "active";
      await act(async () => mocks.foreground("active"));
      await flush();
      expect(sent).toHaveLength(3);
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM observations WHERE sync_state = 'synced'")
          .get()?.["count"],
      ).toBe(3);
    } finally {
      await act(async () => view?.unmount());
      view = undefined;
      sqlite.close();
    }
  });
  it.each([
    "background",
    "offline",
  ])("cancels an in-flight request on %s and resumes the same body", async (pause) => {
    const { db, sqlite } = await memoryDatabase();
    mocks.database = db;
    let release: (value: Response) => void = () => {};
    const delayed = new Promise<Response>((resolve) => {
      release = resolve;
    });
    let firstSignal: AbortSignal | undefined;
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (request: Request) => {
      bodies.push(await request.clone().text());
      if (bodies.length === 1) {
        firstSignal = request.signal;
        return delayed;
      }
      return answer();
    });
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      await act(async () => {
        view = create(<Tree />);
      });
      await act(async () => mocks.network({ isConnected: true, isInternetReachable: true }));
      await flush();
      expect(bodies).toHaveLength(1);
      await act(async () => {
        if (pause === "background") mocks.foreground("background");
        else mocks.network({ isConnected: false, isInternetReachable: false });
      });
      expect(firstSignal?.aborted).toBe(true);
      release(answer());
      await flush();
      expect(sqlite.prepare("SELECT sync_state FROM observations").get()).toEqual({
        sync_state: "pending",
      });
      await act(async () => {
        if (pause === "background") mocks.foreground("active");
        else mocks.network({ isConnected: true, isInternetReachable: true });
      });
      await flush();
      expect(bodies).toEqual([bodies[0], bodies[0]]);
      expect(sqlite.prepare("SELECT sync_state FROM observations").get()).toEqual({
        sync_state: "synced",
      });
    } finally {
      release(answer());
      await act(async () => view?.unmount());
      view = undefined;
      sqlite.close();
    }
  });
  it("pauses after 401 until the session changes and explicit retry preserves the body", async () => {
    const { db, sqlite } = await memoryDatabase();
    mocks.database = db;
    let calls = 0;
    vi.stubGlobal("fetch", async () => {
      calls++;
      return calls === 1 ? new Response("", { status: 401 }) : answer();
    });
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      await act(async () => {
        view = create(<Tree />);
        mocks.network({ isConnected: true, isInternetReachable: true });
      });
      await act(async () => mocks.network({ isConnected: true, isInternetReachable: true }));
      await flush();
      expect(calls).toBe(1);
      await act(async () => {
        vi.advanceTimersByTime(60000);
        sync.wake();
      });
      await flush();
      expect(calls).toBe(1);
      expect(sync.error).toContain("Sign in");
      mocks.token = "refreshed-token";
      await act(async () => view?.update(<Tree />));
      await act(async () => mocks.network({ isConnected: true, isInternetReachable: true }));
      await act(async () => sync.retry());
      await flush();
      expect(calls).toBe(2);
      expect(sqlite.prepare("SELECT sync_state FROM observations").get()?.["sync_state"]).toBe(
        "synced",
      );
    } finally {
      await act(async () => view?.unmount());
      view = undefined;
      sqlite.close();
    }
  });
});
