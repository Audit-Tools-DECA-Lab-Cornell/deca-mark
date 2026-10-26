import { describe, expect, it } from "vitest";
import { databaseWrite } from "../storage/database-write";
import { initializeDatabase, saveObservation } from "../storage/observation-store";
import { installPackage } from "../storage/package-catalog";
import {
  binding,
  boundRecord,
  entry,
  memoryDatabase,
  owner,
} from "../storage/package-store.fixture";
import { retryAttention } from "../storage/sync-store";
import { syncScopeSchema, type UploadResult } from "./contracts";
import { createSyncCoordinator } from "./coordinator";
import { FailedAfterChange } from "./foreground";
import { serializeBoundObservation } from "./wire-body";

const scope = syncScopeSchema.parse({
  apiUrl: "https://api.synthetic.invalid",
  issuer: binding.issuer,
  userId: "40000000-0000-4000-8000-000000000001",
  projectId: "10000000-0000-4000-8000-000000000002",
});
const receipt = {
  observation_id: boundRecord.id,
  project_id: binding.projectId,
  user_id: scope.userId,
  package_id: binding.packageId,
  zone_id: binding.zoneId,
  accepted_revision: 1 as const,
  received_at: "2026-10-15T10:00:00.000Z",
};
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("Pinned bound coordinator", () => {
  it("retries byte-identical bodies with their original UUID after a lost response and restart", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      const bodies: string[] = [];
      let attempts = 0;
      const drain = createSyncCoordinator({
        database: db,
        scope,
        isCurrent: () => true,
        getToken: async () => "token",
        now: () => 0,
        upload: async (record, _token, _signal, body) => {
          bodies.push(body);
          expect(record.id).toBe(boundRecord.id);
          return ++attempts === 1
            ? { kind: "retry", message: "Lost response" }
            : { kind: "accepted", receipt };
        },
      });
      await drain(new AbortController().signal);
      await initializeDatabase(db);
      await retryAttention(db, owner);
      await drain(new AbortController().signal);
      expect(bodies).toEqual([
        serializeBoundObservation(boundRecord),
        serializeBoundObservation(boundRecord),
      ]);
      expect(sqlite.prepare("SELECT sync_state FROM observations").get()?.["sync_state"]).toBe(
        "synced",
      );
    } finally {
      sqlite.close();
    }
  });
  it("preserves state for a mismatched receipt returned by an alternate upload adapter", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      const drain = createSyncCoordinator({
        database: db,
        scope,
        isCurrent: () => true,
        getToken: async () => "token",
        upload: async () => ({
          kind: "accepted",
          receipt: { ...receipt, observation_id: "60000000-0000-4000-8000-000000000002" },
        }),
      });
      await drain(new AbortController().signal);
      expect(sqlite.prepare("SELECT sync_state,server_receipt FROM observations").get()).toEqual({
        sync_state: "pending",
        server_receipt: "",
      });
      expect(sqlite.prepare("SELECT attempts FROM observations").get()).toEqual({ attempts: 1 });
    } finally {
      sqlite.close();
    }
  });
  it("never acquires another account's token for a mismatched storage owner", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      let calls = 0;
      const drain = createSyncCoordinator({
        database: db,
        ownerKey: owner,
        scope: syncScopeSchema.parse({ ...scope, userId: "40000000-0000-4000-8000-000000000002" }),
        isCurrent: () => true,
        getToken: async () => {
          calls++;
          return "wrong-token";
        },
        upload: async () => ({ kind: "accepted", receipt }),
      });
      await drain(new AbortController().signal);
      expect(calls).toBe(0);
    } finally {
      sqlite.close();
    }
  });
  it.each([
    "token",
    "response",
    "queued-write",
  ])("fences account changes during %s", async (phase) => {
    const { db, sqlite } = await memoryDatabase();
    let current = true;
    const waiting = deferred<string | null>();
    const reached = deferred<void>();
    const response = deferred<void>();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      let uploadCalls = 0;
      const drain = createSyncCoordinator({
        database: db,
        scope,
        isCurrent: () => current,
        getToken: async () => {
          if (phase === "token") {
            reached.resolve();
            return waiting.promise;
          }
          return "token";
        },
        upload: async () => {
          uploadCalls++;
          if (phase === "queued-write") {
            void databaseWrite(db, async () => {
              reached.resolve();
              await response.promise;
            });
          } else {
            reached.resolve();
            await response.promise;
          }
          return { kind: "accepted", receipt };
        },
      });
      const run = drain(new AbortController().signal);
      await reached.promise;
      current = false;
      waiting.resolve("late-token");
      response.resolve();
      await run;
      expect(sqlite.prepare("SELECT sync_state,server_receipt FROM observations").get()).toEqual({
        sync_state: "pending",
        server_receipt: "",
      });
      if (phase === "token") expect(uploadCalls).toBe(0);
    } finally {
      sqlite.close();
    }
  });
  it("serializes concurrent drain requests and drains more than one page", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      for (let index = 1; index <= 27; index++)
        await saveObservation(
          db,
          { ...boundRecord, id: `60000000-0000-4000-8000-${String(index).padStart(12, "0")}` },
          owner,
        );
      let calls = 0;
      const drain = createSyncCoordinator({
        database: db,
        scope,
        isCurrent: () => true,
        getToken: async () => "token",
        upload: async (record) => {
          calls++;
          return { kind: "accepted", receipt: { ...receipt, observation_id: record.id } };
        },
      });
      await Promise.all([drain(new AbortController().signal), drain(new AbortController().signal)]);
      expect(calls).toBe(27);
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM observations WHERE sync_state = 'synced'")
          .get()?.["count"],
      ).toBe(27);
    } finally {
      sqlite.close();
    }
  });
});

describe("Retry delays and reconnects (MOB-39)", () => {
  const accepted: UploadResult = { kind: "accepted", receipt };
  const failure: UploadResult = { kind: "retry", message: "timeout" };
  const signal = () => new AbortController().signal;

  /** A coordinator whose clock and answer the test sets; `calls` holds the clock of every upload. */
  async function harness(answer: () => UploadResult = () => failure) {
    const { db, sqlite } = await memoryDatabase();
    await installPackage(db, owner, entry);
    await saveObservation(db, boundRecord, owner);
    const state = { clock: 1_000_000, calls: [] as number[], answer };
    const create = () =>
      createSyncCoordinator({
        database: db,
        scope,
        isCurrent: () => true,
        getToken: async () => "token",
        now: () => state.clock,
        upload: async () => {
          state.calls.push(state.clock);
          return state.answer();
        },
      });
    const row = () =>
      sqlite
        .prepare("SELECT sync_state AS state, attempts, next_attempt_at AS at FROM observations")
        .get() as { state: string; attempts: number; at: number };
    return { db, sqlite, state, drain: create(), create, row };
  }
  /** Fails the upload seven times, each as soon as its delay has run out. */
  async function failSevenTimes(h: Awaited<ReturnType<typeof harness>>) {
    for (let pass = 0; pass < 7; pass++) {
      await h.drain(signal());
      if (pass < 6) h.state.clock = h.row().at;
    }
    expect(h.row()).toMatchObject({ state: "pending", attempts: 7 });
    expect(h.row().at - h.state.clock).toBe(300000);
  }

  it("after seven failures a connectivity wake uploads at once, not 300 s later", async () => {
    const h = await harness();
    try {
      await failSevenTimes(h);
      h.state.clock += 10_000;
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(7);
      h.state.answer = () => accepted;
      h.drain.regain();
      expect(await h.drain(signal())).toBe(true);
      expect(h.state.calls).toHaveLength(8);
      expect(h.row().state).toBe("synced");
    } finally {
      h.sqlite.close();
    }
  });

  it("a wake that is not a reconnect still waits for the delay", async () => {
    const h = await harness();
    try {
      await failSevenTimes(h);
      h.state.clock += 100_000;
      await h.drain(signal());
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(7);
      h.state.clock += 200_000;
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(8);
    } finally {
      h.sqlite.close();
    }
  });

  it("a reconnect leaves a record the server told to wait until the server's time", async () => {
    const h = await harness(() => ({
      kind: "retry",
      code: "rate_limited",
      message: "slow down",
      retryAfter: 120,
    }));
    try {
      const start = h.state.clock;
      await h.drain(signal());
      expect(h.row().at).toBe(start + 120_000);
      for (const later of [10_000, 60_000, 119_000]) {
        h.state.clock = start + later;
        h.drain.regain();
        await h.drain(signal());
      }
      expect(h.state.calls).toEqual([start]);
      h.state.clock = start + 120_000;
      h.state.answer = () => accepted;
      await h.drain(signal());
      expect(h.state.calls).toEqual([start, start + 120_000]);
    } finally {
      h.sqlite.close();
    }
  });

  it("a shorter Retry-After than the retry delay releases the record 5 s after the attempt", async () => {
    const h = await harness();
    try {
      await failSevenTimes(h);
      h.state.answer = () => ({ kind: "retry", code: "rate_limited", message: "x", retryAfter: 2 });
      h.state.clock = h.row().at;
      await h.drain(signal());
      const rateLimitedAt = h.state.clock;
      expect(h.row().at - rateLimitedAt).toBe(300000);
      h.state.clock = rateLimitedAt + 1000;
      h.drain.regain();
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(8);
      h.state.clock = rateLimitedAt + 2000;
      h.drain.regain();
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(8);
      h.state.clock = rateLimitedAt + 5000;
      h.drain.regain();
      h.state.answer = () => accepted;
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(9);
    } finally {
      h.sqlite.close();
    }
  });

  it("reconnects arriving every second never retry a record more than once per 5 s", async () => {
    const h = await harness();
    try {
      const start = h.state.clock;
      for (let second = 0; second <= 60; second++) {
        h.state.clock = start + second * 1000;
        h.drain.regain();
        await h.drain(signal());
      }
      const gaps = h.state.calls.slice(1).map((at, index) => at - (h.state.calls[index] ?? 0));
      expect(h.state.calls.length).toBeGreaterThan(5);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(5000);
      expect(h.state.calls.length).toBeLessThanOrEqual(13);
    } finally {
      h.sqlite.close();
    }
  });

  it("a reconnect right after a failed one still gets its retry within 5 s", async () => {
    const h = await harness();
    try {
      await failSevenTimes(h);
      const start = h.state.clock;
      h.state.clock = start + 1000;
      h.drain.regain();
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(7);
      expect(h.row().at).toBe(start + 5000);
      h.state.clock = start + 2000;
      h.drain.regain();
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(7);
      h.state.clock = start + 5000;
      h.state.answer = () => accepted;
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(8);
      expect(h.row().state).toBe("synced");
    } finally {
      h.sqlite.close();
    }
  });

  it("a coordinator made after sign-in retries at once, whatever the last one did", async () => {
    const h = await harness();
    try {
      await failSevenTimes(h);
      h.state.clock += 10_000;
      h.drain.regain();
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(8);
      expect(h.row().at - h.state.clock).toBe(300000);
      h.state.clock += 1000;
      h.state.answer = () => accepted;
      await h.create()(signal());
      expect(h.state.calls).toHaveLength(9);
      expect(h.row().state).toBe("synced");
    } finally {
      h.sqlite.close();
    }
  });

  it("a coordinator built later on the same database keeps what the server asked for", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      const calls: number[] = [];
      let clock = 1_000_000;
      const make = () =>
        createSyncCoordinator({
          database: db,
          scope,
          isCurrent: () => true,
          getToken: async () => "token",
          now: () => clock,
          upload: async () => {
            calls.push(clock);
            return calls.length === 1
              ? { kind: "retry", code: "rate_limited", message: "slow", retryAfter: 60 }
              : accepted;
          },
        });
      await make()(signal());
      clock += 10_000;
      await make()(signal());
      expect(calls).toEqual([1_000_000]);
      clock += 50_000;
      await make()(signal());
      expect(calls).toEqual([1_000_000, 1_060_000]);
    } finally {
      sqlite.close();
    }
  });

  it("a reconnect right after a timed retry waits 5 s from that retry, not from the last release", async () => {
    const h = await harness();
    try {
      const start = h.state.clock;
      await h.drain(signal());
      h.state.clock = start + 5000;
      await h.drain(signal());
      expect(h.state.calls).toEqual([start, start + 5000]);
      h.state.clock = start + 5100;
      h.drain.regain();
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(2);
      expect(h.row().at).toBe(start + 10_000);
      h.state.clock = start + 9999;
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(2);
      h.state.answer = () => accepted;
      h.state.clock = start + 10_000;
      await h.drain(signal());
      expect(h.state.calls).toEqual([start, start + 5000, start + 10_000]);
      expect(h.row().state).toBe("synced");
    } finally {
      h.sqlite.close();
    }
  });

  it("a pass that stores a change and then throws says so, with the original error", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      await saveObservation(
        db,
        { ...boundRecord, id: "60000000-0000-4000-8000-000000000002" },
        owner,
      );
      const drain = createSyncCoordinator({
        database: db,
        scope,
        isCurrent: () => true,
        getToken: async () => "token",
        upload: async (record) => {
          if (record.id !== boundRecord.id) throw new Error("storage is busy");
          return { kind: "accepted", receipt: { ...receipt, observation_id: record.id } };
        },
      });
      const failure = await drain(signal()).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(FailedAfterChange);
      expect((failure as FailedAfterChange).message).toBe("storage is busy");
      expect((failure as FailedAfterChange).original).toBeInstanceOf(Error);
    } finally {
      sqlite.close();
    }
  });

  it("does not touch a record that needs attention", async () => {
    const h = await harness(() => ({ kind: "rejected", code: "validation_failed", message: "x" }));
    try {
      await h.drain(signal());
      expect(h.row().state).toBe("needs-attention");
      h.state.clock += 1000;
      h.drain.regain();
      await h.drain(signal());
      expect(h.state.calls).toHaveLength(1);
    } finally {
      h.sqlite.close();
    }
  });

  it("reports a change only when a stored record's state or message changed", async () => {
    const h = await harness();
    try {
      expect(await h.create()(signal())).toBe(true);
      h.sqlite.exec("DELETE FROM observations");
      expect(await h.drain(signal())).toBe(false);
    } finally {
      h.sqlite.close();
    }
    const again = await harness();
    try {
      expect(await again.drain(signal())).toBe(true);
      again.state.clock = again.row().at;
      expect(await again.drain(signal())).toBe(false);
      expect(again.state.calls).toHaveLength(2);
      again.state.answer = () => accepted;
      again.state.clock = again.row().at;
      expect(await again.drain(signal())).toBe(true);
      expect(await again.drain(signal())).toBe(false);
    } finally {
      again.sqlite.close();
    }
  });
});
