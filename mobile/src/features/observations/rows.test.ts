import { describe, expect, it, vi } from "vitest";
import type { QueueRecord } from "../preview/fixtures";
import {
  ALL_ZONES,
  attentionNote,
  filterAnnouncement,
  inZone,
  placeLine,
  reasonOf,
  rowLabel,
  summaryLine,
  zonesOf,
} from "./rows";

vi.mock(
  "react-native-reanimated",
  async () => (await import("../../ui/native.fixture")).reanimated,
);

const base: QueueRecord = {
  id: "a1",
  label: "OBS-A1",
  zone: "North meadow",
  roundType: "standard",
  time: "11:34",
  state: "onDevice",
  summary: "Behaviour mapping",
};
const made = (more: Partial<QueueRecord>): QueueRecord => ({ ...base, ...more });

describe("the words of a row", () => {
  it("puts where and when on one line, with the day when the record has one", () => {
    expect(placeLine(base)).toBe("North meadow · Standard round · 11:34");
    expect(placeLine(made({ captured: "Oct 02 · 11:32", roundType: "inventory" }))).toBe(
      "North meadow · Inventory round · Oct 02 · 11:32",
    );
  });

  it("does not say 'Needs attention' twice: the badge says it, the reason says the rest", () => {
    const reason = "DECA Mark did not accept North meadow for this point on map v1.";
    expect(reasonOf(made({ state: "attention", problem: `Needs attention. ${reason}` }))).toBe(
      reason,
    );
    expect(reasonOf(made({ state: "attention", problem: reason }))).toBe(reason);
    // Only a record that needs attention loses the lead words.
    expect(reasonOf(made({ state: "onDevice", problem: "Needs attention. odd" }))).toBe(
      "Needs attention. odd",
    );
    expect(reasonOf(made({ state: "attention", problem: "Needs attention." }))).toBeNull();
    expect(reasonOf(made({ state: "attention", problem: "  " }))).toBeNull();
    expect(reasonOf(base)).toBeNull();
  });

  it("says a record that is waiting why: what the last try said", () => {
    expect(
      reasonOf(made({ problem: "Server unavailable. Your record is saved and will retry." })),
    ).toBe("Server unavailable. Your record is saved and will retry.");
  });

  it("reads a record as one sentence per fact: number, place, state, reason", () => {
    expect(rowLabel(base)).toBe("OBS-A1. North meadow, Standard round, 11:34. On device.");
    expect(
      rowLabel(
        made({
          state: "attention",
          captured: "Today 11:32",
          problem: "Needs attention. Tell your coordinator.",
        }),
      ),
    ).toBe(
      "OBS-A1. North meadow, Standard round, Today 11:32. Needs attention. Tell your coordinator.",
    );
  });

  it("uses the contract's word for each of the five states", () => {
    const word = (state: QueueRecord["state"]) => rowLabel(made({ state })).split(". ")[2];
    expect(word("onDevice")).toBe("On device.");
    expect(word("uploading")).toBe("Uploading.");
    expect(word("uploaded")).toBe("Uploaded.");
    expect(word("attention")).toBe("Needs attention.");
    expect(word("held")).toBe("Held.");
  });
});

describe("the zone filter", () => {
  const records = [
    made({ id: "1", zone: "Woodland edge" }),
    made({ id: "2", zone: "North meadow" }),
    made({ id: "3", zone: "Woodland edge" }),
    made({ id: "4", zone: "Zone 10" }),
    made({ id: "5", zone: "Zone 2" }),
  ];

  it("offers each zone once, in reading order, with numbers in their natural order", () => {
    expect(zonesOf(records)).toEqual(["North meadow", "Woodland edge", "Zone 2", "Zone 10"]);
    expect(zonesOf([])).toEqual([]);
  });

  it("keeps the newest-first order when it narrows, and shows all with no zone", () => {
    expect(inZone(records, "Woodland edge").map((record) => record.id)).toEqual(["1", "3"]);
    expect(inZone(records, null)).toHaveLength(5);
    expect(inZone(records, "Sand area")).toEqual([]);
  });

  it("says what is shown, for a screen reader", () => {
    expect(filterAnnouncement("Woodland edge", 2, 5)).toBe(
      "Woodland edge: 2 of 5 observations shown.",
    );
    expect(filterAnnouncement(null, 5, 5)).toBe(`${ALL_ZONES}: 5 of 5 observations shown.`);
  });
});

describe("the summary and the note above the list", () => {
  const counts = { onDevice: 0, uploading: 0, uploaded: 0, attention: 0, held: 0 };

  it("counts the records not uploaded and the records uploaded, in two numbers", () => {
    expect(summaryLine({ unsent: 3, counts: { ...counts, uploaded: 5 } })).toBe(
      "3 not uploaded · 5 uploaded",
    );
    expect(summaryLine({ unsent: 0, counts: { ...counts, uploaded: 2 } })).toBe(
      "0 not uploaded · 2 uploaded",
    );
  });

  it("says nothing when there are no records", () => {
    expect(summaryLine({ unsent: 0, counts })).toBeNull();
  });

  it("says what happened, where the records are, and what retrying really does", () => {
    const one = attentionNote(1);
    expect(one.title).toBe("1 observation needs attention.");
    expect(one.body).toContain("It stays on this device exactly as you saved it.");
    expect(one.body).toContain("Retrying sends the same record again and does not change it.");
    const many = attentionNote(3);
    expect(many.title).toBe("3 observations need attention.");
    expect(many.body).toContain("They stay on this device exactly as you saved them.");
    expect(many.body).toContain("Retrying sends the same records again and does not change them.");
    for (const note of [one, many]) expect(`${note.title} ${note.body}`).not.toMatch(/\bheld\b/i);
  });
});
