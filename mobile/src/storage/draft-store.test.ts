import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { instrumentObservationSchema } from "../domain/observation";
import { clearDraft, type ObservationDraft, readDraft, saveDraft } from "./draft-store";
import { commitObservation, initializeDatabase, listObservations } from "./observation-store";
import { installPackage } from "./package-catalog";
import { adapter, binding, boundDraft, entry, owner } from "./package-store.fixture";

const draft: ObservationDraft = {
  ...boundDraft,
  formVersion: "janet-test-v1",
  context: { ...boundDraft.context, roundType: "reliability" },
  coordinates: [-76.4843, 42.44845],
  placement: { source: "hand", gpsAccuracyMetres: null },
  answers: { age_range: "age_6_8" },
  questionIndex: 1,
  startedAt: "2026-09-22T14:31:00.000Z",
  updatedAt: "2026-09-22T14:31:05.000Z",
};

/** A device with the package installed for each of the given accounts. */
async function deviceFor(...accounts: string[]) {
  const sqlite = new DatabaseSync(":memory:");
  const db = adapter(sqlite);
  await initializeDatabase(db);
  for (const account of accounts) await installPackage(db, account, entry);
  return { sqlite, db };
}

const mine = { ...draft, owner };

describe("Unfinished observations", () => {
  it("survives closing and reopening the database, so a force quit costs nothing", async () => {
    // Given a draft written as its answers were tapped.
    const directory = mkdtempSync(join(tmpdir(), "decamark-draft-"));
    const filename = join(directory, "drafts.db");
    let database = new DatabaseSync(filename);
    try {
      await initializeDatabase(adapter(database));
      await installPackage(adapter(database), owner, entry);
      await saveDraft(adapter(database), owner, mine);
      database.close();
      // When the app reopens the file.
      database = new DatabaseSync(filename);
      await initializeDatabase(adapter(database));
      // Then the point, the answers, the binding and the place in the stack all come back.
      expect(await readDraft(adapter(database), owner)).toEqual(mine);
    } finally {
      database.close();
      rmSync(directory, { recursive: true });
    }
  });

  it("keeps one draft per account and replaces it as answers are added", async () => {
    // Given a draft that grows another answer.
    const { sqlite, db } = await deviceFor(owner);
    try {
      await saveDraft(db, owner, mine);
      await saveDraft(db, owner, {
        ...mine,
        answers: { ...mine.answers, play_type_1: "physical" },
        questionIndex: 2,
      });
      // When it is read back.
      const stored = await readDraft(db, owner);
      // Then the latest state is there once, not twice.
      expect(stored?.answers).toEqual({ age_range: "age_6_8", play_type_1: "physical" });
      expect(stored?.questionIndex).toBe(2);
    } finally {
      sqlite.close();
    }
  });

  it("never offers one account's draft to another", async () => {
    // Given a draft saved while signed into one account.
    const { sqlite, db } = await deviceFor(owner);
    try {
      await saveDraft(db, owner, mine);
      // When a different account opens the app.
      // Then nothing is offered for recovery, and the original is untouched.
      expect(await readDraft(db, "account-b")).toBeNull();
      expect(await readDraft(db, owner)).not.toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("refuses to store a draft that carries no package binding", async () => {
    // Given a draft with no frozen binding: nothing can say which package its answers belong to.
    const { sqlite, db } = await deviceFor(owner);
    try {
      const { binding: _binding, ...unbound } = mine;
      // When it is saved.
      // Then it is refused rather than kept for an upload that could never name its package.
      expect(() => saveDraft(db, owner, unbound as ObservationDraft)).toThrow();
      expect(await readDraft(db, owner)).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("preserves an unreadable draft for recovery without restoring it into the wrong form", async () => {
    // Given a draft written by a version whose shape no longer parses.
    const { sqlite, db } = await deviceFor(owner);
    try {
      sqlite
        .prepare(
          "INSERT INTO observation_drafts (owner_scope, id, updated_at, payload) VALUES (?, ?, ?, ?)",
        )
        .run(owner, draft.id, draft.updatedAt, JSON.stringify({ answers: "not a record" }));
      // When recovery runs.
      // Then it declines resume but preserves the original answers for recovery.
      await expect(readDraft(db, owner)).rejects.toThrow(/retained/);
      expect(sqlite.prepare("SELECT COUNT(*) AS total FROM observation_drafts").get()).toEqual({
        total: 1,
      });
    } finally {
      sqlite.close();
    }
  });

  it("refuses a draft whose payload names an account other than the row it sits in", async () => {
    // Given a draft row whose stored owner disagrees with its account scope.
    const { sqlite, db } = await deviceFor(owner);
    try {
      sqlite
        .prepare(
          "INSERT INTO observation_drafts (owner_scope, id, updated_at, payload) VALUES (?, ?, ?, ?)",
        )
        .run("account-b", draft.id, draft.updatedAt, JSON.stringify({ ...mine, owner }));
      // When that account opens the app.
      // Then the draft is refused and preserved, so one observer's answers cannot change hands.
      await expect(readDraft(db, "account-b")).rejects.toThrow(/retained/);
      expect(sqlite.prepare("SELECT COUNT(*) AS total FROM observation_drafts").get()).toEqual({
        total: 1,
      });
    } finally {
      sqlite.close();
    }
  });

  it("clears the draft when the observation is saved or discarded", async () => {
    // Given a stored draft.
    const { sqlite, db } = await deviceFor(owner);
    try {
      await saveDraft(db, owner, mine);
      // When it is cleared.
      await clearDraft(db, owner);
      // Then nothing remains to be offered on the next launch.
      expect(await readDraft(db, owner)).toBeNull();
    } finally {
      sqlite.close();
    }
  });
});

const finished = instrumentObservationSchema.parse({
  id: draft.id,
  projectId: binding.projectId,
  siteId: draft.siteId,
  formVersion: "janet-test-v1",
  coordinates: draft.coordinates,
  observer: "JL",
  answers: { ...draft.answers, observer_initials: "JL" },
  context: draft.context,
  placement: { source: "hand", gpsAccuracyMetres: null },
  createdAt: "2026-09-22T14:32:00.000Z",
  storageStatus: "pending",
  binding,
});

describe("Finishing an observation", () => {
  it("stores the record and retires its draft in one step", async () => {
    // Given an observation in progress.
    const { sqlite, db } = await deviceFor(owner);
    try {
      await saveDraft(db, owner, mine);
      // When it is saved.
      await commitObservation(db, finished, owner);
      // Then the record exists and nothing is left to be offered back on the next launch.
      expect(await listObservations(db, owner)).toHaveLength(1);
      expect(await readDraft(db, owner)).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("keeps the draft when the record cannot be stored", async () => {
    // Given a record identifier that is already taken, so the insert must fail.
    const { sqlite, db } = await deviceFor(owner);
    try {
      await commitObservation(db, finished, owner);
      await saveDraft(db, owner, mine);
      // When the same observation is committed a second time.
      const second = commitObservation(db, finished, owner);
      // Then the whole step rolls back: no duplicate record, and the draft is still recoverable
      // rather than deleted against a save that never happened.
      await expect(second).rejects.toThrow();
      expect(await listObservations(db, owner)).toHaveLength(1);
      expect(await readDraft(db, owner)).not.toBeNull();
    } finally {
      sqlite.close();
    }
  });
});
