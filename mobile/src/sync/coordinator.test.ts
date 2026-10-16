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
import { syncScopeSchema } from "./contracts";
import { createSyncCoordinator } from "./coordinator";
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
