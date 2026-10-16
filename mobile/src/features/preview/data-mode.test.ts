import { describe, expect, it } from "vitest";
import { readDataMode } from "./data-mode";

describe("collector data mode", () => {
  it.each([null, "", "invalid"])("uses device data when the saved mode is %s", (stored) => {
    // Given a development or review build without a valid saved choice.
    const readStored = () => stored;
    // When the collector chooses its data source.
    const mode = readDataMode(true, readStored);
    // Then it shows account and device data.
    expect(mode).toBe("device");
  });

  it.each(["device", "preview"] as const)("preserves an explicit %s choice", (stored) => {
    // Given a review build with an explicit saved selection.
    const readStored = () => stored;
    // When the collector chooses its data source.
    const mode = readDataMode(true, readStored);
    // Then the saved selection remains active.
    expect(mode).toBe(stored);
  });

  it("uses device data when preference storage is unreadable", () => {
    // Given a storage read failure.
    const readStored = () => {
      throw new Error("Storage unavailable");
    };
    // When the collector chooses its data source.
    const mode = readDataMode(true, readStored);
    // Then fixtures do not replace account and device data.
    expect(mode).toBe("device");
  });

  it("uses device data in releases without reading a saved preview choice", () => {
    // Given a release where preview tools are disabled.
    let reads = 0;
    const readStored = () => {
      reads += 1;
      return "preview";
    };
    // When the collector chooses its data source.
    const mode = readDataMode(false, readStored);
    // Then release data is real and preference storage is untouched.
    expect({ mode, reads }).toEqual({ mode: "device", reads: 0 });
  });
});
