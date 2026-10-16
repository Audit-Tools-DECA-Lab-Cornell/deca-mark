import { describe, expect, it } from "vitest";
import { readDraft, saveDraft } from "./draft-store";
import { commitObservation, listObservations, saveObservation } from "./observation-store";
import { installPackage, removePackage } from "./package-catalog";
import {
  boundDraft,
  boundRecord,
  entry,
  identity,
  memoryDatabase,
  otherOwner,
  owner,
  session,
} from "./package-store.fixture";
import { clearSession, saveSession } from "./session-store";
import { acknowledge, pendingObservations, retryAttention } from "./sync-store";

describe("Durable package references", () => {
  it("refuses an active session or unfinished draft, then retains a synced record's reference", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveSession(db, owner, session);
      await saveDraft(db, owner, boundDraft);
      expect(await removePackage(db, owner, identity)).toMatchObject({
        removed: false,
        reasons: { sessions: 1, drafts: 1, records: 0 },
      });
      await clearSession(db, owner);
      await commitObservation(db, boundRecord, owner);
      expect(await readDraft(db, owner)).toBeNull();
      sqlite.prepare("UPDATE observations SET sync_state = 'synced'").run();
      expect(await removePackage(db, owner, identity)).toMatchObject({
        removed: false,
        reasons: { sessions: 0, drafts: 0, records: 1 },
      });
    } finally {
      sqlite.close();
    }
  });

  it("cannot store a bound record under an account that has only the shared file", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await expect(saveObservation(db, boundRecord, otherOwner)).rejects.toThrow(/not installed/);
      expect(sqlite.prepare("SELECT COUNT(*) total FROM observations").get()).toEqual({ total: 0 });
    } finally {
      sqlite.close();
    }
  });

  it("rolls back a failed commit without losing its draft or package reference", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveDraft(db, owner, boundDraft);
      sqlite.exec(
        "CREATE TRIGGER fail_draft_delete BEFORE DELETE ON observation_drafts BEGIN SELECT RAISE(ABORT, 'delete interrupted'); END;",
      );
      await expect(commitObservation(db, boundRecord, owner)).rejects.toThrow("delete interrupted");
      expect(await readDraft(db, owner)).toEqual(boundDraft);
      expect(sqlite.prepare("SELECT COUNT(*) total FROM observations").get()).toEqual({ total: 0 });
      expect((await removePackage(db, owner, identity)).reasons.drafts).toBe(1);
    } finally {
      sqlite.close();
    }
  });

  it("queues retained bound records and acknowledges only a complete exact receipt", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveObservation(db, boundRecord, owner);
      expect(sqlite.prepare("SELECT sync_state FROM observations").get()).toEqual({
        sync_state: "pending",
      });
      sqlite.exec("UPDATE observations SET sync_state = 'needs-attention';");
      await retryAttention(db, owner);
      expect(await pendingObservations(db, owner, Date.now())).toHaveLength(1);
      await acknowledge(db, owner, {
        observation_id: boundRecord.id,
        project_id: identity.projectId,
        user_id: "40000000-0000-4000-8000-000000000001",
        accepted_revision: 1,
        received_at: boundRecord.createdAt,
      });
      expect(sqlite.prepare("SELECT sync_state, server_receipt FROM observations").get()).toEqual({
        sync_state: "pending",
        server_receipt: "",
      });
      expect((await removePackage(db, owner, identity)).reasons.records).toBe(1);
    } finally {
      sqlite.close();
    }
  });

  it("freezes answers before async storage work can observe caller mutations", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      const record = { ...boundRecord, answers: { text: "Original answer" } };
      const storing = saveObservation(db, record, owner);
      record.answers.text = "Later mutation";
      await storing;
      expect((await listObservations(db, owner))[0]).toMatchObject({
        answers: { text: "Original answer" },
      });
      const draft = { ...boundDraft, answers: { number: 0 } };
      const drafting = saveDraft(db, owner, draft);
      draft.answers.number = 9;
      await drafting;
      expect((await readDraft(db, owner))?.answers).toEqual({ number: 0 });
    } finally {
      sqlite.close();
    }
  });
});
