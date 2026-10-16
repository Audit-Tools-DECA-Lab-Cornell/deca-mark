import { z } from "zod";
import { readApiError } from "../data/api/errors";
import { isBoundObservation, type Observation } from "../domain/observation";

const issueCodeSchema = z.enum([
  "point_outside_zone",
  "package_not_in_site",
  "package_not_ready",
  "zone_not_in_package",
  "form_not_in_package",
]);
const detailSchema = z.object({
  error: z.object({ details: z.object({ issues: z.array(z.object({ code: z.string() })) }) }),
});
function bindingCopy(record: Observation, code: z.infer<typeof issueCodeSchema>): string | null {
  if (!isBoundObservation(record)) return null;
  const map = `map v${record.binding.packageVersion}`;
  switch (code) {
    case "point_outside_zone":
      return `Needs attention. DECA Mark did not accept ${record.binding.zoneLabel} for this point on ${map}. The record keeps its number and stays on this device. Tell your coordinator.`;
    case "form_not_in_package":
      return `Needs attention. The form on this record does not belong to ${map}. It stays on this device. Tell your coordinator.`;
    case "zone_not_in_package":
    case "package_not_in_site":
    case "package_not_ready":
      return `Needs attention. DECA Mark could not match ${map} for this record. It stays on this device. Tell your coordinator.`;
  }
}

/** Preserve safe machine codes separately from copy and never echo server text. */
export async function readUploadFailure(response: Response, record: Observation) {
  const failure = await readApiError(response.clone());
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  const details = detailSchema.safeParse(value);
  const issueCodes = details.success
    ? details.data.error.details.issues.flatMap((issue) => {
        const parsed = issueCodeSchema.safeParse(issue.code);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const first = issueCodes[0];
  return {
    kind: response.status === 429 ? "retry" : failure.kind,
    code: failure.code,
    retryAfter: failure.retryAfter,
    message:
      response.status !== 429 && failure.kind === "rejected" && first
        ? (bindingCopy(record, first) ?? failure.message)
        : failure.message,
    issueCodes,
  };
}
