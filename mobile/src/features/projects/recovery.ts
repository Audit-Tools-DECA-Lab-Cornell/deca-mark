import type { HostedDownload } from "../../packages/hosted/context";
import type { Recovered } from "../../packages/zone-read-models";
import { unfinishedSentence } from "./readiness";

/**
 * What an unfinished or parked observation says and offers (UI plan MUI-7), from the data layer's
 * exact status. Recovery never substitutes: no other zone, no newer map. A draft that cannot be
 * resumed can be kept for later, which frees the active slot without discarding its answers.
 */
export type RecoveryAction = "resume" | "redownload" | "park" | "discard";

export type RecoveryCard = {
  /** "North meadow · map v1": the exact zone and map the observation was opened on. */
  readonly title: string;
  readonly lines: readonly string[];
  readonly actions: readonly RecoveryAction[];
  /** "Download map v1 again · 12.0 MB", when re-downloading can help. */
  readonly redownloadLabel: string | null;
  /** "Keep for later", or "Keep for your coordinator" when only a coordinator can recover it. */
  readonly parkLabel: string;
};

/** "640 KB", "12.4 MB": a download's size, from its bytes. */
export function sizeLabel(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `online` is the device's network state, or null while it is not known. */
export function recoveryCard(model: Recovered, online: boolean | null): RecoveryCard {
  const map = `map v${model.pinned.version}`;
  const mapTitle = `Map v${model.pinned.version}`;
  const kept = unfinishedSentence(model);
  const canDownload = model.redownload.possible && online !== false;
  const redownloadLabel = canDownload
    ? `Download ${map} again${model.redownload.bytes ? ` · ${sizeLabel(model.redownload.bytes)}` : ""}`
    : null;
  const withPark = (actions: RecoveryAction[]): RecoveryAction[] =>
    model.parked ? actions : [...actions, "park"];
  const base = { title: `${model.pinned.zone.label} · ${map}`, redownloadLabel };
  switch (model.status) {
    case "ready":
      return {
        ...base,
        lines: [kept],
        actions: ["resume", "discard"],
        parkLabel: "Keep for later",
      };
    case "package_missing":
      return {
        ...base,
        lines: [
          `${mapTitle} is not on this device. Your point and answers are kept.`,
          ...(model.redownload.possible && online === false
            ? [`Connect to download ${map} again.`]
            : []),
        ],
        actions: withPark([...(canDownload ? ["redownload" as const] : []), "discard"]),
        parkLabel: "Keep for later",
      };
    case "package_unavailable":
      return {
        ...base,
        redownloadLabel: null,
        lines: [
          `${mapTitle} cannot be downloaded with your current access. Your point and answers stay on this device. Ask your coordinator.`,
        ],
        actions: withPark(["discard"]),
        parkLabel: "Keep for your coordinator",
      };
    case "zone_missing":
    case "form_missing": {
      const what =
        model.status === "zone_missing"
          ? `This observation's zone (${model.pinned.zone.code}) is not in ${map} on this device.`
          : `The form for this observation is not in ${map} on this device.`;
      return {
        ...base,
        lines: [
          `${what} Your point and answers are kept.`,
          canDownload ? `Download ${map} again.` : "Keep it for your coordinator.",
        ],
        actions: withPark([...(canDownload ? ["redownload" as const] : []), "discard"]),
        parkLabel: canDownload ? "Keep for later" : "Keep for your coordinator",
      };
    }
  }
}

/**
 * Why "Start collection" is off on the Brief, or null (MUI-7): only a resumable observation holding
 * the active slot blocks it, and only for a new visit; returning to the one open here is allowed.
 */
export function startBlock(
  active: Recovered | null,
  siteName: string | null,
  openHere: boolean,
): string | null {
  if (!active || active.status !== "ready" || active.parked || openHere) return null;
  const where = siteName ? ` at ${siteName}` : "";
  return `Resume or discard the unfinished observation${where} (map v${active.pinned.version}).`;
}

/**
 * Why a re-download of this observation's own map did not help, or null: the hosted download keeps its
 * failure, so the card can say whether to reconnect or to ask the coordinator.
 */
export function redownloadProblem(
  model: Recovered,
  download: HostedDownload | undefined,
): string | null {
  if (!download || download.packageId !== model.pinned.packageId) return null;
  const mapTitle = `Map v${model.pinned.version}`;
  if (download.state === "verify_failed")
    return `${mapTitle} could not be checked. Your point and answers are kept. Tell your coordinator.`;
  if (download.state === "failed")
    return download.unavailable
      ? `${mapTitle} cannot be downloaded with your current access. Your point and answers are kept. Ask your coordinator.`
      : `${mapTitle} did not finish downloading. Your point and answers are kept. Try again with a connection.`;
  return null;
}
