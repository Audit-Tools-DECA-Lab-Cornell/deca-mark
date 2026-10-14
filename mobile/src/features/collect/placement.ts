import type { Coordinate } from "../../domain/observation";
import { coveringZones, nearEdge } from "../../maps/geometry";
import type { SiteZone } from "../../maps/sample-site";
import type { IconName, StateTone } from "../../ui";

/**
 * Where the cross is against the session's zone S and the zones that cover it, C (UI plan MUI-3):
 * - inside: C = {S};
 * - edge: S is in C with other zones; S stays chosen, the observer may choose another;
 * - other: S is not in C, which is one other zone; "Switch to it";
 * - between: S is not in C, which is several zones; nothing is chosen;
 * - outside: C is empty (a gap, a hole or outside the site).
 */
export type PlacementKind = "inside" | "edge" | "other" | "between" | "outside";

export type PlacementState = {
  readonly kind: PlacementKind;
  /** The zones covering the cross, in the package's order (which means nothing). */
  readonly candidates: readonly SiteZone[];
  /** The zone a point placed now would be recorded in, or null when one must be chosen first. */
  readonly chosen: SiteZone | null;
  /** On a bound map, a point outside its zone cannot be placed. Practice maps only advise. */
  readonly canPlace: boolean;
  /** Why "Place point here" is off, shown under it; null while it is on. */
  readonly reason: string | null;
  /** The readout in field words: "In North meadow", "On the edge of North meadow and Slide". */
  readonly readout: string;
  readonly glyph: { readonly icon: IconName; readonly tone: StateTone };
};

/** "A", "A and B", "A, B and C": zone names inside a sentence. */
export function zoneList(zones: readonly SiteZone[]): string {
  const names = zones.map((zone) => zone.label);
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "map v3": a version label from the stored integer or the practice map's own label, never parsed. */
export function mapVersionLabel(version: number | string): string {
  return typeof version === "number" ? `map v${version}` : `map ${version}`;
}

/**
 * The placement state for a cross at `point`. `bound` is true on a map from DECA Mark (the session is
 * pinned to a verified package); `version` names it in the readout for a point outside every zone.
 */
export function placementState(
  point: Coordinate,
  session: SiteZone,
  zones: readonly SiteZone[],
  bound: boolean,
  version: number | string,
): PlacementState {
  const candidates = coveringZones(point, zones);
  const inSession = candidates.some((zone) => zone.id === session.id);
  const others = candidates.filter((zone) => zone.id !== session.id);
  const gate = (reason: string) =>
    bound ? { canPlace: false, reason } : { canPlace: true, reason: null };
  if (inSession && others.length === 0)
    return {
      kind: "inside",
      candidates,
      chosen: session,
      canPlace: true,
      reason: null,
      readout: `In ${session.label}`,
      glyph: { icon: "circle-check", tone: "saved" },
    };
  if (inSession)
    return {
      kind: "edge",
      candidates,
      chosen: session,
      canPlace: true,
      reason: null,
      readout: `On the edge of ${zoneList([session, ...others])}`,
      glyph: { icon: "triangle-alert", tone: "waiting" },
    };
  const [only] = others;
  if (only && others.length === 1)
    return {
      kind: "other",
      candidates,
      chosen: null,
      ...gate(`Switch to ${only.label} or move the ×.`),
      readout: `Outside ${session.label} · in ${only.label}`,
      glyph: { icon: "triangle-alert", tone: "waiting" },
    };
  if (others.length > 1)
    return {
      kind: "between",
      candidates,
      chosen: null,
      ...gate("Choose one of these zones or move the ×."),
      readout: `Outside ${session.label} · on the edge of ${zoneList(others)}`,
      glyph: { icon: "triangle-alert", tone: "waiting" },
    };
  return {
    kind: "outside",
    candidates,
    chosen: null,
    ...gate("Move the × into a zone."),
    readout: bound
      ? `Outside every zone on ${mapVersionLabel(version)}`
      : `Outside ${session.label}`,
    glyph: { icon: "circle-alert", tone: bound ? "attention" : "waiting" },
  };
}

/** The UI-only hint near an edge, or null. It never changes the candidates or what can be placed. */
export function nearEdgeHint(
  point: Coordinate,
  state: PlacementState,
  zones: readonly SiteZone[],
  metresPerPoint: number,
): string | null {
  if (state.kind === "edge" || state.kind === "between") return null;
  const near = nearEdge(point, zones, metresPerPoint);
  return near ? `Close to the edge of ${near.label}. Zoom in to check.` : null;
}

/**
 * The save gate's second checkpoint (MUI-4): on a bound map, a hand-placed point must still be covered
 * by the record's zone, which may have changed after placing. Null when it may be saved.
 */
export function saveBlock(
  placed: Coordinate | null,
  zone: SiteZone,
  zones: readonly SiteZone[],
  bound: boolean,
  version: number | string,
): string | null {
  if (!bound || !placed) return null;
  if (coveringZones(placed, zones).some((candidate) => candidate.id === zone.id)) return null;
  return `Not saved yet. The point is outside ${zone.label} on ${mapVersionLabel(version)}. Adjust the point or switch zone. Your answers are kept.`;
}

/** A map tap while choosing an inventory's zone (MUI-9): one zone selects it; an edge says to choose. */
export function zoneTap(
  point: Coordinate,
  zones: readonly SiteZone[],
): { readonly zone: SiteZone } | { readonly note: string } | null {
  const candidates = coveringZones(point, zones);
  const [only] = candidates;
  if (!only) return null;
  if (candidates.length === 1) return { zone: only };
  return { note: `That spot is on the edge of ${zoneList(candidates)}. Choose one in the list.` };
}
