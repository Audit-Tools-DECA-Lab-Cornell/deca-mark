import { describe, expect, it } from "vitest";
import { janetInventoryV1 } from "../forms/janet-inventory-v1.test-helper";
import { janetTestV1 } from "../forms/janet-test-v1.test-helper";
import { formForRound, offersRound } from "./round-forms";

const study = { forms: { play: janetTestV1, inventory: janetInventoryV1 } };

describe("Rounds a site offers", () => {
  it("offers every round where the package carries the forms", () => {
    expect(offersRound(study, "standard")).toBe(true);
    expect(offersRound(study, "reliability")).toBe(true);
    expect(offersRound(study, "inventory")).toBe(true);
    expect(formForRound(study, "inventory")?.version).toBe("janet-inventory-v1");
  });

  it("reads only the package's forms: a site whose package has no inventory form offers no Inventory round", () => {
    const hosted = { forms: { play: janetTestV1, inventory: null } };
    expect(formForRound(hosted, "standard")).toBe(janetTestV1);
    expect(offersRound(hosted, "reliability")).toBe(true);
    expect(offersRound(hosted, "inventory")).toBe(false);
    expect(formForRound(study, "inventory")).toBe(janetInventoryV1);
  });
});
