import { z } from "zod";
import { identityKey, type PackageIdentity } from "../domain/package-binding";
import type { VersionReferences } from "../packages/zone-model-types";
import { databaseWrite } from "./database-write";
import type { LocalDatabase } from "./observation-store";
import { packageReferences } from "./package-references";

export function zoneReferences(
  db: LocalDatabase,
  owner: string,
  identity: PackageIdentity,
): Promise<VersionReferences> {
  return databaseWrite(db, async () => {
    const references = await packageReferences(db, owner, identity);
    const rows = z
      .array(
        z.object({
          sync_state: z.enum(["local-only", "pending", "synced", "needs-attention"]),
          total: z.number().int().nonnegative(),
        }),
      )
      .parse(
        await db.getAllAsync(
          "SELECT sync_state,COUNT(*) total FROM observations WHERE owner_scope = ? AND package_key = ? GROUP BY sync_state",
          owner,
          identityKey(identity),
        ),
      );
    return {
      unfinished: references.drafts,
      unsent: rows
        .filter((row) => row.sync_state === "local-only" || row.sync_state === "pending")
        .reduce((sum, row) => sum + row.total, 0),
      attention: rows.find((row) => row.sync_state === "needs-attention")?.total ?? 0,
      retained: rows.find((row) => row.sync_state === "synced")?.total ?? 0,
      openSession: references.sessions > 0,
    };
  });
}
