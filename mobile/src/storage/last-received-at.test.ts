import { describe, expect, it } from "vitest";
import { receipt } from "../sync/bound-upload.fixture";
import { lastReceivedAt } from "./last-received-at";
import { saveObservation } from "./observation-store";
import { installPackage } from "./package-catalog";
import { boundRecord, entry, memoryDatabase, otherOwner, owner } from "./package-store.fixture";
import { acknowledge } from "./sync-store";

describe("lastReceivedAt", () => {
  it("returns null until this scope has an acknowledged upload", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      expect(await lastReceivedAt(db, owner)).toBeNull();
      expect(await lastReceivedAt(db, "local")).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("returns the newest server acknowledgment by instant rather than record order or UTC offset", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      const records = [
        {
          ...boundRecord,
          id: "60000000-0000-4000-8000-000000000002",
          createdAt: "2026-10-15T14:00:00Z",
        },
        {
          ...boundRecord,
          id: "60000000-0000-4000-8000-000000000003",
          createdAt: "2026-10-15T09:00:00Z",
        },
        boundRecord,
      ];
      const times = ["2026-10-15T14:00:00+04:00", "2026-10-15T11:00:00Z", "2026-10-15T10:30:00Z"];
      for (const [index, record] of records.entries()) {
        await saveObservation(db, record, owner);
        await acknowledge(db, owner, {
          ...receipt,
          observation_id: record.id,
          received_at: times[index],
        });
      }
      expect(await lastReceivedAt(db, owner)).toBe("2026-10-15T11:00:00Z");
      expect(await lastReceivedAt(db, otherOwner)).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("does not return another scope's newer receipt or receipts on unsynced rows", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await installPackage(db, otherOwner, entry);
      await saveObservation(db, boundRecord, owner);
      await acknowledge(db, owner, receipt);
      const otherRecord = { ...boundRecord, id: "60000000-0000-4000-8000-000000000002" };
      await saveObservation(db, otherRecord, otherOwner);
      await acknowledge(db, otherOwner, {
        ...receipt,
        observation_id: otherRecord.id,
        user_id: "40000000-0000-4000-8000-000000000002",
        received_at: "2026-10-16T11:00:00Z",
      });
      for (const [index, state] of ["pending", "needs-attention", "local-only"].entries()) {
        await db.runAsync(
          "INSERT INTO observations (id, created_at, payload, owner_scope, sync_state, server_receipt) VALUES (?, '', '{}', ?, ?, ?)",
          `synthetic-${index}`,
          owner,
          state,
          JSON.stringify({ ...receipt, received_at: "2026-10-17T11:00:00Z" }),
        );
      }
      expect(await lastReceivedAt(db, owner)).toBe(receipt.received_at);
      expect(await lastReceivedAt(db, otherOwner)).toBe("2026-10-16T11:00:00Z");
    } finally {
      sqlite.close();
    }
  });

  it("preserves server precision when acknowledgments share a millisecond", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      await acknowledge(db, owner, { ...receipt, received_at: "2026-10-15T10:00:00.123456Z" });
      const next = { ...boundRecord, id: "60000000-0000-4000-8000-000000000002" };
      await saveObservation(db, next, owner);
      await acknowledge(db, owner, {
        ...receipt,
        observation_id: next.id,
        received_at: "2026-10-15T10:00:00.123457Z",
      });
      expect(await lastReceivedAt(db, owner)).toBe("2026-10-15T10:00:00.123457Z");
    } finally {
      sqlite.close();
    }
  });
});
