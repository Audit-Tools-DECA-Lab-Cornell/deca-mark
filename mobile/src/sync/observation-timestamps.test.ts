import { describe, expect, it } from "vitest";
import { observationSchema } from "../domain/observation";
import { saveObservation } from "../storage/observation-store";
import { installPackage } from "../storage/package-catalog";
import { boundRecord, entry, memoryDatabase, owner } from "../storage/package-store.fixture";
import { pendingObservations } from "../storage/sync-store";
import { serializeBoundObservation, uploadBodyMatches } from "./wire-body";

describe("Observation capture timestamps", () => {
  it("keeps a known start in the saved record and exact queued upload", async () => {
    // Given a completed point with a start distinct from its save time.
    const startedAt = "2026-10-11T09:58:00.000Z";
    const record = observationSchema.parse({ ...boundRecord, startedAt });
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      // When it is saved and read back through the real SQLite queue.
      await saveObservation(db, record, owner);
      const [queued] = await pendingObservations(db, owner, Date.now());
      // Then both instants survive and the persisted body matches its record.
      expect(queued?.record).toMatchObject({ startedAt, createdAt: boundRecord.createdAt });
      expect(JSON.parse(queued?.body ?? "null")).toMatchObject({
        started_at: startedAt,
        observed_at: boundRecord.createdAt,
      });
      expect(uploadBodyMatches(queued?.body ?? "", record)).toBe(true);
      expect(
        uploadBodyMatches(queued?.body ?? "", { ...record, startedAt: record.createdAt }),
      ).toBe(false);
    } finally {
      sqlite.close();
    }
  });

  it("leaves older records and their queued bodies without an invented start", () => {
    // Given a saved record from an older collector.
    const record = observationSchema.parse(boundRecord);
    // When its original body is serialized and checked.
    const body = serializeBoundObservation(record);
    // Then start remains unknown and the original upload is still valid.
    expect(record).not.toHaveProperty("startedAt");
    expect(JSON.parse(body)).not.toHaveProperty("started_at");
    expect(uploadBodyMatches(body, record)).toBe(true);
  });
});
