import { describe, expect, it } from "vitest";
import { CONTROLS_FIT, controlColumns, LAYERS_MENU_WIDTH, layersMenuBox } from "./map-controls";

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

describe("the Layers menu stays inside the map frame", () => {
  const gap = 8;
  const inset = 12;

  it("narrows beside two columns on an iPhone SE in portrait, so its left edge is not cut off", () => {
    // The frame is about 351 pt wide; two columns put the menu 120 pt from its right edge.
    const box = layersMenuBox(2, 351, gap, inset);
    expect(box.right).toBe(120);
    expect(box.right + box.width + inset).toBeLessThanOrEqual(351);
    expect(box.width).toBe(219);
  });

  it("keeps its full width where the frame has room, and before the frame is measured", () => {
    expect(layersMenuBox(1, 820, gap, inset)).toEqual({ right: 68, width: LAYERS_MENU_WIDTH });
    expect(layersMenuBox(2, 0, gap, inset).width).toBe(LAYERS_MENU_WIDTH);
  });

  it("never asks for a negative width", () => {
    expect(layersMenuBox(2, 100, gap, inset).width).toBe(0);
  });
});
