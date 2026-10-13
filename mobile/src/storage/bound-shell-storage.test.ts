import { describe, expect, it } from "vitest";
import {
  buildObservation,
  type ObservationInput,
  observationSummary,
} from "../domain/build-observation";
import {
  boundShellObservationSchema,
  isBoundObservation,
  isShellObservation,
  observationSchema,
  shellObservationSchema,
} from "../domain/observation";
import { shellV1 } from "../forms/fixtures/shell-v1";
import { isUploadableRecord } from "../forms/registry";
import { initializeDatabase, listObservations, saveObservation } from "./observation-store";
import { installPackage, removePackage } from "./package-catalog";
import {
  binding,
  boundRecord,
  context,
  entry,
  identity,
  memoryDatabase,
  owner,
} from "./package-store.fixture";
import { pendingObservations, retryAttention } from "./sync-store";

const input: ObservationInput = {
  id: boundRecord.id,
  form: shellV1,
  answers: { observer: "QA", people: 0, notes: "  Bound café  " },
  coordinates: boundRecord.coordinates,
  placement: boundRecord.placement,
  context,
  projectId: identity.projectId,
  siteId: identity.siteId,
  createdAt: boundRecord.createdAt,
  binding,
};

describe("Package-bound shell form persistence", () => {
  it("retains actual site/project/binding when building, parsing, saving and restoring shell-v1", async () => {
    const result = buildObservation(input);
    if (!result.ok) throw new Error(result.message);
    const record = boundShellObservationSchema.parse(result.record);
    expect(record).toMatchObject({
      siteId: input.siteId,
      projectId: input.projectId,
      context,
      placement: input.placement,
      people: 0,
      notes: "  Bound café  ",
      binding,
    });
    expect(isShellObservation(record)).toBe(true);
    expect(isBoundObservation(record)).toBe(true);
    expect(isUploadableRecord(record)).toBe(false);
    expect(observationSummary(record)).toBe("  Bound café  ");
    expect(observationSchema.parse(record)).toEqual(record);
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, record, owner);
      await initializeDatabase(db);
      expect(await listObservations(db, owner)).toEqual([record]);
      expect(sqlite.prepare("SELECT sync_state FROM observations").get()).toEqual({
        sync_state: "local-only",
      });
      expect((await removePackage(db, owner, identity)).reasons.records).toBe(1);
      sqlite.exec("UPDATE observations SET sync_state = 'needs-attention';");
      await retryAttention(db, owner);
      expect(await pendingObservations(db, owner, Date.now())).toEqual([]);
      expect(sqlite.prepare("SELECT sync_state FROM observations").get()).toEqual({
        sync_state: "needs-attention",
      });
    } finally {
      sqlite.close();
    }
  });

  it("rejects invalid shell bindings without treating them as practice records", () => {
    const shell = {
      id: input.id,
      siteId: "sample-garden",
      formVersion: "shell-v1",
      coordinates: input.coordinates,
      observer: "QA",
      people: 0,
      notes: "Synthetic",
      createdAt: input.createdAt,
      storageStatus: "local-only",
      projectId: identity.projectId,
      context,
      placement: input.placement,
    };
    for (const invalid of [
      null,
      {},
      { ...binding, zoneId: "invalid UUID" },
      { ...binding, packageId: "30000000-0000-4000-8000-000000000009" },
    ]) {
      expect(observationSchema.safeParse({ ...shell, binding: invalid }).success).toBe(false);
      expect(shellObservationSchema.safeParse({ ...shell, binding: invalid }).success).toBe(false);
    }
    expect(buildObservation({ ...input, projectId: undefined }).ok).toBe(false);
    expect(buildObservation({ ...input, siteId: "20000000-0000-4000-8000-000000000009" }).ok).toBe(
      false,
    );
  });

  it("keeps the original practice builder shape when no binding is present", () => {
    const { binding: _binding, ...practiceInput } = input;
    const result = buildObservation(practiceInput);
    expect(result).toMatchObject({
      ok: true,
      record: { siteId: "sample-garden", people: 0, notes: "Bound café" },
    });
    if (!result.ok) throw new Error(result.message);
    expect(isBoundObservation(result.record)).toBe(false);
    expect(result.record).not.toHaveProperty("projectId");
    expect(result.record).not.toHaveProperty("context");
  });
});
