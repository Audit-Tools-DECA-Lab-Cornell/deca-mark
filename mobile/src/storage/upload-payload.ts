import { z } from "zod";
import { type Observation, observationSchema } from "../domain/observation";
import { serializeBoundObservation } from "../sync/wire-body";

const storedBody = z.object({ uploadBody: z.string().optional() });
export function encodeUploadPayload(record: Observation): string {
  return JSON.stringify({
    ...record,
    uploadBody: serializeBoundObservation(record),
  });
}
/**
 * The one place a stored `observations.payload` is parsed. Builds before MOB-43 wrote the retired
 * `"local-only"` into the payload's `storageStatus` of every record, bound ones included; the
 * `sync_state` column is authoritative, so that legacy value is read as "pending" and never trusted.
 * The frozen `uploadBody` is read as it was written.
 */
export function readUploadPayload(payload: string) {
  const raw: unknown = JSON.parse(payload);
  const normalized =
    typeof raw === "object" &&
    raw !== null &&
    "storageStatus" in raw &&
    raw.storageStatus === "local-only"
      ? { ...raw, storageStatus: "pending" }
      : raw;
  const record = observationSchema.parse(normalized);
  const { uploadBody } = storedBody.parse(raw);
  return { record, body: uploadBody };
}
const failureSchema = z.object({
  message: z.string(),
  code: z.string(),
  issueCodes: z.array(z.string()).optional(),
});
export function readSyncFailure(value: string): {
  readonly syncError: string;
  readonly syncRejectionCode?: string;
  readonly syncIssueCodes?: readonly string[];
} {
  try {
    const parsed = failureSchema.safeParse(JSON.parse(value));
    return parsed.success
      ? {
          syncError: parsed.data.message,
          syncRejectionCode: parsed.data.code,
          ...(parsed.data.issueCodes ? { syncIssueCodes: parsed.data.issueCodes } : {}),
        }
      : { syncError: value };
  } catch (error) {
    if (error instanceof SyntaxError) return { syncError: value };
    throw error;
  }
}
