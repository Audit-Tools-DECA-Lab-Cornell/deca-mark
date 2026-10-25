import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { instrumentObservationSchema } from "../domain/observation";
import { clearDraft, type ObservationDraft, readDraft, saveDraft } from "./draft-store";
import {
  commitObservation,
  initializeDatabase,
  type LocalDatabase,
  listObservations,
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

const draft: ObservationDraft = {
  id: "0c1bd9be-9d3a-4a4b-9b0a-1f9a1b2c3d4e",
  owner: "local",
  formVersion: "janet-test-v1",
  packageId: "riverside-play-study",
  siteId: "riverside-north-playground",
  context: {
    packageId: "riverside-play-study",
    packageVersion: "v4",
    zoneId: "B",
    zoneLabel: "Zone B · North playground",
    roundType: "reliability",
    freshPeriod: false,
    inheritedFrom: "Round context inherited.",
  },
  coordinates: [-76.4843, 42.44845],
  placement: { source: "hand", gpsAccuracyMetres: null },
  answers: { age_range: "age_6_8" },
  questionIndex: 1,
  startedAt: "2026-09-22T14:31:00.000Z",
  updatedAt: "2026-09-22T14:31:05.000Z",
};

describe("Unfinished observations", () => {
  it("survives closing and reopening the database, so a force quit costs nothing", async () => {
    // Given a draft written as its answers were tapped.
    const directory = mkdtempSync(join(tmpdir(), "decamark-draft-"));
    const filename = join(directory, "drafts.db");
    let database = new DatabaseSync(filename);
    try {
      await initializeDatabase(adapter(database));
      const numericDraft = {
        ...draft,
        formVersion: "shell-v1",
        answers: { observer: "JL", people: 0 },
      };
      await saveDraft(adapter(database), "local", numericDraft);
      database.close();
      // When the app reopens the file.
      database = new DatabaseSync(filename);
      await initializeDatabase(adapter(database));
      // Then the point, the answers and the place in the stack all come back.
      expect(await readDraft(adapter(database), "local")).toEqual(numericDraft);
    } finally {
      database.close();
      rmSync(directory, { recursive: true });
    }
  });

  it("keeps one draft per account and replaces it as answers are added", async () => {
    // Given a draft that grows another answer.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      const theirs = { ...draft, owner: "account-a" };
      await saveDraft(adapter(database), "account-a", theirs);
      await saveDraft(adapter(database), "account-a", {
        ...theirs,
        answers: { ...theirs.answers, play_type_1: "physical" },
        questionIndex: 2,
      });
      // When it is read back.
      const stored = await readDraft(adapter(database), "account-a");
      // Then the latest state is there once, not twice.
      expect(stored?.answers).toEqual({ age_range: "age_6_8", play_type_1: "physical" });
      expect(stored?.questionIndex).toBe(2);
    } finally {
      database.close();
    }
  });

  it("never offers one account's draft to another", async () => {
    // Given a draft saved while signed into one account.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      await saveDraft(adapter(database), "account-a", { ...draft, owner: "account-a" });
      // When a different account opens the app.
      // Then nothing is offered for recovery, and the original is untouched.
      expect(await readDraft(adapter(database), "account-b")).toBeNull();
      expect(await readDraft(adapter(database), "account-a")).not.toBeNull();
    } finally {
      database.close();
    }
  });

  it("preserves an unreadable draft for recovery without restoring it into the wrong form", async () => {
    // Given a draft written by a version whose shape no longer parses.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      database
        .prepare(
          "INSERT INTO observation_drafts (owner_scope, id, updated_at, payload) VALUES (?, ?, ?, ?)",
        )
        .run("local", draft.id, draft.updatedAt, JSON.stringify({ answers: "not a record" }));
      // When recovery runs.
      // Then it declines resume but preserves the original answers for recovery.
      await expect(readDraft(adapter(database), "local")).rejects.toThrow(/retained/);
      expect(database.prepare("SELECT COUNT(*) AS total FROM observation_drafts").get()).toEqual({
        total: 1,
      });
    } finally {
      database.close();
    }
  });

  it("refuses a draft whose payload names an account other than the row it sits in", async () => {
    // Given a draft row whose stored owner disagrees with its account scope.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      database
        .prepare(
          "INSERT INTO observation_drafts (owner_scope, id, updated_at, payload) VALUES (?, ?, ?, ?)",
        )
        .run(
          "account-b",
          draft.id,
          draft.updatedAt,
          JSON.stringify({ ...draft, owner: "account-a" }),
        );
      // When that account opens the app.
      // Then the draft is refused and preserved, so one observer's answers cannot change hands.
      await expect(readDraft(adapter(database), "account-b")).rejects.toThrow(/retained/);
      expect(database.prepare("SELECT COUNT(*) AS total FROM observation_drafts").get()).toEqual({
        total: 1,
      });
    } finally {
      database.close();
    }
  });

  it("clears the draft when the observation is saved or discarded", async () => {
    // Given a stored draft.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      await saveDraft(adapter(database), "local", draft);
      // When it is cleared.
      await clearDraft(adapter(database), "local");
      // Then nothing remains to be offered on the next launch.
      expect(await readDraft(adapter(database), "local")).toBeNull();
    } finally {
      database.close();
    }
  });
});

const finished = instrumentObservationSchema.parse({
  id: draft.id,
  siteId: draft.siteId,
  formVersion: "janet-test-v1",
  coordinates: draft.coordinates,
  observer: "JL",
  answers: { ...draft.answers, observer_initials: "JL" },
  context: draft.context,
  placement: { source: "hand", gpsAccuracyMetres: null },
  createdAt: "2026-09-22T14:32:00.000Z",
  storageStatus: "local-only",
});

describe("Finishing an observation", () => {
  it("stores the record and retires its draft in one step", async () => {
    // Given an observation in progress.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      await saveDraft(adapter(database), "local", draft);
      // When it is saved.
      await commitObservation(adapter(database), finished, "local");
      // Then the record exists and nothing is left to be offered back on the next launch.
      expect(await listObservations(adapter(database), "local")).toHaveLength(1);
      expect(await readDraft(adapter(database), "local")).toBeNull();
    } finally {
      database.close();
    }
  });

  it("keeps the draft when the record cannot be stored", async () => {
    // Given a record identifier that is already taken, so the insert must fail.
    const database = new DatabaseSync(":memory:");
    try {
      await initializeDatabase(adapter(database));
      await commitObservation(adapter(database), finished, "local");
      await saveDraft(adapter(database), "local", draft);
      // When the same observation is committed a second time.
      const second = commitObservation(adapter(database), finished, "local");
      // Then the whole step rolls back: no duplicate record, and the draft is still recoverable
      // rather than deleted against a save that never happened.
      await expect(second).rejects.toThrow();
      expect(await listObservations(adapter(database), "local")).toHaveLength(1);
      expect(await readDraft(adapter(database), "local")).not.toBeNull();
    } finally {
      database.close();
    }
  });
});
