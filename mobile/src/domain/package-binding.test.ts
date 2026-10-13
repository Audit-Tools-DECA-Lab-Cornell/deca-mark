import { describe, expect, it } from "vitest";
import { binding, boundRecord } from "../storage/package-store.fixture";
import { instrumentObservationSchema } from "./observation";

describe("Recorded site attribution", () => {
  it("requires the record's server site UUID to agree with its frozen package", () => {
    expect(
      instrumentObservationSchema.safeParse({ ...boundRecord, siteId: binding.siteId }).success,
    ).toBe(true);
    for (const siteId of ["old-site-code", "20000000-0000-4000-8000-000000000099"])
      expect(instrumentObservationSchema.safeParse({ ...boundRecord, siteId }).success).toBe(false);
  });
});
