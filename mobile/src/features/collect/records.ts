import { observationSummary } from "../../domain/build-observation";
import { shortLabel } from "../../domain/labels";
import type { Observation } from "../../domain/observation";
import { roundLabel } from "../../domain/rounds";
import type { SiteZone } from "../../maps/sample-site";
import type { SessionSave } from "../../session/provider";
import type { MapRecord } from "./CollectMap";

function clock(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/**
 * The play events on this device for one site, as the collect map draws them. A site code is unique
 * only within its project, so the project is matched too. Whole-zone inventory records are left out: their stored point is the zone's centre, not a place
 * where play happened, and drawing it would read as an observation that never occurred.
 */
export function mapRecords(
  records: readonly Observation[],
  siteId: string,
  projectId: string | undefined,
): readonly MapRecord[] {
  return records
    .filter((record) => record.siteId === siteId)
    .filter((record) => record.projectId === projectId)
    .filter((record) => record.placement.source === "hand")
    .map((record) => ({
      id: record.id,
      coordinates: record.coordinates,
      label: shortLabel(record.id),
      time: clock(record.createdAt),
      summary: observationSummary(record),
      round: roundLabel(record.context.roundType),
    }));
}

/** The zones whose inventory was saved in this session. */
export function inventoriedZones(saves: readonly SessionSave[]): ReadonlySet<string> {
  return new Set(saves.filter((save) => save.roundType === "inventory").map((save) => save.zoneId));
}

/** The next zone, after the one just recorded, that has no inventory in this session. */
export function nextZoneToInventory(
  zones: readonly SiteZone[],
  current: SiteZone,
  done: ReadonlySet<string>,
): SiteZone | null {
  const start = zones.findIndex((zone) => zone.id === current.id);
  for (let step = 1; step <= zones.length; step += 1) {
    const candidate = zones[(start + step) % zones.length];
    if (candidate && !done.has(candidate.id)) return candidate;
  }
  return null;
}

/** "OBS-3F2A1B · 11:34", for the place step's "Last saved on this device". */
export function lastSavedLine(saves: readonly SessionSave[]): string | null {
  const last = saves[0];
  return last ? `${shortLabel(last.id)} · ${clock(last.savedAt)}` : null;
}
