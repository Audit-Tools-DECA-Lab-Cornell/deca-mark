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

/** The Layers menu's width when the frame has room for it. */
export const LAYERS_MENU_WIDTH = 248;

/**
 * Where the Layers menu sits beside the controls (`right`, from the frame's right edge) and how wide it
 * may be, so its left edge stays inside a frame `frameWidth` wide: beside two columns an iPhone SE frame
 * leaves it about 219 pt, and the frame hides what overflows. `gap` is the space between the controls,
 * `inset` the frame's own inset. Full width until the frame has been measured.
 */
export function layersMenuBox(columns: 1 | 2, frameWidth: number, gap: number, inset: number) {
  const right = columns * MAP_CONTROL + (columns - 1) * gap + inset * 2;
  const width =
    frameWidth > 0
      ? Math.max(0, Math.min(LAYERS_MENU_WIDTH, frameWidth - right - inset))
      : LAYERS_MENU_WIDTH;
  return { right, width };
}
