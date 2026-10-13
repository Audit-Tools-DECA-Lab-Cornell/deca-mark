import { z } from "zod";
import { isBoundObservation, observationSchema } from "../domain/observation";
import { isUploadableRecord } from "../forms/registry";
import type { Receipt } from "../sync/contracts";
import { databaseWrite } from "./database-write";
import type { LocalDatabase } from "./observation-store";

async function eligibleRows(db: LocalDatabase, sql: string, ...parameters: (string | number)[]) {
  const rows = z
    .array(z.object({ payload: z.string(), attempts: z.number().int() }))
    .parse(await db.getAllAsync(sql, ...parameters));
  return rows
    .map((row) => ({
      record: observationSchema.parse(JSON.parse(row.payload)),
      attempts: row.attempts,
    }))
    .filter((item) => isBoundObservation(item.record) && isUploadableRecord(item.record));
}

async function eligiblePending(db: LocalDatabase, scope: string, id: string): Promise<boolean> {
  return (
    (
      await eligibleRows(
        db,
        "SELECT payload, attempts FROM observations WHERE owner_scope = ? AND id = ? AND sync_state = 'pending'",
        scope,
        id,
      )
    ).length > 0
  );
}

export function pendingObservations(db: LocalDatabase, scope: string, now: number) {
  return databaseWrite(db, () =>
    eligibleRows(
      db,
      "SELECT payload, attempts FROM observations WHERE owner_scope = ? AND sync_state = 'pending' AND next_attempt_at <= ? ORDER BY created_at, id LIMIT 25",
      scope,
      now,
    ),
  );
}

export function acknowledge(db: LocalDatabase, scope: string, receipt: Receipt): Promise<void> {
  return databaseWrite(db, async () => {
    if (!(await eligiblePending(db, scope, receipt.observation_id))) return;
    await db.runAsync(
      "UPDATE observations SET sync_state = 'synced', sync_error = '', server_receipt = ? WHERE id = ? AND owner_scope = ? AND sync_state = 'pending'",
      JSON.stringify(receipt),
      receipt.observation_id,
      scope,
    );
  });
}

export function deferObservation(
  db: LocalDatabase,
  scope: string,
  id: string,
  message: string,
  nextAttempt: number,
  rejected: boolean,
): Promise<void> {
  return databaseWrite(db, async () => {
    if (!(await eligiblePending(db, scope, id))) return;
    await db.runAsync(
      "UPDATE observations SET sync_state = ?, sync_error = ?, attempts = attempts + 1, next_attempt_at = ? WHERE id = ? AND owner_scope = ? AND sync_state = 'pending'",
      rejected ? "needs-attention" : "pending",
      message,
      nextAttempt,
      id,
      scope,
    );
  });
}

export function retryAttention(db: LocalDatabase, scope: string): Promise<void> {
  return databaseWrite(db, async () => {
    const rows = await eligibleRows(
      db,
      "SELECT payload, attempts FROM observations WHERE owner_scope = ? AND sync_state IN ('pending', 'needs-attention')",
      scope,
    );
    for (const row of rows)
      await db.runAsync(
        "UPDATE observations SET sync_state = 'pending', sync_error = '', next_attempt_at = 0 WHERE owner_scope = ? AND id = ? AND sync_state IN ('pending', 'needs-attention')",
        scope,
        row.record.id,
      );
  });
}
