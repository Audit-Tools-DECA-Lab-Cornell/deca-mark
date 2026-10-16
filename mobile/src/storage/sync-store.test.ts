import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { shellObservationSchema } from "../domain/observation";
import {
  initializeDatabase,
  type LocalDatabase,
  listObservations,
  saveObservation,
} from "./observation-store";
import { installPackage } from "./package-catalog";
import { boundRecord, entry, identity, memoryDatabase, owner } from "./package-store.fixture";
import { acknowledge, pendingObservations, retryAttention } from "./sync-store";

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
