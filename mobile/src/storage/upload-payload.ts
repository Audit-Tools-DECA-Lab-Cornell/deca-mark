import { z } from "zod";
import { type Observation, observationSchema } from "../domain/observation";
import { isUploadableRecord } from "../forms/registry";
import { serializeBoundObservation } from "../sync/wire-body";

const storedBody = z.object({ uploadBody: z.string().optional() });
export function encodeUploadPayload(record: Observation): string {
  return JSON.stringify({
    ...record,
    ...(isUploadableRecord(record) ? { uploadBody: serializeBoundObservation(record) } : {}),
  });
}
export function readUploadPayload(payload: string) {
  const raw: unknown = JSON.parse(payload);
  const record = observationSchema.parse(raw);
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
