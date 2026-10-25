import { z } from "zod";
import { isBoundObservation } from "../domain/observation";
import { isUploadableRecord } from "../forms/registry";
import { receiptSchema, type SyncScope } from "../sync/contracts";
import { readOwnerScope, receiptMatches } from "../sync/receipt";
import { databaseTransaction, databaseWrite } from "./database-write";
import type { LocalDatabase } from "./observation-store";
import { encodeUploadPayload, readUploadPayload } from "./upload-payload";

const storedRows = z.array(z.object({ payload: z.string(), attempts: z.number().int() }));
function sendable(rows: z.infer<typeof storedRows>) {
  return rows.flatMap((row) => {
    const item = readUploadPayload(row.payload);
    return isUploadableRecord(item.record) && item.body !== undefined
      ? [{ record: item.record, body: item.body, attempts: row.attempts }]
      : [];
  });
}
async function eligibleRows(db: LocalDatabase, sql: string, ...parameters: (string | number)[]) {
  return sendable(storedRows.parse(await db.getAllAsync(sql, ...parameters)));
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
const PAGE = 25;
const cursorRows = z.array(
  z.object({
    payload: z.string(),
    attempts: z.number().int(),
    created_at: z.string(),
    id: z.string(),
  }),
);

/**
 * The oldest due pending records that can be sent, at most one page of them. A pending record that
 * cannot be sent (no frozen body, or not uploadable) is skipped here and never counts toward the page,
 * so a page shorter than a full one really means that no other sendable record is due: the drain
 * stops on that, and a stuck record cannot keep the sendable ones behind it from being sent.
 */
export function pendingObservations(db: LocalDatabase, scope: string, now: number) {
  return databaseWrite(db, async () => {
    const found: ReturnType<typeof sendable> = [];
    let after: { createdAt: string; id: string } | undefined;
    for (;;) {
      const rows = cursorRows.parse(
        await db.getAllAsync(
          `SELECT payload, attempts, created_at, id FROM observations WHERE owner_scope = ? AND sync_state = 'pending' AND next_attempt_at <= ?${
            after ? " AND (created_at, id) > (?, ?)" : ""
          } ORDER BY created_at, id LIMIT ${PAGE}`,
          scope,
          now,
          ...(after ? [after.createdAt, after.id] : []),
        ),
      );
      found.push(...sendable(rows));
      const last = rows.at(-1);
      if (found.length >= PAGE || rows.length < PAGE || !last) return found.slice(0, PAGE);
      after = { createdAt: last.created_at, id: last.id };
    }
  });
}

/**
 * Existing schema-six records were held by MOB-28. Freeze their own saved body once, atomically.
 * True when a held record became pending, so the screens that list records read them again.
 */
export function activateHeldObservations(
  db: LocalDatabase,
  owner: string,
  scope: SyncScope,
  current: () => boolean = () => true,
): Promise<boolean> {
  const storedOwner = readOwnerScope(owner);
  if (
    !storedOwner ||
    storedOwner.issuer !== scope.issuer ||
    storedOwner.userId !== scope.userId ||
    storedOwner.projectId !== scope.projectId
  )
    return Promise.resolve(false);
  return databaseTransaction(db, async () => {
    let activated = false;
    const rows = z
      .array(z.object({ payload: z.string() }))
      .parse(
        await db.getAllAsync(
          "SELECT payload FROM observations WHERE owner_scope = ? AND sync_state = 'local-only'",
          owner,
        ),
      );
    for (const row of rows) {
      if (!current()) return activated;
      const { record, body } = readUploadPayload(row.payload);
      if (!isBoundObservation(record) || record.binding.issuer !== scope.issuer) continue;
      await db.runAsync(
        "UPDATE observations SET payload = ?, sync_state = 'pending' WHERE owner_scope = ? AND id = ? AND sync_state = 'local-only'",
        body === undefined ? encodeUploadPayload(record) : row.payload,
        owner,
        record.id,
      );
      activated = true;
    }
    return activated;
  });
}

/** True when the receipt moved the record to synced; false when it matched nothing and changed nothing. */
export function acknowledge(
  db: LocalDatabase,
  owner: string,
  value: unknown,
  expectedId?: string,
  current: () => boolean = () => true,
): Promise<boolean> {
  return databaseWrite(db, async () => {
    const parsed = receiptSchema.safeParse(value);
    const scope = readOwnerScope(owner);
    if (
      !parsed.success ||
      !scope ||
      !current() ||
      (expectedId !== undefined && expectedId !== parsed.data.observation_id)
    )
      return false;
    const item = await eligiblePending(db, owner, parsed.data.observation_id);
    if (!item || !receiptMatches(parsed.data, item.record, scope) || !current()) return false;
    await db.runAsync(
      "UPDATE observations SET sync_state = 'synced', sync_error = '', server_receipt = ? WHERE id = ? AND owner_scope = ? AND sync_state = 'pending'",
      JSON.stringify(parsed.data),
      item.record.id,
      owner,
    );
    return true;
  });
}

/**
 * Records a failed attempt and when the next one may start. True when what a screen shows about the
 * record changed (its state or its message); a repeat of the same failure only moves the delay.
 */
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
): Promise<boolean> {
  return databaseWrite(db, async () => {
    if (!current() || !(await eligiblePending(db, owner, id)) || !current()) return false;
    const state = rejected ? "needs-attention" : "pending";
    const error = code ? JSON.stringify({ message, code, issueCodes }) : message;
    const shown = z
      .array(z.object({ sync_state: z.string(), sync_error: z.string() }))
      .parse(
        await db.getAllAsync(
          "SELECT sync_state, sync_error FROM observations WHERE id = ? AND owner_scope = ?",
          id,
          owner,
        ),
      )[0];
    await db.runAsync(
      "UPDATE observations SET sync_state = ?, sync_error = ?, attempts = attempts + 1, next_attempt_at = ? WHERE id = ? AND owner_scope = ? AND sync_state = 'pending'",
      state,
      error,
      nextAttempt,
      id,
      owner,
    );
    return shown?.sync_state !== state || shown.sync_error !== error;
  });
}

/**
 * Connectivity or the foreground came back: pending records still waiting out a retry delay become
 * due at `at` (now, or a later time the caller must still respect). Never moves a record later, never
 * touches a record that needs attention, and changes nothing a screen shows.
 */
export function releaseBackoff(
  db: LocalDatabase,
  scope: string,
  now: number,
  at: number,
  current: () => boolean = () => true,
): Promise<void> {
  return databaseWrite(db, async () => {
    if (!current()) return;
    const later = at > now;
    await db.runAsync(
      "UPDATE observations SET next_attempt_at = ? WHERE owner_scope = ? AND sync_state = 'pending' AND next_attempt_at > ?",
      later ? at : 0,
      scope,
      later ? at : now,
    );
  });
}

/**
 * Every pending record of an account with the moment it may be tried, earliest first (a moment that
 * has passed is still named). The caller decides which of them it has already woken in vain.
 */
export function pendingRetries(db: LocalDatabase, scope: string) {
  return databaseWrite(db, async () =>
    z
      .array(z.object({ id: z.string(), at: z.number().int() }))
      .parse(
        await db.getAllAsync(
          "SELECT id, next_attempt_at AS at FROM observations WHERE owner_scope = ? AND sync_state = 'pending' ORDER BY next_attempt_at, id",
          scope,
        ),
      ),
  );
}

const retryHoldKey = (scope: string) => `retry_after:${scope}`;

/**
 * The latest time (ms) a server asked this account to wait until, or 0. It is kept on this device,
 * so closing and reopening the app does not forget it.
 */
export function readRetryHold(db: LocalDatabase, scope: string): Promise<number> {
  return databaseWrite(db, async () => {
    const [row] = z
      .array(z.object({ value: z.string() }))
      .parse(
        await db.getAllAsync("SELECT value FROM local_metadata WHERE key = ?", retryHoldKey(scope)),
      );
    const until = Number(row?.value);
    return Number.isFinite(until) ? until : 0;
  });
}

/** Keeps the later of the stored deadline and `until`; never moves a server's deadline closer. */
export function raiseRetryHold(
  db: LocalDatabase,
  scope: string,
  until: number,
  current: () => boolean = () => true,
): Promise<void> {
  return databaseWrite(db, async () => {
    if (!current()) return;
    await db.runAsync(
      "INSERT INTO local_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = CAST(MAX(CAST(value AS INTEGER), CAST(excluded.value AS INTEGER)) AS TEXT)",
      retryHoldKey(scope),
      String(Math.trunc(until)),
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
