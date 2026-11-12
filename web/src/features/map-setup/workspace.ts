/**
 * The composition every map-setup step shares: the map takes the wide column and the task beside it keeps
 * a readable measure. Below the large breakpoint the map comes first and the task follows it.
 */
export const WORKSPACE_GRID =
	"grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)]";

/** A working height for the map on every screen, short enough to keep the task in reach on a phone. */
export const MAP_HEIGHT = "w-full h-[min(56svh,26rem)] min-h-72 lg:h-[min(calc(100svh-2rem),44rem)] lg:min-h-96";
