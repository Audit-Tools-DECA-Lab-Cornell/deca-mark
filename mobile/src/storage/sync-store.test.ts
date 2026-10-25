import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { shellObservationSchema } from "../domain/observation";
import { syncScopeSchema } from "../sync/contracts";
import {
  initializeDatabase,
  type LocalDatabase,
  listObservations,
  saveObservation,
} from "./observation-store";
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
  activateHeldObservations,
  deferObservation,
  earliestRetry,
  pendingObservations,
  raiseRetryHold,
  readRetryHold,
  releaseBackoff,
  retryAttention,
} from "./sync-store";

function adapter(database: DatabaseSync): LocalDatabase {
  return {
    async execAsync(sql) {
      database.exec(sql);
    },
    async runAsync(sql, ...parameters) {
      return database.prepare(sql).run(...parameters);
    },
    async getAllAsync(sql, ...parameters) {
      return database.prepare(sql).all(...parameters);
    },
  };
}

const record = shellObservationSchema.parse({
  id: "83f254b5-8a7b-4b71-9591-a7ff880f4ad7",
  siteId: "sample-garden",
  formVersion: "shell-v1",
  coordinates: [-76.485, 42.448],
  observer: "QA",
  people: 3,
  notes: "Offline",
  createdAt: "2026-09-17T12:00:00.000Z",
  storageStatus: "local-only",
});

describe("Account-scoped local work", () => {
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

  it("atomically holds a signed-in save and hides it from other accounts", async () => {
    const sqlite = new DatabaseSync(":memory:");
    const db = adapter(sqlite);
    try {
      await initializeDatabase(db);
      await saveObservation(db, record, "account-a");
      expect(await listObservations(db, "account-a")).toEqual([
        { ...record, storageStatus: "local-only" },
      ]);
      expect(await listObservations(db, "account-b")).toEqual([]);
      expect(await listObservations(db)).toEqual([]);
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

  it("names the earliest time a pending record may be tried, even when that has passed", async () => {
    const { db, sqlite } = await waiting();
    try {
      expect(await earliestRetry(db, owner)).toBe(0);
      sqlite.exec(
        `UPDATE observations SET next_attempt_at = ${NOW + 1000} WHERE id = '${second(2)}'`,
      );
      expect(await earliestRetry(db, owner)).toBe(NOW + 1000);
      expect(await earliestRetry(db, "nobody")).toBeNull();
      sqlite.exec(`UPDATE observations SET sync_state = 'synced' WHERE owner_scope = '${owner}'`);
      expect(await earliestRetry(db, owner)).toBeNull();
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

  it("says whether a receipt, a failure or an activation changed a stored record", async () => {
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

      expect(await activateHeldObservations(db, owner, scope)).toBe(false);
      sqlite.exec("UPDATE observations SET sync_state = 'local-only'");
      sqlite.prepare("UPDATE observations SET payload = ?").run(JSON.stringify(boundRecord));
      expect(await activateHeldObservations(db, owner, scope)).toBe(true);
      expect(await activateHeldObservations(db, owner, scope)).toBe(false);
    } finally {
      sqlite.close();
    }
  });
});
