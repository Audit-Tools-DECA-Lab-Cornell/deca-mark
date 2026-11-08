import { z } from "zod";
import { type Observation, observationSchema, storageStatusSchema } from "../domain/observation";
import { identityKey } from "../domain/package-binding";
import { databaseTransaction, databaseWrite } from "./database-write";
import { requireAuthorizedPackage } from "./package-catalog-read";
import { encodeUploadPayload, readSyncFailure, readUploadPayload } from "./upload-payload";

export interface LocalDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...parameters: (string | number)[]): Promise<unknown>;
  getAllAsync(sql: string, ...parameters: (string | number)[]): Promise<unknown[]>;
}

export {
  completePackageFileReset,
  initializeDatabase,
  packageFileResetPending,
  SCHEMA_VERSION,
} from "./database-migrations";

async function insertObservation(db: LocalDatabase, record: Observation, scope: string) {
  const { binding } = record;
  await requireAuthorizedPackage(db, scope, binding);
  await db.runAsync(
    "INSERT INTO observations (id, created_at, payload, owner_scope, sync_state, package_key) VALUES (?, ?, ?, ?, ?, ?)",
    record.id,
    record.createdAt,
    encodeUploadPayload(record),
    scope,
    "pending",
    identityKey(binding),
  );
}

export function saveObservation(
  db: LocalDatabase,
  record: Observation,
  scope: string,
): Promise<void> {
  const snapshot = observationSchema.parse(record);
  return databaseTransaction(db, () => insertObservation(db, snapshot, scope));
}

/**
 * Finishing an observation: store the record and retire its draft in one transaction.
 *
 * Done as two statements, a crash between them would leave a draft carrying an identifier the
 * observations table already holds — recovery would offer it back, and saving it again would
 * fail the primary key forever.
 */
export function commitObservation(
  db: LocalDatabase,
  record: Observation,
  scope: string,
): Promise<void> {
  const snapshot = observationSchema.parse(record);
  return databaseTransaction(db, async () => {
    await insertObservation(db, snapshot, scope);
    await db.runAsync(
      "DELETE FROM observation_drafts WHERE owner_scope = ? AND id = ?",
      scope,
      snapshot.id,
    );
  });
}

export function listObservations(db: LocalDatabase, scope: string): Promise<Observation[]> {
  return databaseWrite(db, async () => {
    const rows = z
      .array(
        z.object({
          payload: z.string(),
          sync_state: z.string(),
          sync_error: z.string(),
        }),
      )
      .parse(
        await db.getAllAsync(
          "SELECT payload, sync_state, sync_error FROM observations WHERE owner_scope = ? ORDER BY created_at DESC, id DESC",
          scope,
        ),
      );
    // A row left in the retired `local-only` state is a practice record from before MOB-43: it can
    // never upload, so it stays stored (MOB-44's reset removes it) and is not listed.
    return rows.flatMap((row) => {
      const state = storageStatusSchema.safeParse(row.sync_state);
      return state.success
        ? [
            {
              ...readUploadPayload(row.payload).record,
              storageStatus: state.data,
              ...readSyncFailure(row.sync_error),
            },
          ]
        : [];
    });
  });
}
