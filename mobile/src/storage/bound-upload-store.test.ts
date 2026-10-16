import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { instrumentObservationSchema } from "../domain/observation";
import { syncScopeSchema } from "../sync/contracts";
import { serializeBoundObservation } from "../sync/wire-body";
import { initializeDatabase, listObservations, saveObservation } from "./observation-store";
import { installPackage, removePackage } from "./package-catalog";
import {
  adapter,
  binding,
  boundRecord,
  entry,
  identity,
  memoryDatabase,
  owner,
} from "./package-store.fixture";
import {
  acknowledge,
  activateHeldObservations,
  deferObservation,
  pendingObservations,
  retryAttention,
} from "./sync-store";

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

describe("Durable exact upload body", () => {
  it("stores the body atomically and replays it across a SQLite restart and new publication", async () => {
    const directory = mkdtempSync(join(tmpdir(), "mob29-"));
    const path = join(directory, "queue.db");
    let sqlite = new DatabaseSync(path);
    try {
      let db = adapter(sqlite);
      await initializeDatabase(db);
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      const stored = sqlite.prepare("SELECT payload,sync_state FROM observations").get();
      expect(stored?.["sync_state"]).toBe("pending");
      const first = await pendingObservations(db, owner, Date.now());
      expect(first[0]?.body).toBe(serializeBoundObservation(boundRecord));
      await installPackage(db, owner, {
        ...entry,
        identity: {
          ...identity,
          packageId: "30000000-0000-4000-8000-000000000002",
          packageVersion: 8,
          packageSha256: "b".repeat(64),
        },
      });
      sqlite.close();
      sqlite = new DatabaseSync(path);
      db = adapter(sqlite);
      await initializeDatabase(db);
      expect((await pendingObservations(db, owner, Date.now()))[0]?.body).toBe(first[0]?.body);
      expect(sqlite.prepare("SELECT payload,sync_state FROM observations").get()).toEqual(stored);
    } finally {
      sqlite.close();
      rmSync(directory, { recursive: true });
    }
  });
  it("activates pre-MOB29 held records once from their own preserved binding", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      await db.runAsync(
        "UPDATE observations SET payload = ?, sync_state = 'local-only'",
        JSON.stringify(boundRecord),
      );
      await activateHeldObservations(db, owner, scope);
      expect((await pendingObservations(db, owner, Date.now()))[0]?.body).toBe(
        serializeBoundObservation(boundRecord),
      );
    } finally {
      sqlite.close();
    }
  });
  it("does not activate another account or issuer's held rows", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      await db.runAsync(
        "UPDATE observations SET payload = ?, sync_state = 'local-only'",
        JSON.stringify(boundRecord),
      );
      await activateHeldObservations(db, owner, {
        ...scope,
        userId: syncScopeSchema.parse({ ...scope, userId: "40000000-0000-4000-8000-000000000002" })
          .userId,
      });
      expect(sqlite.prepare("SELECT sync_state FROM observations").get()?.["sync_state"]).toBe(
        "local-only",
      );
    } finally {
      sqlite.close();
    }
  });
  it.each([
    "project_id",
    "user_id",
    "package_id",
    "zone_id",
    "accepted_revision",
    "received_at",
  ])("does not acknowledge a forged %s at the store boundary", async (field) => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      await acknowledge(
        db,
        owner,
        {
          ...receipt,
          [field]: field === "accepted_revision" ? 2 : "70000000-0000-4000-8000-000000000099",
        },
        boundRecord.id,
      );
      expect(sqlite.prepare("SELECT sync_state,server_receipt FROM observations").get()).toEqual({
        sync_state: "pending",
        server_receipt: "",
      });
    } finally {
      sqlite.close();
    }
  });
  it("refuses a different pending record ID even when its receipt is valid", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      const other = instrumentObservationSchema.parse({
        ...boundRecord,
        id: "60000000-0000-4000-8000-000000000002",
      });
      await saveObservation(db, other, owner);
      await acknowledge(db, owner, { ...receipt, observation_id: other.id }, boundRecord.id);
      expect(
        sqlite
          .prepare("SELECT COUNT(*) AS count FROM observations WHERE sync_state = 'synced'")
          .get()?.["count"],
      ).toBe(0);
    } finally {
      sqlite.close();
    }
  });
  it("fences explicit retry after the account changes", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      sqlite.exec("UPDATE observations SET sync_state = 'needs-attention'");
      await retryAttention(db, owner, () => false);
      expect(sqlite.prepare("SELECT sync_state FROM observations").get()).toEqual({
        sync_state: "needs-attention",
      });
    } finally {
      sqlite.close();
    }
  });
  it("keeps structured rejection, original payload and package reference on retry", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      const payload = sqlite.prepare("SELECT payload FROM observations").get();
      await deferObservation(
        db,
        owner,
        boundRecord.id,
        "Check values",
        100,
        true,
        "validation_failed",
        () => true,
        ["point_outside_zone"],
      );
      expect((await listObservations(db, owner))[0]).toMatchObject({
        storageStatus: "needs-attention",
        syncError: "Check values",
        syncRejectionCode: "validation_failed",
        syncIssueCodes: ["point_outside_zone"],
      });
      expect((await removePackage(db, owner, identity)).reasons.records).toBe(1);
      await retryAttention(db, owner);
      expect(sqlite.prepare("SELECT payload FROM observations").get()).toEqual(payload);
      expect((await pendingObservations(db, owner, Date.now()))[0]?.body).toBe(
        serializeBoundObservation(boundRecord),
      );
    } finally {
      sqlite.close();
    }
  });
});
