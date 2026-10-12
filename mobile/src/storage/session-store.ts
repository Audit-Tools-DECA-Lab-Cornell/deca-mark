import { z } from "zod";
import { roundContextSchema } from "../domain/observation";
import { identityKey, packageIdentitySchema } from "../domain/package-binding";
import { roundTypeSchema } from "../domain/rounds";
import { databaseTransaction, databaseWrite } from "./database-write";
import type { LocalDatabase } from "./observation-store";
import { requireAuthorizedPackage } from "./package-catalog-read";

export const durableSessionSchema = z
  .strictObject({
    identity: packageIdentitySchema,
    zoneCode: z.string().min(1),
    zoneId: z.uuid().optional(),
    roundType: roundTypeSchema,
    freshPeriod: z.boolean(),
    playFormVersion: z.string().min(1),
    inventoryFormVersion: z.string().min(1).nullable(),
    context: roundContextSchema,
  })
  .refine(
    (session) =>
      session.identity.packageId === session.context.packageId &&
      `v${session.identity.packageVersion}` === session.context.packageVersion &&
      session.zoneCode === session.context.zoneId &&
      session.roundType === session.context.roundType &&
      session.freshPeriod === session.context.freshPeriod,
    "The durable session must match its frozen context.",
  );
export type DurableSession = Readonly<z.infer<typeof durableSessionSchema>>;

export function saveSession(
  db: LocalDatabase,
  owner: string,
  input: DurableSession,
): Promise<void> {
  const session = durableSessionSchema.parse(input);
  return databaseTransaction(db, async () => {
    await requireAuthorizedPackage(db, owner, session.identity);
    await db.runAsync(
      `INSERT INTO active_sessions (owner_scope, package_key, payload) VALUES (?, ?, ?)
       ON CONFLICT(owner_scope) DO UPDATE SET package_key = excluded.package_key, payload = excluded.payload`,
      owner,
      identityKey(session.identity),
      JSON.stringify(session),
    );
  });
}

export function readSession(db: LocalDatabase, owner: string): Promise<DurableSession | null> {
  return databaseWrite(db, async () => {
    const rows = z
      .array(z.object({ payload: z.string() }))
      .parse(
        await db.getAllAsync("SELECT payload FROM active_sessions WHERE owner_scope = ?", owner),
      );
    return rows[0] ? durableSessionSchema.parse(JSON.parse(rows[0].payload)) : null;
  });
}

export function clearSession(db: LocalDatabase, owner: string): Promise<void> {
  return databaseWrite(db, async () => {
    await db.runAsync("DELETE FROM active_sessions WHERE owner_scope = ?", owner);
  });
}
