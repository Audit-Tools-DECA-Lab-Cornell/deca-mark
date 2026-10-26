import { describe, expect, it } from "vitest";
import {
  captureTimeValue,
  formatTemporalValue,
  isCanonicalTemporalValue,
  resolveLocalDateTime,
} from "./temporal";

const config = {
  mode: "dateTime",
  dateFormat: "iso",
  timeFormat: "24h",
  timeZone: "America/New_York",
} as const;

describe("canonical temporal values", () => {
  it.each([
    ["date", "0001-01-01", true],
    ["date", "9999-12-31", true],
    ["date", "0000-01-01", false],
    ["date", "1900-02-29", false],
    ["date", "2000-02-29", true],
    ["date", "2024-04-31", false],
    ["time", "23:59:59", true],
    ["time", "24:00:00", false],
    ["time", "12:30:60", false],
    ["dateTime", "2026-01-01T12:00:00Z", true],
    ["dateTime", "2026-01-01T12:00:00.123Z", true],
    ["dateTime", "2026-01-01T12:00:00+00:00", false],
    ["dateTime", "2026-02-30T12:00:00Z", false],
  ] as const)("checks %s %s", (mode, value, expected) => {
    // Given a canonical storage mode; when validated; then calendar and spelling rules apply.
    expect(isCanonicalTemporalValue({ mode }, value)).toBe(expected);
  });
  it("derives date and time in the configured zone from a frozen instant", () => {
    // Given a capture instant before local midnight; when deriving values; then no current clock is used.
    expect(captureTimeValue({ ...config, mode: "date" }, "2026-01-01T02:30:00.000Z")).toBe(
      "2025-12-31",
    );
    expect(captureTimeValue({ ...config, mode: "time" }, "2026-01-01T02:30:00.000Z")).toBe(
      "21:30:00",
    );
    expect(captureTimeValue(config, "2026-01-01T02:30:00Z")).toBe("2026-01-01T02:30:00.000Z");
  });
  it("requires occurrence selection during a repeated local clock time", () => {
    // Given New York's autumn transition; when resolving without selection; then both instants are offered.
    expect(resolveLocalDateTime("2026-11-01T01:30:00", config.timeZone)).toEqual({
      ok: false,
      reason: "ambiguous",
      candidates: ["2026-11-01T05:30:00.000Z", "2026-11-01T06:30:00.000Z"],
    });
    expect(resolveLocalDateTime("2026-11-01T01:30:00", config.timeZone, "later")).toEqual({
      ok: true,
      value: "2026-11-01T06:30:00.000Z",
    });
  });
  it("rejects a nonexistent clock time", () => {
    // Given the spring clock jump; when resolving; then no timestamp is manufactured.
    expect(resolveLocalDateTime("2026-03-08T02:30:00", config.timeZone)).toEqual({
      ok: false,
      reason: "nonexistent",
      candidates: [],
    });
  });
  it("handles a half-hour overlap and an entire skipped local date", () => {
    // Given non-hour timezone changes; when resolving; then all actual occurrences remain explicit.
    expect(resolveLocalDateTime("2026-04-05T01:45:00", "Australia/Lord_Howe")).toMatchObject({
      ok: false,
      reason: "ambiguous",
    });
    expect(resolveLocalDateTime("2011-12-30T12:00:00", "Pacific/Apia")).toMatchObject({
      ok: false,
      reason: "nonexistent",
    });
  });
  it("formats canonical values without changing their timezone meaning", () => {
    // Given a UTC stored instant; when rendered; then configured local date and 12-hour format are used.
    expect(
      formatTemporalValue(
        { ...config, dateFormat: "dayFirst", timeFormat: "12h" },
        "2026-01-01T02:30:00Z",
      ),
    ).toBe("31/12/2025 9:30:00 PM");
  });
});
