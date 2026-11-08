import { describe, expect, it } from "vitest";
import { syncScopeSchema } from "../sync/contracts";
import { listObservations, saveObservation } from "./observation-store";
import { installPackage } from "./package-catalog";
import {
  binding,
  boundRecord,
  entry,
  identity,
  memoryDatabase,
  otherOwner,
  owner,
} from "./package-store.fixture";
import {
  acknowledge,
  deferObservation,
  pendingObservations,
  pendingRetries,
  raiseRetryHold,
  readRetryHold,
  releaseBackoff,
  retryAttention,
} from "./sync-store";

describe("Account-scoped local work", () => {
  it("a full page counts only sendable records, so unsendable ones in front never shorten it", async () => {
    const { sqlite, db } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      const ids = Array.from(
        { length: 60 },
        (_, index) => `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      );
      for (const id of ids) await saveObservation(db, { ...boundRecord, id }, owner);
      // The first five lose their frozen body: they come first and can never be sent.
      for (const id of ids.slice(0, 5))
        sqlite
          .prepare(
            "UPDATE observations SET payload = json_remove(payload, '$.uploadBody') WHERE id = ?",
          )
          .run(id);
      const page = await pendingObservations(db, owner, Date.now());
      expect(page.map((item) => item.record.id)).toEqual(ids.slice(5, 30));
      sqlite.exec("UPDATE observations SET sync_state = 'synced' WHERE rowid > 5");
      expect(await pendingObservations(db, owner, Date.now())).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("queues bound records while refusing incomplete receipts at the persistence boundary", async () => {
    const { sqlite, db } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      sqlite.exec("UPDATE observations SET sync_state = 'pending';");
      expect(await pendingObservations(db, owner, Date.now())).toHaveLength(1);
      await acknowledge(db, owner, {
        observation_id: boundRecord.id,
        project_id: identity.projectId,
        user_id: "40000000-0000-4000-8000-000000000001",
        accepted_revision: 1,
        received_at: boundRecord.createdAt,
      });

      expect(
        sqlite
          .prepare("SELECT sync_state,server_receipt,sync_error,attempts FROM observations")
          .get(),
      ).toEqual({
        sync_state: "pending",
        server_receipt: "",
        sync_error: "",
        attempts: 0,
      });
      sqlite.exec("UPDATE observations SET sync_state = 'needs-attention';");
      await retryAttention(db, owner);
      expect(sqlite.prepare("SELECT sync_state FROM observations").get()).toEqual({
        sync_state: "pending",
      });
    } finally {
      sqlite.close();
    }
  });

  it("queues a saved record for upload and hides it from other accounts", async () => {
    const { sqlite, db } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      expect(await listObservations(db, owner)).toEqual([boundRecord]);
      expect(await listObservations(db, otherOwner)).toEqual([]);
      expect(await pendingObservations(db, owner, Date.now())).toHaveLength(1);
      expect(await pendingObservations(db, otherOwner, Date.now())).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});

describe("Retry timing in the store (MOB-39)", () => {
  const second = (index: number) =>
    `60000000-0000-4000-8000-${String(index).padStart(12, "0")}` as typeof boundRecord.id;
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
  const NOW = 1_000_000;

  /** Four records of one account and one of another, each with the delay the test sets. */
  async function waiting() {
    const { db, sqlite } = await memoryDatabase();
    await installPackage(db, owner, entry);
    for (const index of [1, 2, 3, 4]) {
      await saveObservation(db, { ...boundRecord, id: second(index) }, owner);
    }
    sqlite.exec(`
      UPDATE observations SET next_attempt_at = ${NOW + 300000}, attempts = 7 WHERE id = '${second(1)}';
      UPDATE observations SET next_attempt_at = 0 WHERE id = '${second(2)}';
      UPDATE observations SET next_attempt_at = ${NOW + 300000}, sync_state = 'needs-attention' WHERE id = '${second(3)}';
      UPDATE observations SET next_attempt_at = ${NOW + 2000} WHERE id = '${second(4)}';
    `);
    sqlite.exec(
      `INSERT INTO observations (id, created_at, payload, owner_scope, sync_state, next_attempt_at)
       SELECT '${second(9)}', created_at, payload, '${otherOwner}', 'pending', ${NOW + 300000} FROM observations WHERE id = '${second(1)}'`,
    );
    const at = (index: number) =>
      (
        sqlite
          .prepare("SELECT next_attempt_at AS at FROM observations WHERE id = ?")
          .get(second(index)) as { at: number }
      ).at;
    return { db, sqlite, at };
  }

  it("releases waiting pending records at once and nothing else", async () => {
    const { db, sqlite, at } = await waiting();
    try {
      await releaseBackoff(db, owner, NOW, NOW);
      expect(at(1)).toBe(0);
      expect(at(2)).toBe(0);
      expect(at(3)).toBe(NOW + 300000);
      expect(at(4)).toBe(0);
      expect(at(9)).toBe(NOW + 300000);
      expect(
        sqlite.prepare("SELECT attempts FROM observations WHERE id = ?").get(second(1)),
      ).toEqual({ attempts: 7 });
    } finally {
      sqlite.close();
    }
  });

  it("brings a record forward to a later release time but never pushes one back", async () => {
    const { db, sqlite, at } = await waiting();
    try {
      await releaseBackoff(db, owner, NOW, NOW + 5000);
      expect(at(1)).toBe(NOW + 5000);
      expect(at(2)).toBe(0);
      expect(at(4)).toBe(NOW + 2000);
      expect(at(3)).toBe(NOW + 300000);
    } finally {
      sqlite.close();
    }
  });

  it("is fenced by the account", async () => {
    const { db, sqlite, at } = await waiting();
    try {
      await releaseBackoff(db, owner, NOW, NOW, () => false);
      expect(at(1)).toBe(NOW + 300000);
    } finally {
      sqlite.close();
    }
  });

  it("names every pending record with the time it may be tried, earliest first, even when that has passed", async () => {
    const { db, sqlite } = await waiting();
    try {
      expect(await pendingRetries(db, owner)).toEqual([
        { id: second(2), at: 0 },
        { id: second(4), at: NOW + 2000 },
        { id: second(1), at: NOW + 300000 },
      ]);
      sqlite.exec(
        `UPDATE observations SET next_attempt_at = ${NOW + 1000} WHERE id = '${second(2)}'`,
      );
      expect((await pendingRetries(db, owner)).map((row) => row.at)).toEqual([
        NOW + 1000,
        NOW + 2000,
        NOW + 300000,
      ]);
      expect(await pendingRetries(db, "nobody")).toEqual([]);
      sqlite.exec(`UPDATE observations SET sync_state = 'synced' WHERE owner_scope = '${owner}'`);
      expect(await pendingRetries(db, owner)).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("keeps a server's deadline per account, never moves it closer, and honours the fence", async () => {
    const { db, sqlite } = await waiting();
    try {
      expect(await readRetryHold(db, owner)).toBe(0);
      await raiseRetryHold(db, owner, NOW + 120_000);
      await raiseRetryHold(db, owner, NOW + 5000);
      expect(await readRetryHold(db, owner)).toBe(NOW + 120_000);
      await raiseRetryHold(db, owner, NOW + 240_000, () => false);
      expect(await readRetryHold(db, owner)).toBe(NOW + 120_000);
      expect(await readRetryHold(db, otherOwner)).toBe(0);
    } finally {
      sqlite.close();
    }
  });

  it("says whether a receipt or a failure changed a stored record", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      expect(await acknowledge(db, owner, { ...receipt, zone_id: second(99) })).toBe(false);
      expect(await deferObservation(db, owner, boundRecord.id, "Lost", 10, false)).toBe(true);
      expect(await deferObservation(db, owner, boundRecord.id, "Lost", 20, false)).toBe(false);
      expect(await deferObservation(db, owner, boundRecord.id, "Other", 30, false)).toBe(true);
      expect(await deferObservation(db, owner, second(5), "Lost", 10, false)).toBe(false);
      expect(await deferObservation(db, owner, boundRecord.id, "Other", 30, true)).toBe(true);
      expect(await acknowledge(db, owner, receipt, boundRecord.id, () => false)).toBe(false);
      await retryAttention(db, owner);
      expect(await acknowledge(db, owner, receipt, boundRecord.id)).toBe(true);
      expect(await acknowledge(db, owner, receipt, boundRecord.id)).toBe(false);
    } finally {
      sqlite.close();
    }
  });
});
