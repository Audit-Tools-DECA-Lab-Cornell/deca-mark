import { describe, expect, it } from "vitest";
import { clearDraft, hasDraft, observationDraftSchema, readDraft, saveDraft } from "./draft-store";
import { commitObservation } from "./observation-store";
import { installPackage } from "./package-catalog";
import {
  boundDraft,
  boundRecord,
  entry,
  memoryDatabase,
  otherOwner,
  owner,
} from "./package-store.fixture";

describe("Retained draft replacement safety", () => {
  it("rejects a bound draft whose site differs from the frozen package site", () => {
    for (const siteId of ["unbound-site-code", "20000000-0000-4000-8000-000000000009"])
      expect(observationDraftSchema.safeParse({ ...boundDraft, siteId }).success).toBe(false);
  });

  for (const raw of ["{ corrupt JSON", JSON.stringify({ ...boundDraft, owner: otherOwner })]) {
    it("blocks a new draft while an unreadable or owner-mismatched original exists", async () => {
      const { db, sqlite } = await memoryDatabase();
      try {
        await installPackage(db, owner, entry);
        sqlite
          .prepare(
            "INSERT INTO observation_drafts (owner_scope,id,updated_at,payload) VALUES (?,?,?,?)",
          )
          .run(owner, boundDraft.id, boundDraft.updatedAt, raw);
        await expect(readDraft(db, owner)).rejects.toThrow(/retained/);
        expect(await hasDraft(db, owner)).toBe(true);
        expect(await hasDraft(db, otherOwner)).toBe(false);
        const next = { ...boundDraft, id: "60000000-0000-4000-8000-000000000002" };
        await expect(saveDraft(db, owner, next)).rejects.toThrow(/unfinished draft/);
        expect(sqlite.prepare("SELECT id,payload FROM observation_drafts").get()).toEqual({
          id: boundDraft.id,
          payload: raw,
        });
        await clearDraft(db, owner);
        expect(await hasDraft(db, owner)).toBe(false);
        await saveDraft(db, owner, next);
        expect((await readDraft(db, owner))?.id).toBe(next.id);
      } finally {
        sqlite.close();
      }
    });
  }

  it("allows the same draft ID to receive another answer", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveDraft(db, owner, boundDraft);
      await saveDraft(db, owner, { ...boundDraft, answers: { number: 2 }, questionIndex: 2 });
      expect(await readDraft(db, owner)).toMatchObject({
        id: boundDraft.id,
        answers: { number: 2 },
        questionIndex: 2,
      });
    } finally {
      sqlite.close();
    }
  });

  it("does not retire another draft when a different observation is committed", async () => {
    const { db, sqlite } = await memoryDatabase();
    try {
      await installPackage(db, owner, entry);
      await saveDraft(db, owner, boundDraft);
      await commitObservation(
        db,
        { ...boundRecord, id: "60000000-0000-4000-8000-000000000002" },
        owner,
      );
      expect(await readDraft(db, owner)).toEqual(boundDraft);
    } finally {
      sqlite.close();
    }
  });
});
