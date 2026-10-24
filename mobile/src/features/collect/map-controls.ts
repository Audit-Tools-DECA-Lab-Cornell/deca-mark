/**
 * The six map controls (zoom in, zoom out, frame the zone, my location, layers, a larger map) stand
 * in one column about 334 pt tall, counting the frame's inset. A map frame shorter than this lays them
 * in two columns, so they never run past the frame or over the scale bar (MOB-34). Phones stacked
 * over the panel, and phones in landscape, are shorter than this; tablets are not.
 */
export const CONTROLS_FIT = 340;

/** How many columns the controls take in a map frame this tall; 1 until the frame has been measured. */
export function controlColumns(frameHeight: number): 1 | 2 {
  return frameHeight > 0 && frameHeight < CONTROLS_FIT ? 2 : 1;
}

/** The width of one map control (`IconButton`'s "map" variant), which the Layers menu clears. */
export const MAP_CONTROL = 44;
