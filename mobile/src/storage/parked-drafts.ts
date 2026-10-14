import { z } from "zod";
import { databaseTransaction, databaseWrite } from "./database-write";
import { DraftConflictError, type ObservationDraft, observationDraftSchema } from "./draft-store";
import type { LocalDatabase } from "./observation-store";

const rowsSchema = z.array(z.object({ payload: z.string() }));

export function listParkedDrafts(db: LocalDatabase, owner: string): Promise<ObservationDraft[]> {
  return databaseWrite(db, async () => {
    const rows = rowsSchema.parse(
      await db.getAllAsync(
        "SELECT payload FROM parked_observation_drafts WHERE owner_scope = ? ORDER BY updated_at DESC, id",
        owner,
      ),
    );
    return rows
      .map((row) => observationDraftSchema.parse(JSON.parse(row.payload)))
      .filter((draft) => draft.owner === owner);
  });
}

export function parkDraft(db: LocalDatabase, owner: string, id: string): Promise<void> {
  return databaseTransaction(db, async () => {
    await db.runAsync(
      `INSERT INTO parked_observation_drafts (owner_scope,id,updated_at,payload,package_key)
       SELECT owner_scope,id,updated_at,payload,package_key FROM observation_drafts WHERE owner_scope = ? AND id = ?`,
      owner,
      id,
    );
    await db.runAsync("DELETE FROM observation_drafts WHERE owner_scope = ? AND id = ?", owner, id);
  });
}

export function activateParkedDraft(
  db: LocalDatabase,
  owner: string,
  id: string,
): Promise<ObservationDraft | null> {
  return databaseTransaction(db, async () => {
    const active = rowsSchema.parse(
      await db.getAllAsync("SELECT payload FROM observation_drafts WHERE owner_scope = ?", owner),
    );
    if (active.length) throw new DraftConflictError();
    const rows = rowsSchema.parse(
      await db.getAllAsync(
        "SELECT payload FROM parked_observation_drafts WHERE owner_scope = ? AND id = ?",
        owner,
        id,
      ),
    );
    const row = rows[0];
    if (!row) return null;
    const draft = observationDraftSchema.parse(JSON.parse(row.payload));
    if (draft.owner !== owner) throw new DraftConflictError();
    await db.runAsync(
      `INSERT INTO observation_drafts (owner_scope,id,updated_at,payload,package_key)
       SELECT owner_scope,id,updated_at,payload,package_key FROM parked_observation_drafts WHERE owner_scope = ? AND id = ?`,
      owner,
      id,
    );
    await db.runAsync(
      "DELETE FROM parked_observation_drafts WHERE owner_scope = ? AND id = ?",
      owner,
      id,
    );
    return draft;
  });
}

export function discardParkedDraft(db: LocalDatabase, owner: string, id: string): Promise<void> {
  return databaseWrite(db, async () => {
    await db.runAsync(
      "DELETE FROM parked_observation_drafts WHERE owner_scope = ? AND id = ?",
      owner,
      id,
    );
  });
}
