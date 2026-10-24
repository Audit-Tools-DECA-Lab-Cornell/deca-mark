import { z } from "zod";
import { databaseTransaction } from "./database-write";
import type { LocalDatabase } from "./observation-store";

const ownedTables = [
  "observations",
  "observation_drafts",
  "parked_observation_drafts",
  "package_authorizations",
  "available_current_packages",
] as const;

const ownerMatch = `CASE WHEN json_valid(owner_scope)
  THEN json_extract(owner_scope, '$[1]') = ? AND json_extract(owner_scope, '$[2]') = ?
  ELSE 0 END`;
const countResult = z.tuple([z.object({ n: z.number().int().nonnegative() })]);

export type RemovedAccountData = Readonly<Record<(typeof ownedTables)[number], number>>;

export function removeAccountData(
  db: LocalDatabase,
  issuer: string,
  userId: string,
): Promise<RemovedAccountData> {
  return databaseTransaction(db, async () => {
    const removed = {
      observations: 0,
      observation_drafts: 0,
      parked_observation_drafts: 0,
      package_authorizations: 0,
      available_current_packages: 0,
    };
    for (const table of ownedTables) {
      const [row] = countResult.parse(
        await db.getAllAsync(
          `SELECT COUNT(*) AS n FROM ${table} WHERE ${ownerMatch}`,
          issuer,
          userId,
        ),
      );
      await db.runAsync(`DELETE FROM ${table} WHERE ${ownerMatch}`, issuer, userId);
      removed[table] = row.n;
    }
    return removed;
  });
}
