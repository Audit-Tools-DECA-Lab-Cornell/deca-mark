import { z } from "zod";
import { identityKey, type PackageIdentity } from "../domain/package-binding";
import type { LocalDatabase } from "./observation-store";

const countSchema = z.array(z.object({ total: z.number().int().nonnegative() }));
export type PackageReferences = {
  readonly sessions: number;
  readonly drafts: number;
  readonly records: number;
};

export async function packageReferences(
  db: LocalDatabase,
  owner: string,
  identity: PackageIdentity,
): Promise<PackageReferences> {
  const key = identityKey(identity);
  const count = async (sql: string, ...parameters: (string | number)[]) =>
    countSchema.parse(await db.getAllAsync(sql, ...parameters))[0]?.total ?? 0;
  const sessions = await count(
    "SELECT COUNT(*) total FROM active_sessions WHERE owner_scope = ? AND package_key = ?",
    owner,
    key,
  );
  const drafts = await count(
    "SELECT COUNT(*) total FROM observation_drafts WHERE owner_scope = ? AND package_key = ?",
    owner,
    key,
  );
  const records = await count(
    "SELECT COUNT(*) total FROM observations WHERE owner_scope = ? AND package_key = ?",
    owner,
    key,
  );
  return { sessions, drafts, records };
}
