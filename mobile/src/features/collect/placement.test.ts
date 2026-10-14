import { describe, expect, it } from "vitest";
import type { Coordinate } from "../../domain/observation";
import { metresPerPixel } from "../../maps/clustering";
import type { SiteZone } from "../../maps/sample-site";
import {
  mapVersionLabel,
  nearEdgeHint,
  type PlacementKind,
  placementState,
  saveBlock,
  zoneList,
  zoneTap,
} from "./placement";

/** A rectangle zone over [west, east] × [south, north], with its full boundary. */
function box(id: string, label: string, west: number, south: number, east: number, north: number) {
  const ring: Coordinate[] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
  const centre: Coordinate = [(west + east) / 2, (south + north) / 2];
  return {
    id,
    zoneId: `zone-${id}`,
    label,
    centre,
    displayAnchor: centre,
    west,
    south,
    east,
    north,
    polygon: [ring],
  } satisfies SiteZone;
}

// North meadow | Slide side by side; Swings below both, sharing their bottom edges; a gap east of Slide.
const meadow = box("NM", "North meadow", 0, 0.001, 0.001, 0.002);
const slide = box("SL", "Slide", 0.001, 0.001, 0.002, 0.002);
const swings = box("SW", "Swings", 0, 0, 0.002, 0.001);
const zones = [meadow, slide, swings];

const cases: readonly { at: Coordinate; session: SiteZone; kind: PlacementKind }[] = [
  { at: [0.0005, 0.0015], session: meadow, kind: "inside" },
  { at: [0.001, 0.0015], session: meadow, kind: "edge" },
  { at: [0.0015, 0.0015], session: meadow, kind: "other" },
  { at: [0.0015, 0.001], session: meadow, kind: "between" },
  { at: [0.003, 0.0015], session: meadow, kind: "outside" },
];

describe("placementState", () => {
  for (const { at, session, kind } of cases)
    it(`reads ${kind} on a bound map and gates placing by it`, () => {
      const state = placementState(at, session, zones, true, 3);
      expect(state.kind).toBe(kind);
      expect(state.canPlace).toBe(kind === "inside" || kind === "edge");
      expect(state.reason === null).toBe(state.canPlace);
    });

  it("words each state in field language, with the zone names and the map version", () => {
    const words = (at: Coordinate) => placementState(at, meadow, zones, true, 3);
    expect(words([0.0005, 0.0015]).readout).toBe("In North meadow");
    expect(words([0.001, 0.0015]).readout).toBe("On the edge of North meadow and Slide");
    expect(words([0.0015, 0.0015]).readout).toBe("Outside North meadow · in Slide");
    expect(words([0.0015, 0.0015]).reason).toBe("Switch to Slide or move the ×.");
    expect(words([0.0015, 0.001]).readout).toBe(
      "Outside North meadow · on the edge of Slide and Swings",
    );
    expect(words([0.0015, 0.001]).reason).toBe("Choose one of these zones or move the ×.");
    expect(words([0.003, 0.0015]).readout).toBe("Outside every zone on map v3");
    expect(words([0.003, 0.0015]).reason).toBe("Move the × into a zone.");
  });

  it("keeps the session zone chosen on an edge, and chooses nothing between other zones", () => {
    const edge = placementState([0.001, 0.0015], meadow, zones, true, 3);
    expect(edge.chosen?.id).toBe("NM");
    expect(edge.candidates.map((zone) => zone.id).sort()).toEqual(["NM", "SL"]);
    const between = placementState([0.0015, 0.001], meadow, zones, true, 3);
    expect(between.chosen).toBeNull();
    expect(between.candidates.map((zone) => zone.id).sort()).toEqual(["SL", "SW"]);
    // The result never depends on the package's order.
    const reversed = placementState([0.0015, 0.001], meadow, [...zones].reverse(), true, 3);
    expect(reversed.kind).toBe("between");
    expect(reversed.chosen).toBeNull();
  });

  it("only advises on a practice map: every state can be placed", () => {
    for (const { at, session } of cases) {
      const state = placementState(at, session, zones, false, "v1");
      expect(state.canPlace).toBe(true);
      expect(state.reason).toBeNull();
    }
    expect(placementState([0.003, 0.0015], meadow, zones, false, "v1").readout).toBe(
      "Outside North meadow",
    );
  });

  it("is a state a person can tell without colour: each has its own words and glyph", () => {
    const glyphs = cases.map(
      ({ at, session }) => placementState(at, session, zones, true, 3).glyph,
    );
    expect(glyphs[0]).toEqual({ icon: "circle-check", tone: "saved" });
    expect(glyphs[4]).toEqual({ icon: "circle-alert", tone: "attention" });
  });
});

describe("saveBlock", () => {
  it("blocks a bound save once the record's zone no longer covers the point, keeping the answers", () => {
    expect(saveBlock([0.0005, 0.0015], meadow, zones, true, 3)).toBeNull();
    expect(saveBlock([0.001, 0.0015], slide, zones, true, 3)).toBeNull();
    expect(saveBlock([0.0005, 0.0015], slide, zones, true, 3)).toBe(
      "Not saved yet. The point is outside Slide on map v3. Adjust the point or switch zone. Your answers are kept.",
    );
  });

  it("never blocks a practice map or a whole-zone record", () => {
    expect(saveBlock([0.003, 0.0015], meadow, zones, false, "v1")).toBeNull();
    expect(saveBlock(null, meadow, zones, true, 3)).toBeNull();
  });
});

describe("zoneTap", () => {
  it("selects the one zone tapped, says to choose on an edge, and ignores a gap", () => {
    expect(zoneTap([0.0005, 0.0015], zones)).toEqual({ zone: meadow });
    expect(zoneTap([0.001, 0.0015], zones)).toEqual({
      note: "That spot is on the edge of North meadow and Slide. Choose one in the list.",
    });
    expect(zoneTap([0.003, 0.0015], zones)).toBeNull();
  });
});

describe("nearEdgeHint", () => {
  const perPoint = metresPerPixel(20.5, 0.0015);

  it("suggests zooming in near another zone's edge, and never changes the state", () => {
    // 3 cm west of the meadow and Slide edge: inside the meadow, within 8 points at zoom 20.5.
    const at: Coordinate = [0.001 - 0.03 / 111320, 0.0015];
    const state = placementState(at, meadow, zones, true, 3);
    expect(state.kind).toBe("inside");
    expect(nearEdgeHint(at, state, zones, perPoint)).toBe(
      "Close to the edge of Slide. Zoom in to check.",
    );
  });

  it("says nothing on an edge, where the choice is already shown, or far from every edge", () => {
    const edge = placementState([0.001, 0.0015], meadow, zones, true, 3);
    expect(nearEdgeHint([0.001, 0.0015], edge, zones, perPoint)).toBeNull();
    const far = placementState([0.0005, 0.0015], meadow, zones, true, 3);
    expect(nearEdgeHint([0.0005, 0.0015], far, zones, perPoint)).toBeNull();
  });
});

describe("labels", () => {
  it("names zones in a sentence and the map by its stored version", () => {
    expect(zoneList([meadow])).toBe("North meadow");
    expect(zoneList([meadow, slide, swings])).toBe("North meadow, Slide and Swings");
    expect(mapVersionLabel(2)).toBe("map v2");
    expect(mapVersionLabel("v1")).toBe("map v1");
  });
});
