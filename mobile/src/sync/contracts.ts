import { z } from "zod";
import type { components } from "../data/api/schema";
import type { Observation } from "../domain/observation";

export const syncScopeSchema = z.object({
  apiUrl: z.url(),
  issuer: z.url(),
  userId: z.uuid().brand<"UserId">(),
  projectId: z.uuid().brand<"ProjectId">(),
});
export type SyncScope = Readonly<z.infer<typeof syncScopeSchema>>;

export function scopeKey(scope: SyncScope): string {
  return JSON.stringify([scope.apiUrl, scope.issuer, scope.userId, scope.projectId]);
}

export const receiptSchema = z.object({
  observation_id: z.uuid(),
  project_id: z.uuid(),
  user_id: z.uuid(),
  accepted_revision: z.literal(1),
  received_at: z.iso.datetime({ offset: true }),
});
export type Receipt = Readonly<components["schemas"]["UploadReceipt"]>;

export type UploadResult =
  | { readonly kind: "accepted"; readonly receipt: Receipt }
  | { readonly kind: "retry" | "rejected" | "sign-in"; readonly message: string };

export type Upload = (
  record: Observation,
  token: string,
  signal: AbortSignal,
) => Promise<UploadResult>;
