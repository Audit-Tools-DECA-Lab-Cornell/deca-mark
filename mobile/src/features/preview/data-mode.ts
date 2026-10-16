export type DataMode = "device" | "preview";

export const MODE_KEY = "fm.dev.dataSource";

/** Read the optional review-tool preference at the storage boundary. */
export function readDataMode(previewAllowed: boolean, readStored: () => string | null): DataMode {
  if (!previewAllowed) return "device";
  try {
    return readStored() === "preview" ? "preview" : "device";
  } catch {
    // Native storage may be unavailable; showing account data remains the safe default.
    return "device";
  }
}
