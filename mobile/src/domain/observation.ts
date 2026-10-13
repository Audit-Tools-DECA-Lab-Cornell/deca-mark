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
 * The real queue states. The Field screen speaks of records being "held" rather than pending,
 * but the stored value stays the enum the API and the SQLite schema already agree on.
 */
export const storageStatusSchema = z.enum(["local-only", "pending", "synced", "needs-attention"]);
export type StorageStatus = z.infer<typeof storageStatusSchema>;

const identity = {
  id: z.uuid(),
  coordinates: coordinateSchema,
  createdAt: z.iso.datetime(),
  storageStatus: storageStatusSchema,
  syncError: z.string().default(""),
};

/** Bundled practice records are local preview data. */
export const shellObservationSchema = z.object({
  ...identity,
  binding: z.never().optional(),
  siteId: z.literal("sample-garden"),
  formVersion: z.literal("shell-v1"),
  observer: z.string().trim().min(1, "Enter your initials.").max(12),
  people: z.number().int().min(0).max(999),
  notes: z.string().trim().max(1000),
});
export type PracticeShellObservation = Readonly<z.infer<typeof shellObservationSchema>>;

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

export const boundShellObservationSchema = shellObservationSchema
  .extend({
    binding: packageBindingSchema,
    projectId: z.uuid(),
    siteId: z.uuid(),
    context: roundContextSchema,
    placement: placementSchema,
    notes: z.string().max(1000),
  })
  .refine(
    (record) =>
      record.projectId === record.binding.projectId &&
      record.siteId === record.binding.siteId &&
      bindingMatchesContext(record.binding, record.context),
    "The frozen package binding must match the record context.",
  );
export type BoundShellObservation = Readonly<z.infer<typeof boundShellObservationSchema>>;
export type ShellObservation = PracticeShellObservation | BoundShellObservation;

/** Any versioned instrument: `janet-test-v1`, `janet-inventory-v1`, or a version a project publishes. */
const instrumentVersionSchema = z
  .string()
  .min(1)
  .refine((version) => version !== "shell-v1", "The practice form has its own record shape.");

export const instrumentObservationSchema = z
  .object({
    ...identity,
    binding: packageBindingSchema.optional(),
    /**
     * The project this record uploads to, for a site downloaded from a project. Absent on records made
     * on a site that ships with the app: those stay on the device, as no project published their form.
     */
    projectId: z.uuid().optional(),
    /** Hosted records use the server site UUID; bundled preview uses its local site ID. */
    siteId: z.string().min(1),
    formVersion: instrumentVersionSchema,
    observer: z.string().trim().min(1).max(10),
    answers: z.record(z.string(), answerValueSchema),
    context: roundContextSchema,
    placement: placementSchema,
  })
  .refine(
    (record) =>
      !record.binding ||
      (record.projectId === record.binding.projectId &&
        record.siteId === record.binding.siteId &&
        bindingMatchesContext(record.binding, record.context)),
    "The frozen package binding must match the record context.",
  );
export type InstrumentObservation = Readonly<z.infer<typeof instrumentObservationSchema>>;

export const observationSchema = z.union([
  boundShellObservationSchema,
  shellObservationSchema,
  instrumentObservationSchema,
]);
export type Observation = ShellObservation | InstrumentObservation;

export const countInputSchema = z
  .string()
  .regex(/^\d{1,3}$/, "Enter a whole number from 0 to 999.")
  .transform(Number);

export function isShellObservation(record: Observation): record is ShellObservation {
  return record.formVersion === "shell-v1";
}

export function isBoundObservation(
  record: Observation,
): record is Observation & { readonly binding: PackageBinding } {
  return record.binding !== undefined;
}
