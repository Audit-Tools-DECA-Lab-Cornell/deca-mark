import { z } from "zod";
import { identityKey, type PackageIdentity } from "../domain/package-binding";
import { databaseTransaction } from "./database-write";
import type { LocalDatabase } from "./observation-store";
import { requireAuthorizedPackage } from "./package-catalog-read";
import {
  type CatalogEntry,
  catalogEntrySchema,
  PackageStoreError,
  requirePackageOwner,
} from "./package-catalog-schema";
import { type PackageReferences, packageReferences } from "./package-references";

export { listCatalog, readCatalog, readSelected } from "./package-catalog-read";
export { type CatalogEntry, catalogEntrySchema, PackageStoreError } from "./package-catalog-schema";

async function writeSelection(
  db: LocalDatabase,
  owner: string,
  identity: PackageIdentity,
  explicit = false,
) {
  if (!explicit) {
    const rows = z.array(z.object({ payload: z.string() })).parse(
      await db.getAllAsync(
        `SELECT c.payload FROM package_selections s JOIN package_contents c ON c.content_key = s.content_key
       WHERE s.owner_scope = ? AND s.project_id = ? AND s.site_id = ?`,
        owner,
        identity.projectId,
        identity.siteId,
      ),
    );
    if (
      rows[0] &&
      catalogEntrySchema.parse(JSON.parse(rows[0].payload)).identity.packageVersion >
        identity.packageVersion
    )
      return;
  }
  await db.runAsync(
    `INSERT INTO package_selections (owner_scope, project_id, site_id, content_key) VALUES (?, ?, ?, ?)
     ON CONFLICT(owner_scope, project_id, site_id) DO UPDATE SET content_key = excluded.content_key`,
    owner,
    identity.projectId,
    identity.siteId,
    identityKey(identity),
  );
}

export function installPackage(
  db: LocalDatabase,
  owner: string,
  input: CatalogEntry,
  select = true,
  current: () => boolean = () => true,
): Promise<void> {
  const entry = catalogEntrySchema.parse(input);
  const { identity } = entry;
  requirePackageOwner(owner, identity.issuer);
  return databaseTransaction(db, async () => {
    if (!current()) throw new PackageStoreError("cancelled");
    const rows = z
      .array(z.object({ payload: z.string() }))
      .parse(
        await db.getAllAsync(
          "SELECT payload FROM package_contents WHERE issuer = ? AND project_id = ? AND package_id = ?",
          identity.issuer,
          identity.projectId,
          identity.packageId,
        ),
      );
    const stored = rows[0] ? catalogEntrySchema.parse(JSON.parse(rows[0].payload)) : null;
    if (
      stored &&
      (identityKey(stored.identity) !== identityKey(identity) ||
        stored.identity.siteId !== identity.siteId ||
        stored.identity.packageVersion !== identity.packageVersion)
    )
      throw new PackageStoreError("immutable_conflict");
    if (stored)
      await db.runAsync(
        "UPDATE package_contents SET payload = ? WHERE content_key = ?",
        JSON.stringify(entry),
        identityKey(identity),
      );
    else
      await db.runAsync(
        "INSERT INTO package_contents (content_key, issuer, project_id, site_id, package_id, digest, payload) VALUES (?, ?, ?, ?, ?, ?, ?)",
        identityKey(identity),
        identity.issuer,
        identity.projectId,
        identity.siteId,
        identity.packageId,
        identity.packageSha256,
        JSON.stringify(entry),
      );
    await db.runAsync(
      "INSERT OR IGNORE INTO package_authorizations (owner_scope, content_key) VALUES (?, ?)",
      owner,
      identityKey(identity),
    );
    if (!current()) throw new PackageStoreError("cancelled");
    if (select) await writeSelection(db, owner, identity);
    if (!current()) throw new PackageStoreError("cancelled");
  });
}

export function selectPackage(
  db: LocalDatabase,
  owner: string,
  identity: PackageIdentity,
): Promise<void> {
  return databaseTransaction(db, async () => {
    await requireAuthorizedPackage(db, owner, identity);
    await writeSelection(db, owner, identity, true);
  });
}

class PackageLeaseError extends Error {
  constructor(readonly reasons: PackageReferences) {
    super("The package has an active collection lease.");
    this.name = "PackageLeaseError";
  }
}

export function removePackage(
  db: LocalDatabase,
  owner: string,
  identity: PackageIdentity,
  activeLease: () => boolean = () => false,
  current: () => boolean = () => true,
) {
  return databaseTransaction(db, async () => {
    if (!current()) throw new PackageStoreError("cancelled");
    await requireAuthorizedPackage(db, owner, identity);
    const persisted = await packageReferences(db, owner, identity);
    const reasons = { ...persisted, sessions: Math.max(persisted.sessions, activeLease() ? 1 : 0) };
    if (reasons.sessions + reasons.drafts + reasons.records > 0)
      return { removed: false, reasons, contentRetained: true as const };
    if (!current()) throw new PackageStoreError("cancelled");
    await db.runAsync(
      "DELETE FROM package_selections WHERE owner_scope = ? AND content_key = ?",
      owner,
      identityKey(identity),
    );
    if (!current()) throw new PackageStoreError("cancelled");
    if (activeLease()) throw new PackageLeaseError({ ...reasons, sessions: 1 });
    await db.runAsync(
      "DELETE FROM package_authorizations WHERE owner_scope = ? AND content_key = ?",
      owner,
      identityKey(identity),
    );
    if (!current()) throw new PackageStoreError("cancelled");
    if (activeLease()) throw new PackageLeaseError({ ...reasons, sessions: 1 });
    return { removed: true, reasons, contentRetained: true as const };
  }).catch((error: unknown) => {
    if (error instanceof PackageLeaseError)
      return { removed: false, reasons: error.reasons, contentRetained: true as const };
    throw error;
  });
}
