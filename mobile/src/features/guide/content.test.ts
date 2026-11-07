import { describe, expect, it } from "vitest";
import { GUIDE, searchGuide } from "./content";

describe("field guide", () => {
  it("covers placing, the three rounds and uploading", () => {
    const titles = GUIDE.map((section) => section.title);
    expect(titles).toEqual(
      expect.arrayContaining(["Placing a point", "The three rounds", "Saving and uploading"]),
    );
    expect(new Set(GUIDE.map((section) => section.id)).size).toBe(GUIDE.length);
  });

  it("shows every section for an empty search", () => {
    expect(searchGuide("  ")).toHaveLength(GUIDE.length);
  });

  it("finds sections containing every word, ignoring case", () => {
    expect(searchGuide("Reliability").map((section) => section.id)).toEqual(["rounds"]);
    expect(searchGuide("cross zone").map((section) => section.id)).toEqual([
      "zones",
      "zone-edges",
      "outside-zones",
    ]);
    expect(searchGuide("PIN map").map((section) => section.id)).toEqual(["placing"]);
    expect(searchGuide("nonexistent words")).toEqual([]);
  });

  it("explains map versions, zone edges and points outside every zone (MOB-32)", () => {
    const text = (id: string) => GUIDE.find((section) => section.id === id)?.body.join(" ") ?? "";
    expect(text("map-versions")).toContain("A session keeps the map it started with");
    expect(text("zone-edges")).toContain("On the edge of");
    expect(text("outside-zones")).toContain("Outside every zone");
  });

  it("explains the queue words the screens use", () => {
    const saving = GUIDE.find((section) => section.id === "saving");
    const text = saving?.body.join(" ") ?? "";
    for (const word of ["On device", "Uploaded", "Needs attention"]) expect(text).toContain(word);
    // The guide names only the states a device shows (MOB-37, MOB-38): never "held", and no "Uploading"
    // until a record is marked in flight (MOB-50).
    expect(text).not.toContain("Held");
    expect(text).not.toContain("Uploading");
    expect(text).toContain("Retry these uploads");
    expect(text).toContain("sends the same record again and does not change it");
  });
});
