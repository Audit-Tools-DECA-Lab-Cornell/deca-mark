import { describe, expect, it } from "vitest";
import { validateRecoveredPackage } from "./ownership";

describe("Exact draft recovery", () => {
  const draft = {
    packageId: "map-v7",
    siteId: "site",
    formVersion: "play-v7",
    context: {
      packageId: "map-v7",
      packageVersion: "v7",
      zoneId: "A",
      zoneLabel: "Original label",
      roundType: "standard" as const,
      freshPeriod: false,
      inheritedFrom: "",
    },
  };
  const pkg = {
    id: "map-v7",
    siteId: "site",
    version: "v7",
    formVersion: "play-v7",
    inventoryFormVersion: "inventory-v7",
    zones: [{ id: "A", label: "Original label" }],
  };
  it("rejects a missing saved zone instead of choosing the first zone", () => {
    expect(
      validateRecoveredPackage(draft, { ...pkg, zones: [{ id: "B", label: "Different" }] }),
    ).toBe("zone_missing");
  });
  it("rejects another package version despite a matching zone code", () => {
    expect(validateRecoveredPackage(draft, { ...pkg, version: "v8" })).toBe("package_missing");
  });
  it("rejects a replaced form instead of interpreting saved answers with it", () => {
    expect(validateRecoveredPackage(draft, { ...pkg, formVersion: "play-v8" })).toBe(
      "form_missing",
    );
  });
});
