import { z } from "zod";
import { identityKey, type PackageIdentity } from "../domain/package-binding";
import { databaseWrite } from "./database-write";
import type { LocalDatabase } from "./observation-store";
import {
  type CatalogEntry,
  catalogEntrySchema,
  PackageStoreError,
  requirePackageOwner,
} from "./package-catalog-schema";

const payloadRows = z.array(z.object({ payload: z.string() }));

export async function authorizedPackage(
  db: LocalDatabase,
  owner: string,
  identity: PackageIdentity,
): Promise<CatalogEntry | null> {
  requirePackageOwner(owner, identity.issuer);
  const rows = payloadRows.parse(
    await db.getAllAsync(
      `SELECT c.payload FROM package_contents c JOIN package_authorizations a
     ON a.content_key = c.content_key WHERE a.owner_scope = ? AND c.content_key = ?`,
      owner,
      identityKey(identity),
    ),
  );
  const row = rows[0];
  return row ? catalogEntrySchema.parse(JSON.parse(row.payload)) : null;
}

export async function requireAuthorizedPackage(
  db: LocalDatabase,
  owner: string,
  identity: PackageIdentity,
) {
  const entry = await authorizedPackage(db, owner, identity);
  if (!entry) throw new PackageStoreError("not_authorized");
  if (
    entry.identity.siteId !== identity.siteId ||
    entry.identity.packageVersion !== identity.packageVersion
  )
    throw new PackageStoreError("immutable_conflict");
  return entry;
}

export function readCatalog(db: LocalDatabase, owner: string, identity: PackageIdentity) {
  return databaseWrite(db, () => authorizedPackage(db, owner, identity));
}

export function listCatalog(
  db: LocalDatabase,
  owner: string,
  projectId?: string,
): Promise<CatalogEntry[]> {
  return databaseWrite(db, async () => {
    const rows = payloadRows.parse(
      await db.getAllAsync(
        `SELECT c.payload FROM package_contents c JOIN package_authorizations a
       ON a.content_key = c.content_key WHERE a.owner_scope = ?${projectId ? " AND c.project_id = ?" : ""}
       ORDER BY c.site_id, c.package_id`,
        owner,
        ...(projectId ? [projectId] : []),
      ),
    );
    return rows.map((row) => catalogEntrySchema.parse(JSON.parse(row.payload)));
  });
}

export function readSelected(
  db: LocalDatabase,
  owner: string,
  projectId: string,
  siteId: string,
): Promise<CatalogEntry | null> {
  return databaseWrite(db, async () => {
    const rows = payloadRows.parse(
      await db.getAllAsync(
        `SELECT c.payload FROM package_selections s JOIN package_contents c ON c.content_key = s.content_key
       JOIN package_authorizations a ON a.owner_scope = s.owner_scope AND a.content_key = s.content_key
       WHERE s.owner_scope = ? AND s.project_id = ? AND s.site_id = ?`,
        owner,
        projectId,
        siteId,
      ),
    );
    return rows[0] ? catalogEntrySchema.parse(JSON.parse(rows[0].payload)) : null;
  });
}
