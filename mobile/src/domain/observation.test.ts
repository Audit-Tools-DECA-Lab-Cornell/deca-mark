import { describe, expect, it } from "vitest";
import { questionSchema } from "../forms/definition";
import { janetTestV1 } from "../forms/janet-test-v1.test-helper";
import {
  binding,
  context as boundContext,
  boundRecord,
  identity,
} from "../storage/package-store.fixture";
import { buildObservation, type ObservationInput } from "./build-observation";
import {
  coordinateSchema,
  instrumentObservationSchema,
  placementSchema,
  roundContextSchema,
} from "./observation";

describe("Observation boundaries", () => {
  const input: ObservationInput = {
    id: "83f254b5-8a7b-4b71-9591-a7ff880f4ad7",
    form: janetTestV1,
    answers: {
      age_range: "age_3_5",
      play_type_1: "physical",
      observer_initials: "JL",
      play_event_summary: "Playing",
    },
    coordinates: [-76.485, 42.448],
    placement: { source: "hand", gpsAccuracyMetres: null },
    context: { ...boundContext, freshPeriod: true },
    siteId: identity.siteId,
    projectId: identity.projectId,
    binding,
    createdAt: "2026-09-29T10:00:00.000Z",
    startedAt: "2026-09-29T09:59:00.000Z",
  };

  it("builds a bound record that is pending upload from the moment it exists", () => {
    const result = buildObservation(input);
    expect(result).toMatchObject({
      ok: true,
      record: {
        observer: "JL",
        formVersion: "janet-test-v1",
        storageStatus: "pending",
        projectId: identity.projectId,
        binding: { packageId: identity.packageId },
      },
    });
    const { age_range: _missing, ...incomplete } = input.answers;
    expect(buildObservation({ ...input, answers: incomplete }).ok).toBe(false);
  });

  it("refuses a record whose frozen binding names another site", () => {
    const other = buildObservation({
      ...input,
      binding: { ...binding, siteId: "20000000-0000-4000-8000-000000000099" },
    });
    expect(other.ok).toBe(false);
  });

  it("keeps numeric instrument answers through JSON serialization and drops hidden answers", () => {
    const form = {
      ...janetTestV1,
      questions: [
        ...janetTestV1.questions,
        questionSchema.parse({
          id: "test_count",
          code: "test_count",
          exportColumn: "",
          act: "Record",
          label: "Test count",
          kind: "number",
          source: "Synthetic builder test",
          min: 0,
          max: 9,
        }),
      ],
    };
    const result = buildObservation({
      ...input,
      form,
      answers: {
        age_range: "age_3_5",
        play_type_1: "physical",
        observer_initials: "JL",
        play_event_summary: "Playing",
        test_count: 2,
        wildlife_interaction: "no",
        wildlife_description: "Hidden",
      },
    });
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      ok: true,
      record: { answers: { test_count: 2 } },
    });
    if (!result.ok || result.record.formVersion !== "janet-test-v1")
      throw new Error("Expected an instrument record");
    expect(result.record.answers).not.toHaveProperty("wildlife_description");
  });

  it("rejects invalid map coordinates", () => {
    // Given a malformed coordinate from a route or map event.
    const input = [181, 42];
    // When parsing the location.
    const result = coordinateSchema.safeParse(input);
    // Then it cannot become a stored observation.
    expect(result.success).toBe(false);
  });

  it("requires an observer and a binding, and retains Unicode answers", () => {
    // Given an otherwise valid stored record.
    const stored = { ...boundRecord, observer: "  JL ", answers: { text: "Café — 遊び" } };
    // When parsing the record.
    const record = instrumentObservationSchema.parse(stored);
    // Then identity is required and research text is preserved.
    expect(record.observer).toBe("JL");
    expect(record.answers["text"]).toBe("Café — 遊び");
    expect(instrumentObservationSchema.safeParse({ ...stored, observer: " " }).success).toBe(false);
    const { binding: _binding, ...unbound } = stored;
    expect(instrumentObservationSchema.safeParse(unbound).success).toBe(false);
  });

  it("has no state for a record that stays on the device", () => {
    expect(
      instrumentObservationSchema.safeParse({ ...boundRecord, storageStatus: "local-only" })
        .success,
    ).toBe(false);
  });
});

describe("Current round context", () => {
  const context = {
    packageId: "riverside-play-study",
    packageVersion: "v4",
    zoneId: "B",
    zoneLabel: "Zone B · North playground",
    roundType: "standard",
    freshPeriod: false,
    inheritedFrom: "",
  };

  it("requires a current round type instead of upgrading numeric rounds", () => {
    expect(roundContextSchema.parse(context).roundType).toBe("standard");
    const { roundType: _type, ...rest } = context;
    expect(roundContextSchema.safeParse({ ...rest, round: 2 }).success).toBe(false);
    expect(roundContextSchema.parse({ ...context, roundType: "inventory" }).roundType).toBe(
      "inventory",
    );
    expect(roundContextSchema.safeParse({ ...context, roundType: "weekly" }).success).toBe(false);
  });

  it("stores whole-zone inventory as zone placement rather than a hand point", () => {
    expect(placementSchema.parse({ source: "zone", gpsAccuracyMetres: null }).source).toBe("zone");
    expect(placementSchema.safeParse({ source: "gps", gpsAccuracyMetres: 3 }).success).toBe(false);
  });
});
