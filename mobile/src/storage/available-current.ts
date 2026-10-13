import { z } from "zod";
import { databaseTransaction, databaseWrite } from "./database-write";
import type { LocalDatabase } from "./observation-store";
import { PackageStoreError } from "./package-catalog-schema";

export const availableCurrentSchema = z.strictObject({
  packageId: z.uuid(),
  packageVersion: z.number().int().positive(),
});
export type AvailableCurrent = Readonly<z.infer<typeof availableCurrentSchema>>;

export function setAvailableCurrent(
  db: LocalDatabase,
  owner: string,
  projectId: string,
  siteId: string,
  current: AvailableCurrent | null,
  isCurrent: () => boolean = () => true,
): Promise<void> {
  const snapshot = current === null ? null : availableCurrentSchema.parse(current);
  return databaseTransaction(db, async () => {
    if (!isCurrent()) throw new PackageStoreError("cancelled");
    if (snapshot === null) {
      await db.runAsync(
        "DELETE FROM available_current_packages WHERE owner_scope = ? AND project_id = ? AND site_id = ?",
        owner,
        projectId,
        siteId,
      );
    } else {
      await db.runAsync(
        `INSERT INTO available_current_packages (owner_scope, project_id, site_id, payload) VALUES (?, ?, ?, ?)
       ON CONFLICT(owner_scope, project_id, site_id) DO UPDATE SET payload = excluded.payload`,
        owner,
        projectId,
        siteId,
        JSON.stringify(snapshot),
      );
    }
    if (!isCurrent()) throw new PackageStoreError("cancelled");
  });
}

export function readAvailableCurrent(
  db: LocalDatabase,
  owner: string,
  projectId: string,
  siteId: string,
): Promise<AvailableCurrent | null> {
  return databaseWrite(db, async () => {
    const rows = z
      .array(z.object({ payload: z.string() }))
      .parse(
        await db.getAllAsync(
          "SELECT payload FROM available_current_packages WHERE owner_scope = ? AND project_id = ? AND site_id = ?",
          owner,
          projectId,
          siteId,
        ),
      );
    return rows[0] ? availableCurrentSchema.parse(JSON.parse(rows[0].payload)) : null;
  });
}
