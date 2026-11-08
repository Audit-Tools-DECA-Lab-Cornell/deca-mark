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
 * The one place a stored `observations.payload` is parsed. Two shapes written by builds before MOB-43
 * are read as the current record; `sync_state` and the frozen `uploadBody` are never changed:
 * - the retired `"local-only"` in `storageStatus`, written into every record including bound ones. The
 *   `sync_state` column is authoritative, so it is read as "pending" and never trusted;
 * - a bound record of a form whose code was `shell-v1`, stored with `people` and `notes` beside the
 *   observer and no `answers`. Those three are exactly the answers that build froze into the body.
 */
export function readUploadPayload(payload: string) {
  const raw: unknown = JSON.parse(payload);
  const record = observationSchema.parse(normalizeLegacy(raw));
  const { uploadBody } = storedBody.parse(raw);
  return { record, body: uploadBody };
}
function normalizeLegacy(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  let value: Record<string, unknown> = { ...raw };
  if (value["storageStatus"] === "local-only") value = { ...value, storageStatus: "pending" };
  if (value["formVersion"] === "shell-v1" && "people" in value && !("answers" in value)) {
    const { observer, people, notes, ...rest } = value;
    value = { ...rest, observer, answers: { observer, people, notes } };
  }
  return value;
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
