import { z } from "zod";
import { isBoundObservation } from "../domain/observation";
import { isUploadableRecord } from "../forms/registry";
import { receiptSchema, type SyncScope } from "../sync/contracts";
import { readOwnerScope, receiptMatches } from "../sync/receipt";
import { databaseTransaction, databaseWrite } from "./database-write";
import type { LocalDatabase } from "./observation-store";
import { encodeUploadPayload, readUploadPayload } from "./upload-payload";

async function eligibleRows(db: LocalDatabase, sql: string, ...parameters: (string | number)[]) {
  const rows = z
    .array(z.object({ payload: z.string(), attempts: z.number().int() }))
    .parse(await db.getAllAsync(sql, ...parameters));
  return rows.flatMap((row) => {
    const item = readUploadPayload(row.payload);
    return isUploadableRecord(item.record) && item.body !== undefined
      ? [{ record: item.record, body: item.body, attempts: row.attempts }]
      : [];
  });
}
async function eligiblePending(db: LocalDatabase, scope: string, id: string) {
  return (
    await eligibleRows(
      db,
      "SELECT payload, attempts FROM observations WHERE owner_scope = ? AND id = ? AND sync_state = 'pending'",
      scope,
      id,
    )
  )[0];
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

/** Existing schema-six records were held by MOB-28. Freeze their own saved body once, atomically. */
export function activateHeldObservations(
  db: LocalDatabase,
  owner: string,
  scope: SyncScope,
  current: () => boolean = () => true,
): Promise<void> {
  const storedOwner = readOwnerScope(owner);
  if (
    !storedOwner ||
    storedOwner.issuer !== scope.issuer ||
    storedOwner.userId !== scope.userId ||
    storedOwner.projectId !== scope.projectId
  )
    return Promise.resolve();
  return databaseTransaction(db, async () => {
    const rows = z
      .array(z.object({ payload: z.string() }))
      .parse(
        await db.getAllAsync(
          "SELECT payload FROM observations WHERE owner_scope = ? AND sync_state = 'local-only'",
          owner,
        ),
      );
    for (const row of rows) {
      if (!current()) return;
      const { record, body } = readUploadPayload(row.payload);
      if (!isBoundObservation(record) || record.binding.issuer !== scope.issuer) continue;
      await db.runAsync(
        "UPDATE observations SET payload = ?, sync_state = 'pending' WHERE owner_scope = ? AND id = ? AND sync_state = 'local-only'",
        body === undefined ? encodeUploadPayload(record) : row.payload,
        owner,
        record.id,
      );
    }
  });
}

export function acknowledge(
  db: LocalDatabase,
  owner: string,
  value: unknown,
  expectedId?: string,
  current: () => boolean = () => true,
): Promise<void> {
  return databaseWrite(db, async () => {
    const parsed = receiptSchema.safeParse(value);
    const scope = readOwnerScope(owner);
    if (
      !parsed.success ||
      !scope ||
      !current() ||
      (expectedId !== undefined && expectedId !== parsed.data.observation_id)
    )
      return;
    const item = await eligiblePending(db, owner, parsed.data.observation_id);
    if (!item || !receiptMatches(parsed.data, item.record, scope) || !current()) return;
    await db.runAsync(
      "UPDATE observations SET sync_state = 'synced', sync_error = '', server_receipt = ? WHERE id = ? AND owner_scope = ? AND sync_state = 'pending'",
      JSON.stringify(parsed.data),
      item.record.id,
      owner,
    );
  });
}

export function deferObservation(
  db: LocalDatabase,
  owner: string,
  id: string,
  message: string,
  nextAttempt: number,
  rejected: boolean,
  code?: string,
  current: () => boolean = () => true,
  issueCodes: readonly string[] = [],
): Promise<void> {
  return databaseWrite(db, async () => {
    if (!current() || !(await eligiblePending(db, owner, id)) || !current()) return;
    await db.runAsync(
      "UPDATE observations SET sync_state = ?, sync_error = ?, attempts = attempts + 1, next_attempt_at = ? WHERE id = ? AND owner_scope = ? AND sync_state = 'pending'",
      rejected ? "needs-attention" : "pending",
      code ? JSON.stringify({ message, code, issueCodes }) : message,
      nextAttempt,
      id,
      owner,
    );
  });
}
export function retryAttention(
  db: LocalDatabase,
  scope: string,
  current: () => boolean = () => true,
): Promise<void> {
  return databaseWrite(db, async () => {
    const rows = await eligibleRows(
      db,
      "SELECT payload, attempts FROM observations WHERE owner_scope = ? AND sync_state IN ('pending', 'needs-attention')",
      scope,
    );
    for (const row of rows) {
      if (!current()) return;
      await db.runAsync(
        "UPDATE observations SET sync_state = 'pending', sync_error = '', next_attempt_at = 0 WHERE owner_scope = ? AND id = ? AND sync_state IN ('pending', 'needs-attention')",
        scope,
        row.record.id,
      );
    }
  });
}
