import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { instrumentObservationSchema, shellObservationSchema } from "../domain/observation";
import {
  initializeDatabase,
  type LocalDatabase,
  listObservations,
  saveObservation,
} from "./observation-store";

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
  observer: "JL",
  people: 2,
  notes: "Child's play — café",
  createdAt: "2026-09-17T10:00:00.000Z",
  storageStatus: "local-only",
});

describe("Local observation persistence", () => {
  it("restores the observation after closing and reopening a real SQLite file", async () => {
    // Given a saved observation in an on-disk database.
    const directory = mkdtempSync(join(tmpdir(), "decamark-db-"));
    const filename = join(directory, "observations.db");
    let database = new DatabaseSync(filename);
    try {
      await initializeDatabase(adapter(database));
      await saveObservation(adapter(database), record);
      database.close();
      // When the database is opened by a fresh connection.
      database = new DatabaseSync(filename);
      await initializeDatabase(adapter(database));
      const records = await listObservations(adapter(database));
      // Then all fields, including coordinates and local-only status, survive.
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
      await saveObservation(adapter(database), record);
      // When a duplicate ID is saved.
      const secondSave = saveObservation(adapter(database), { ...record, notes: "replacement" });
      // Then it fails and leaves the original intact.
      await expect(secondSave).rejects.toThrow();
      expect(await listObservations(adapter(database))).toEqual([record]);
    } finally {
      database.close();
    }
  });
});

const instrument = instrumentObservationSchema.parse({
  id: "1f0a2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
  siteId: "riverside-north-playground",
  formVersion: "janet-test-v1",
  coordinates: [-76.4843, 42.44845],
  observer: "JL",
  answers: {
    age_range: "age_6_8",
    play_type_1: "physical",
    play_subtype_1: "gross_motor",
    play_event_summary: "Crossing the rope bridge, twice.",
    observer_initials: "JL",
  },
  context: {
    packageId: "riverside-play-study",
    packageVersion: "v4",
    zoneId: "B",
    zoneLabel: "Zone B · North playground",
    roundType: "standard",
    freshPeriod: false,
    inheritedFrom: "Round context inherited.",
  },
  placement: { source: "hand", gpsAccuracyMetres: null },
  createdAt: "2026-09-22T14:31:00.000Z",
  storageStatus: "local-only",
});

describe("Queueing a record by its form version", () => {
  it("holds practice records locally while the current uploader is not implemented", async () => {
    // Given a signed-in account and the form version the API accepts.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      // When the record is saved under that account.
      await saveObservation(adapter(database), record, "account-a");
      // Then it stays local because no current upload contract is installed.
      expect(database.prepare("SELECT sync_state FROM observations").get()).toEqual({
        sync_state: "local-only",
      });
    } finally {
      database.close();
    }
  });

  it("holds a record whose form version the API cannot accept yet", async () => {
    // Given a signed-in account and a draft instrument version.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      // When an instrument record is saved.
      await saveObservation(adapter(database), instrument, "account-a");
      // Then it stays on the device rather than being sent against a contract that rejects it.
      expect(database.prepare("SELECT sync_state FROM observations").get()).toEqual({
        sync_state: "local-only",
      });
    } finally {
      database.close();
    }
  });

  it("stores both form versions side by side without either corrupting the other", async () => {
    // Given one practice record and one instrument record on the same device.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      await saveObservation(adapter(database), record, "account-a");
      await saveObservation(adapter(database), instrument, "account-a");
      // When the device list is read.
      const stored = await listObservations(adapter(database), "account-a");
      // Then each keeps its own shape, answers and round context.
      const practice = stored.find((entry) => entry.formVersion === "shell-v1");
      const collected = stored.find((entry) => entry.formVersion === "janet-test-v1");
      expect(practice).toEqual({ ...record, storageStatus: "local-only" });
      expect(collected).toEqual({ ...instrument, storageStatus: "local-only" });
    } finally {
      database.close();
    }
  });
});
