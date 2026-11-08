import { z } from "zod";
import {
  bindingMatchesContext,
  type PackageBinding,
  packageBindingSchema,
} from "./package-binding";
import { roundTypeSchema } from "./rounds";

export const coordinateSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
export type Coordinate = z.infer<typeof coordinateSchema>;

/**
 * The real queue states: every record is stored for upload from the moment it is saved. There is no
 * state for a record that stays on the device; practice records are ordinary records of the Training
 * project.
 */
export const storageStatusSchema = z.enum(["pending", "synced", "needs-attention"]);
export type StorageStatus = z.infer<typeof storageStatusSchema>;

const identity = {
  id: z.uuid(),
  coordinates: coordinateSchema,
  createdAt: z.iso.datetime(),
  startedAt: z.iso.datetime().optional(),
  storageStatus: storageStatusSchema,
  syncError: z.string().default(""),
  syncRejectionCode: z.string().optional(),
  syncIssueCodes: z.array(z.string()).readonly().optional(),
};

export const answerValueSchema = z.union([z.string(), z.number().finite(), z.array(z.string())]);

/** What the site brief fixes for a round and stamps onto every observation inside it. */
export const roundContextSchema = z.object({
  packageId: z.string().min(1),
  packageVersion: z.string().min(1),
  zoneId: z.string().min(1),
  zoneLabel: z.string().min(1),
  /** Standard, Reliability or Inventory (`domain/rounds.ts`). */
  roundType: roundTypeSchema,
  /**
   * True when the observer marked this the first round of an observation period (the workbook's
   * First_Round), so nothing is inherited from an earlier round.
   */
  freshPeriod: z.boolean(),
  inheritedFrom: z.string(),
});
export type RoundContext = Readonly<z.infer<typeof roundContextSchema>>;

/**
 * Hand placement is the record. A device fix never overwrites the coordinates the observer
 * tapped; its accuracy is kept beside them. It is null while this build has no location
 * permission, rather than filled with a plausible number.
 */
export const placementSchema = z.object({
  /**
   * `hand`: the observer put the point where the play happened. `zone`: a whole-zone record (an
   * inventory) stored at the zone's centre; no point was placed, and none should be read into it.
   */
  source: z.enum(["hand", "zone"]),
  gpsAccuracyMetres: z.number().nonnegative().nullable(),
});
export type Placement = Readonly<z.infer<typeof placementSchema>>;

export const instrumentObservationSchema = z
  .object({
    ...identity,
    /** The package, site and form version the record was made against, frozen when it was saved. */
    binding: packageBindingSchema,
    /** The project this record uploads to: the project that published the site's package. */
    projectId: z.uuid(),
    /** The server's site UUID. */
    siteId: z.string().min(1),
    /** The version a project published (`training-v1`, or any other code the server serves). */
    formVersion: z.string().min(1),
    observer: z.string().trim().min(1).max(10),
    answers: z.record(z.string(), answerValueSchema),
    context: roundContextSchema,
    placement: placementSchema,
  })
  .refine(
    (record) =>
      record.projectId === record.binding.projectId &&
      record.siteId === record.binding.siteId &&
      bindingMatchesContext(record.binding, record.context),
    "The frozen package binding must match the record context.",
  );
export type InstrumentObservation = Readonly<z.infer<typeof instrumentObservationSchema>>;

export const observationSchema = instrumentObservationSchema;
export type Observation = InstrumentObservation;

export function isBoundObservation(
  record: Observation,
): record is Observation & { readonly binding: PackageBinding } {
  return record.binding !== undefined;
}
