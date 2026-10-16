import { z } from "zod";
import {
  answerValueSchema,
  coordinateSchema,
  isBoundObservation,
  isShellObservation,
  type Observation,
} from "../domain/observation";

const common = {
  site_id: z.uuid(),
  package_id: z.uuid(),
  zone_id: z.uuid(),
  form_version: z.string().min(1),
  observer: z.string().min(1).max(12),
  observed_at: z.iso.datetime({ offset: true }),
  answers: z.record(z.string(), answerValueSchema),
};
export const wireBodySchema = z.discriminatedUnion("round_type", [
  z.strictObject({
    ...common,
    round_type: z.enum(["standard", "reliability"]),
    placement: z.literal("hand"),
    first_round: z.boolean(),
    coordinates: coordinateSchema,
  }),
  z.strictObject({ ...common, round_type: z.literal("inventory"), placement: z.literal("zone") }),
]);

/** Only the record's frozen context contributes; never read today's package or form registry. */
export function serializeBoundObservation(record: Observation): string {
  if (!isBoundObservation(record) || !("context" in record))
    throw new TypeError("Only bound records have an upload body.");
  const commonBody = {
    site_id: record.binding.siteId,
    package_id: record.binding.packageId,
    zone_id: record.binding.zoneId,
    form_version: record.formVersion,
    observer: record.observer,
    observed_at: record.createdAt,
    answers: isShellObservation(record)
      ? { observer: record.observer, people: record.people, notes: record.notes }
      : record.answers,
  };
  return JSON.stringify(
    wireBodySchema.parse(
      record.context.roundType === "inventory"
        ? { ...commonBody, round_type: "inventory", placement: record.placement.source }
        : {
            ...commonBody,
            round_type: record.context.roundType,
            placement: record.placement.source,
            first_round: record.context.freshPeriod,
            coordinates: record.coordinates,
          },
    ),
  );
}

/** Verify persisted wire data without replacing it or consulting mutable package state. */
export function uploadBodyMatches(body: string, record: Observation): boolean {
  if (!isBoundObservation(record) || !("context" in record)) return false;
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
  const parsed = wireBodySchema.safeParse(value);
  if (!parsed.success) return false;
  const wire = parsed.data;
  const answers = isShellObservation(record)
    ? { observer: record.observer, people: record.people, notes: record.notes }
    : record.answers;
  if (
    wire.site_id !== record.binding.siteId ||
    wire.package_id !== record.binding.packageId ||
    wire.zone_id !== record.binding.zoneId ||
    wire.form_version !== record.formVersion ||
    wire.observer !== record.observer ||
    wire.observed_at !== record.createdAt ||
    wire.round_type !== record.context.roundType ||
    wire.placement !== record.placement.source ||
    Object.keys(wire.answers).length !== Object.keys(answers).length ||
    !Object.entries(answers).every(
      ([key, answer]) => JSON.stringify(wire.answers[key]) === JSON.stringify(answer),
    )
  )
    return false;
  switch (wire.round_type) {
    case "inventory":
      return true;
    case "standard":
    case "reliability":
      return (
        wire.first_round === record.context.freshPeriod &&
        wire.coordinates[0] === record.coordinates[0] &&
        wire.coordinates[1] === record.coordinates[1]
      );
  }
}
