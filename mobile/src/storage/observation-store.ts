import { z } from "zod";
import {
  isBoundObservation,
  type Observation,
  observationSchema,
  storageStatusSchema,
} from "../domain/observation";
import { identityKey } from "../domain/package-binding";
import { isUploadableRecord } from "../forms/registry";
import { databaseTransaction, databaseWrite } from "./database-write";
import { requireAuthorizedPackage } from "./package-catalog-read";

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

export function initialSyncState(record: Observation, scope: string) {
  return scope === "local" || !isBoundObservation(record) || !isUploadableRecord(record)
    ? "local-only"
    : "pending";
}

async function insertObservation(db: LocalDatabase, record: Observation, scope: string) {
  const binding = isBoundObservation(record) ? record.binding : null;
  if (binding) await requireAuthorizedPackage(db, scope, binding);
  await db.runAsync(
    "INSERT INTO observations (id, created_at, payload, owner_scope, sync_state, package_key) VALUES (?, ?, ?, ?, ?, ?)",
    record.id,
    record.createdAt,
    JSON.stringify(record),
    scope,
    initialSyncState(record, scope),
    binding ? identityKey(binding) : "",
  );
}

export function saveObservation(
  db: LocalDatabase,
  record: Observation,
  scope = "local",
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
  scope = "local",
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

export function listObservations(db: LocalDatabase, scope = "local"): Promise<Observation[]> {
  return databaseWrite(db, async () => {
    const rows = z
      .array(
        z.object({
          payload: z.string(),
          sync_state: storageStatusSchema,
          sync_error: z.string(),
        }),
      )
      .parse(
        await db.getAllAsync(
          "SELECT payload, sync_state, sync_error FROM observations WHERE owner_scope = ? ORDER BY created_at DESC, id DESC",
          scope,
        ),
      );
    return rows.map((row) => ({
      ...observationSchema.parse(JSON.parse(row.payload)),
      storageStatus: row.sync_state,
      syncError: row.sync_error,
    }));
  });
}
