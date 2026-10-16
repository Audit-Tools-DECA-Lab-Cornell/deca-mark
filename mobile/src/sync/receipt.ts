import { isBoundObservation, type Observation } from "../domain/observation";
import { receiptSchema, type SyncScope, syncScopeSchema } from "./contracts";

/** owner_scope stays the legacy storage namespace; the binding supplies the destination project. */
export function readOwnerScope(key: string): SyncScope | null {
  try {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value)) return null;
    const parsed = syncScopeSchema.safeParse({
      apiUrl: value[0],
      issuer: value[1],
      userId: value[2],
      projectId: value[3],
    });
    return parsed.success ? parsed.data : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export function receiptMatches(value: unknown, record: Observation, scope: SyncScope): boolean {
  const parsed = receiptSchema.safeParse(value);
  if (!parsed.success || !isBoundObservation(record) || record.binding.issuer !== scope.issuer)
    return false;
  const receipt = parsed.data;
  return (
    receipt.observation_id === record.id &&
    receipt.user_id === scope.userId &&
    receipt.project_id === record.binding.projectId &&
    receipt.package_id === record.binding.packageId &&
    receipt.zone_id === record.binding.zoneId
  );
}
