import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { instrumentObservationSchema } from "../domain/observation";
import { initializeDatabase, listObservations, saveObservation } from "./observation-store";
import { installPackage } from "./package-catalog";
import { adapter, boundRecord, entry, owner } from "./package-store.fixture";

const record = boundRecord;

describe("Local observation persistence", () => {
  it("restores the observation after closing and reopening a real SQLite file", async () => {
    // Given a saved observation in an on-disk database.
    const directory = mkdtempSync(join(tmpdir(), "decamark-db-"));
    const filename = join(directory, "observations.db");
    let database = new DatabaseSync(filename);
    try {
      await initializeDatabase(adapter(database));
      await installPackage(adapter(database), owner, entry);
      await saveObservation(adapter(database), record, owner);
      database.close();
      // When the database is opened by a fresh connection.
      database = new DatabaseSync(filename);
      await initializeDatabase(adapter(database));
      const records = await listObservations(adapter(database), owner);
      // Then all fields, including coordinates, the binding and the pending status, survive.
      expect(records).toEqual([record]);
    } finally {
      database.close();
      rmSync(directory, { recursive: true });
    }
  });

  it("does not silently replace an observation with the same ID", async () => {
    // Given a stored record.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      await installPackage(adapter(database), owner, entry);
      await saveObservation(adapter(database), record, owner);
      // When a duplicate ID is saved.
      const secondSave = saveObservation(
        adapter(database),
        { ...record, answers: { ...record.answers, text: "replacement" } },
        owner,
      );
      // Then it fails and leaves the original intact.
      await expect(secondSave).rejects.toThrow();
      expect(await listObservations(adapter(database), owner)).toEqual([record]);
    } finally {
      database.close();
    }
  });
});

describe("Queueing a record", () => {
  it("stores every record as pending upload, whatever its form version", async () => {
    // Given an installed package and two records made with different form versions.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      await installPackage(adapter(database), owner, entry);
      const training = instrumentObservationSchema.parse({
        ...record,
        id: "1f0a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
        formVersion: "training-v1",
      });
      // When they are saved under the account.
      await saveObservation(adapter(database), record, owner);
      await saveObservation(adapter(database), training, owner);
      // Then each is queued to upload; none stays on the device by design.
      expect(database.prepare("SELECT DISTINCT sync_state FROM observations").all()).toEqual([
        { sync_state: "pending" },
      ]);
      // And each keeps its own answers and round context.
      const stored = await listObservations(adapter(database), owner);
      expect(stored.find((entry) => entry.formVersion === "training-v1")).toEqual(training);
      expect(stored.find((entry) => entry.formVersion === "synthetic-form-v1")).toEqual(record);
    } finally {
      database.close();
    }
  });

  it("refuses a record of a package this account has not installed", async () => {
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      await expect(saveObservation(adapter(database), record, owner)).rejects.toThrow();
      expect(await listObservations(adapter(database), owner)).toEqual([]);
    } finally {
      database.close();
    }
  });
});
