import { binding, boundRecord } from "../storage/package-store.fixture";
import { syncScopeSchema } from "./contracts";

export const scope = syncScopeSchema.parse({
  apiUrl: "https://api.synthetic.invalid",
  issuer: binding.issuer,
  userId: "40000000-0000-4000-8000-000000000001",
  projectId: "10000000-0000-4000-8000-000000000002",
});
export const receipt = {
  observation_id: boundRecord.id,
  project_id: binding.projectId,
  user_id: scope.userId,
  package_id: binding.packageId,
  zone_id: binding.zoneId,
  accepted_revision: 1 as const,
  received_at: "2026-10-15T10:00:00.000Z",
};
