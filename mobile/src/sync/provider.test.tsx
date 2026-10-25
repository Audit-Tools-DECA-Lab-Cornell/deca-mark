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

describe("Retry timing in the SyncProvider (MOB-39)", () => {
  const online = { isConnected: true, isInternetReachable: true } as const;
  const offline = { isConnected: false, isInternetReachable: false } as const;
  const rateLimited = (seconds: number) =>
    new Response(
      JSON.stringify({ error: { code: "rate_limited", message: "Slow down", details: {} } }),
      { status: 429, headers: { "Retry-After": String(seconds) } },
    );

  /** Many microtask turns: a drain, its write and the next timer all settle inside one act. */
  async function settle() {
    await act(async () => {
      for (let i = 0; i < 80; i++) await Promise.resolve();
    });
  }
  async function pass(ms: number) {
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
    await settle();
  }
  /** The server answers as `respond` says and every request's clock is recorded. */
  function serve(respond: (index: number) => Response) {
    const sent: number[] = [];
    vi.stubGlobal("fetch", async () => {
      sent.push(Date.now());
      return respond(sent.length);
    });
    return sent;
  }
  async function mountOnline() {
    const { db, sqlite } = await memoryDatabase();
    mocks.database = db;
    await installPackage(db, owner, entry);
    await saveObservation(db, boundRecord, owner);
    return { db, sqlite };
  }
  /** Every statement the provider runs on the database from now on (reads, writes and transactions). */
  function watchQueries(db: LocalDatabase) {
    const spies = [
      vi.spyOn(db, "getAllAsync"),
      vi.spyOn(db, "runAsync"),
      vi.spyOn(db, "execAsync"),
    ];
    return {
      reset: () => {
        for (const spy of spies) spy.mockClear();
      },
      count: () => spies.reduce((total, spy) => total + spy.mock.calls.length, 0),
    };
  }
  async function start() {
    await act(async () => {
      view = create(<Tree />);
    });
    await act(async () => mocks.network(online));
    await settle();
  }
  const state = (sqlite: Awaited<ReturnType<typeof memoryDatabase>>["sqlite"]) =>
    sqlite
      .prepare("SELECT sync_state AS state, attempts, next_attempt_at AS at FROM observations")
      .get() as {
      state: string;
      attempts: number;
      at: number;
    };

  it.each([
    "reconnect",
    "resume",
  ])("after seven failures a %s uploads at once instead of 300 s later (C09)", async (wake) => {
    const { sqlite } = await mountOnline();
    let healthy = false;
    const sent = serve(() => (healthy ? answer() : new Response("", { status: 503 })));
    try {
      await start();
      expect(sent).toHaveLength(1);
      sqlite.exec(`UPDATE observations SET attempts = 7, next_attempt_at = ${Date.now() + 300000}`);
      await pass(10000);
      expect(sent).toHaveLength(1);
      const before = sync.revision;
      healthy = true;
      if (wake === "reconnect") {
        await act(async () => {
          mocks.network(offline);
          mocks.network(online);
        });
      } else {
        mocks.app = "background";
        await act(async () => mocks.foreground("background"));
        mocks.app = "active";
        await act(async () => mocks.foreground("active"));
      }
      await settle();
      expect(sent).toHaveLength(2);
      expect(state(sqlite).state).toBe("synced");
      expect(sync.revision).toBeGreaterThan(before);
    } finally {
      sqlite.close();
    }
  });

  it("does nothing while idle: no re-read signal and no upload for a minute (C15)", async () => {
    const { sqlite } = await mountOnline();
    sqlite.exec("DELETE FROM observations");
    const sent = serve(() => answer());
    try {
      await start();
      expect(sync.revision).toBe(0);
      await pass(60000);
      expect(sync.revision).toBe(0);
      expect(sent).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });

  it("does nothing while a record waits out its delay, then retries without any user action", async () => {
    const { sqlite } = await mountOnline();
    const sent = serve((index) => (index < 3 ? new Response("", { status: 503 }) : answer()));
    try {
      await start();
      const first = sent[0] ?? 0;
      const revision = sync.revision;
      await pass(4999);
      expect(sent).toHaveLength(1);
      await pass(1);
      expect(sent).toHaveLength(2);
      expect(sync.revision).toBe(revision);
      await pass(9999);
      expect(sent).toHaveLength(2);
      await pass(1);
      expect(sent.map((at) => at - first)).toEqual([0, 5000, 15000]);
      expect(state(sqlite).state).toBe("synced");
      const done = sync.revision;
      await pass(60000);
      expect(sync.revision).toBe(done);
      expect(sent).toHaveLength(3);
    } finally {
      sqlite.close();
    }
  });

  it("never retries a failed record more than once per 5 s however often the network flaps", async () => {
    const { sqlite } = await mountOnline();
    const sent = serve(() => new Response("", { status: 503 }));
    try {
      await start();
      for (let second = 0; second < 60; second++) {
        await act(async () => {
          mocks.network(offline);
          mocks.network(online);
        });
        await pass(1000);
      }
      const gaps = sent.slice(1).map((at, index) => at - (sent[index] ?? 0));
      expect(sent.length).toBeGreaterThan(3);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(5000);
      expect(sent.length).toBeLessThanOrEqual(13);
    } finally {
      sqlite.close();
    }
  });

  it("a flap right after a failed retry still gets its retry within 5 s", async () => {
    const { sqlite } = await mountOnline();
    let healthy = false;
    const sent = serve(() => (healthy ? answer() : new Response("", { status: 503 })));
    try {
      await start();
      sqlite.exec(`UPDATE observations SET attempts = 7, next_attempt_at = ${Date.now() + 300000}`);
      await pass(20000);
      await act(async () => {
        mocks.network(offline);
        mocks.network(online);
      });
      await settle();
      expect(sent).toHaveLength(2);
      await act(async () => {
        mocks.network(offline);
        mocks.network(online);
      });
      await settle();
      expect(sent).toHaveLength(2);
      healthy = true;
      await pass(5000);
      expect(sent).toHaveLength(3);
      expect(state(sqlite).state).toBe("synced");
    } finally {
      sqlite.close();
    }
  });

  it("a reconnect leaves a record the server told to wait until the server's time", async () => {
    const { sqlite } = await mountOnline();
    let healthy = false;
    const sent = serve(() => (healthy ? answer() : rateLimited(120)));
    try {
      await start();
      const first = sent[0] ?? 0;
      expect(sent).toHaveLength(1);
      await pass(10000);
      await act(async () => {
        mocks.network(offline);
        mocks.network(online);
      });
      await pass(60000);
      expect(sent).toHaveLength(1);
      mocks.app = "background";
      await act(async () => mocks.foreground("background"));
      mocks.app = "active";
      await act(async () => mocks.foreground("active"));
      await pass(48000);
      expect(sent).toHaveLength(1);
      healthy = true;
      await pass(2000);
      expect(sent).toHaveLength(2);
      expect((sent[1] ?? 0) - first).toBe(120000);
      expect(state(sqlite).state).toBe("synced");
    } finally {
      sqlite.close();
    }
  });

  it("a token refresh inside a Retry-After window does not release the record early", async () => {
    const { sqlite } = await mountOnline();
    let healthy = false;
    const sent = serve(() => (healthy ? answer() : rateLimited(120)));
    try {
      await start();
      const first = sent[0] ?? 0;
      await pass(10000);
      mocks.token = "refreshed-token";
      await act(async () => view?.update(<Tree />));
      await act(async () => mocks.network(online));
      await settle();
      expect(sent).toHaveLength(1);
      healthy = true;
      await pass(109999);
      expect(sent).toHaveLength(1);
      await pass(1);
      expect(sent).toHaveLength(2);
      expect((sent[1] ?? 0) - first).toBe(120000);
      expect(state(sqlite).state).toBe("synced");
    } finally {
      sqlite.close();
    }
  });

  it("a network flap while signing out does not delay the first upload after the next sign-in", async () => {
    const { sqlite } = await mountOnline();
    let healthy = false;
    const sent = serve(() => (healthy ? answer() : new Response("", { status: 503 })));
    try {
      await start();
      sqlite.exec(`UPDATE observations SET attempts = 7, next_attempt_at = ${Date.now() + 300000}`);
      await pass(10000);
      await act(async () => {
        mocks.network(offline);
        mocks.network(online);
      });
      await settle();
      expect(sent).toHaveLength(2);
      mocks.signedIn = false;
      await act(async () => view?.update(<Tree />));
      await act(async () => {
        mocks.network(offline);
        mocks.network(online);
      });
      await pass(1000);
      expect(sent).toHaveLength(2);
      healthy = true;
      mocks.signedIn = true;
      await act(async () => view?.update(<Tree />));
      await act(async () => mocks.network(online));
      await settle();
      expect(sent).toHaveLength(3);
      expect(state(sqlite).state).toBe("synced");
    } finally {
      sqlite.close();
    }
  });

  it("tries a pass that threw again after 5 s, and keeps the record", async () => {
    const { sqlite } = await mountOnline();
    const times: number[] = [];
    vi.stubGlobal("fetch", async (request: Request) => {
      times.push(Date.now());
      if (times.length < 3) throw new Error("storage is busy");
      return answer(request.url.split("/").at(-1));
    });
    try {
      await start();
      expect(times).toHaveLength(1);
      expect(sync.error).toBe("storage is busy");
      await pass(4999);
      expect(times).toHaveLength(1);
      await pass(1);
      expect(times).toHaveLength(2);
      await pass(5000);
      expect(times.map((at) => at - (times[0] ?? 0))).toEqual([0, 5000, 10000]);
      expect(state(sqlite).state).toBe("synced");
      await pass(60000);
      expect(times).toHaveLength(3);
    } finally {
      sqlite.close();
    }
  });

  it("wakes a record whose delay ran out while a slower record was uploading", async () => {
    const { db, sqlite } = await mountOnline();
    const second = "60000000-0000-4000-8000-000000000002";
    await saveObservation(db, { ...boundRecord, id: second }, owner);
    const sent: { id: string; at: number }[] = [];
    let healthy = false;
    vi.stubGlobal("fetch", async (request: Request) => {
      const id = request.url.split("/").at(-1) ?? "";
      sent.push({ id, at: Date.now() });
      if (id === second) {
        await new Promise((resolve) => setTimeout(resolve, 6000));
        return answer(id);
      }
      return healthy ? answer(id) : new Response("", { status: 503 });
    });
    try {
      await start();
      await pass(6000);
      expect(sent.map((item) => item.id)).toEqual([boundRecord.id, second]);
      healthy = true;
      await pass(1000);
      expect(sent.map((item) => item.id)).toEqual([boundRecord.id, second, boundRecord.id]);
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM observations WHERE sync_state = 'synced'")
          .get()?.["count"],
      ).toBe(2);
    } finally {
      sqlite.close();
    }
  });

  it("an idle queue with a record stuck due does not spin", async () => {
    const { db, sqlite } = await mountOnline();
    const sent = serve(() => answer());
    sqlite.exec("UPDATE observations SET payload = json_remove(payload, '$.uploadBody')");
    const queries = watchQueries(db);
    try {
      await start();
      // The one look after the immediate wake settles; nothing may touch the database after it.
      await pass(1);
      const revision = sync.revision;
      queries.reset();
      await pass(60000);
      expect(queries.count()).toBe(0);
      expect(sent).toHaveLength(0);
      expect(sync.revision).toBe(revision);
    } finally {
      sqlite.close();
    }
  });

  it("a record stuck due does not hide the retry of another record", async () => {
    const { db, sqlite } = await mountOnline();
    const second = "60000000-0000-4000-8000-000000000002";
    await saveObservation(db, { ...boundRecord, id: second }, owner);
    sqlite
      .prepare(
        "UPDATE observations SET payload = json_remove(payload, '$.uploadBody') WHERE id = ?",
      )
      .run(boundRecord.id);
    const sent: number[] = [];
    vi.stubGlobal("fetch", async (request: Request) => {
      const id = request.url.split("/").at(-1) ?? "";
      sent.push(Date.now());
      return sent.length === 1 ? new Response("", { status: 503 }) : answer(id);
    });
    try {
      await start();
      await pass(1);
      expect(sent).toHaveLength(1);
      await pass(5000);
      expect(sent).toHaveLength(2);
      expect(
        sqlite.prepare("SELECT sync_state AS state FROM observations WHERE id = ?").get(second),
      ).toEqual({ state: "synced" });
    } finally {
      sqlite.close();
    }
  });

  it("a stuck record does not hide an overdue failed record after a slow upload", async () => {
    const { db, sqlite } = await mountOnline();
    const failing = "60000000-0000-4000-8000-000000000002";
    const slow = "60000000-0000-4000-8000-000000000003";
    // The record saved first can never be sent (its upload body is gone) and stays the earliest.
    sqlite
      .prepare(
        "UPDATE observations SET payload = json_remove(payload, '$.uploadBody') WHERE id = ?",
      )
      .run(boundRecord.id);
    const sent: { id: string; at: number }[] = [];
    let healthy = false;
    vi.stubGlobal("fetch", async (request: Request) => {
      const id = request.url.split("/").at(-1) ?? "";
      sent.push({ id, at: Date.now() });
      if (id === slow) {
        await new Promise((resolve) => setTimeout(resolve, 6000));
        return answer(id);
      }
      return healthy ? answer(id) : new Response("", { status: 503 });
    });
    try {
      await start();
      await pass(1);
      expect(sent).toHaveLength(0);
      await saveObservation(db, { ...boundRecord, id: failing }, owner);
      await saveObservation(db, { ...boundRecord, id: slow }, owner);
      await act(async () => sync.wake());
      await pass(6000);
      // One failure, then a 6 s upload that outlasts the failed record's delay.
      expect(sent.map((item) => item.id)).toEqual([failing, slow]);
      healthy = true;
      await pass(1000);
      expect(sent.map((item) => item.id)).toEqual([failing, slow, failing]);
      expect(
        sqlite
          .prepare("SELECT id, sync_state AS state FROM observations ORDER BY id")
          .all()
          .map((row) => row["state"]),
      ).toEqual(["pending", "synced", "synced"]);
      // The stuck record is left alone: nothing more is sent however long the queue then waits.
      await pass(120000);
      expect(sent).toHaveLength(3);
    } finally {
      sqlite.close();
    }
  });

  it("after a 401 nothing wakes the queue until the token changes (no timers, no queries)", async () => {
    const { db, sqlite } = await mountOnline();
    let healthy = false;
    const sent = serve(() => (healthy ? answer() : new Response("", { status: 401 })));
    const queries = watchQueries(db);
    try {
      await start();
      expect(sent).toHaveLength(1);
      expect(sync.error).toContain("Sign in");
      queries.reset();
      await pass(60000);
      expect(queries.count()).toBe(0);
      expect(sent).toHaveLength(1);
      healthy = true;
      mocks.token = "refreshed-token";
      await act(async () => view?.update(<Tree />));
      await act(async () => mocks.network(online));
      await settle();
      expect(sent).toHaveLength(2);
      expect(state(sqlite).state).toBe("synced");
    } finally {
      sqlite.close();
    }
  });

  it("a Retry-After longer than a timer can hold waits for the server's time, not at once", async () => {
    const { db, sqlite } = await mountOnline();
    let healthy = false;
    const sent = serve(() => (healthy ? answer() : rateLimited(2500000)));
    const queries = watchQueries(db);
    try {
      await start();
      expect(sent).toHaveLength(1);
      queries.reset();
      await pass(1000);
      expect(sent).toHaveLength(1);
      expect(queries.count()).toBeLessThan(10);
      healthy = true;
      await pass(2499998999);
      expect(sent).toHaveLength(1);
      await pass(1);
      expect(sent).toHaveLength(2);
      expect(state(sqlite).state).toBe("synced");
    } finally {
      sqlite.close();
    }
  });

  it("closing and reopening the app inside a Retry-After window does not upload early", async () => {
    const { sqlite } = await mountOnline();
    let healthy = false;
    const sent = serve(() => (healthy ? answer() : rateLimited(120)));
    try {
      await start();
      const first = sent[0] ?? 0;
      await pass(10000);
      await act(async () => {
        view?.unmount();
      });
      view = undefined;
      await act(async () => {
        view = create(<Tree />);
      });
      await act(async () => mocks.network(online));
      await settle();
      expect(sent).toHaveLength(1);
      healthy = true;
      await pass(109999);
      expect(sent).toHaveLength(1);
      await pass(1);
      expect(sent).toHaveLength(2);
      expect((sent[1] ?? 0) - first).toBe(120000);
      expect(state(sqlite).state).toBe("synced");
    } finally {
      sqlite.close();
    }
  });

  it("a pass that stored a change and then threw still refreshes the screens", async () => {
    const { db, sqlite } = await mountOnline();
    const second = "60000000-0000-4000-8000-000000000002";
    await saveObservation(db, { ...boundRecord, id: second }, owner);
    vi.stubGlobal("fetch", async (request: Request) => {
      const id = request.url.split("/").at(-1) ?? "";
      if (id === second) throw new Error("storage is busy");
      return answer(id);
    });
    try {
      await start();
      expect(sync.error).toBe("storage is busy");
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM observations WHERE sync_state = 'synced'")
          .get()?.["count"],
      ).toBe(1);
      expect(sync.revision).toBeGreaterThan(0);
    } finally {
      sqlite.close();
    }
  });

  it("stops uploading and waiting on sign-out", async () => {
    const { sqlite } = await mountOnline();
    const sent = serve(() => new Response("", { status: 503 }));
    try {
      await start();
      expect(sent).toHaveLength(1);
      mocks.signedIn = false;
      await act(async () => view?.update(<Tree />));
      await pass(60000);
      expect(sent).toHaveLength(1);
    } finally {
      sqlite.close();
    }
  });
});
