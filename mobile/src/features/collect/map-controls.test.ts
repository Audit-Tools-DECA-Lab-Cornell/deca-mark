import { describe, expect, it } from "vitest";
import { CONTROLS_FIT, controlColumns } from "./map-controls";

describe("the map controls lay out in two columns when the frame is too short for one", () => {
  it("keeps one column until the frame has been measured", () => {
    expect(controlColumns(0)).toBe(1);
  });

  it("takes two columns in the frames a phone gives the map", () => {
    // iPhone 17 Pro portrait: the map slot is 46% of the body, about 283 pt of frame.
    expect(controlColumns(283)).toBe(2);
    // A phone in landscape.
    expect(controlColumns(190)).toBe(2);
    expect(controlColumns(CONTROLS_FIT - 1)).toBe(2);
  });

  it("keeps one column from about 340 pt, where all six controls fit", () => {
    expect(controlColumns(CONTROLS_FIT)).toBe(1);
    expect(controlColumns(620)).toBe(1);
  });
});
