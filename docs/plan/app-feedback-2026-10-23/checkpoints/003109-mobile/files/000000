import type { SiteVersions, VersionReferences } from "../../packages/zone-read-models";
import { PACKAGE_ASSETS } from "../preview/fixtures";
import type { ReadinessLine } from "./readiness";
import { sizeLabel } from "./recovery";

/**
 * What the Site, Project, Projects and Brief screens say about a site's map versions (UI plan MUI-1,
 * MUI-2, MUI-6 and MUI-10), from the data layer's `SiteVersions`. Versions are the stored integers,
 * shown "v2"; nothing is parsed from a label. A newer map is announced here, never on collect.
 */

type Installed = SiteVersions["installed"][number];

/** The four parts a download checks, named as the site screen always has. */
export const PACKAGE_PARTS = PACKAGE_ASSETS;

export type PartState = "verified" | "downloading" | "waiting";

export type VersionView = {
  /** The newest verified map on this device: what the next session opens. */
  readonly newest: Installed | null;
  /** A newer published map than any verified here, with its download button's words. */
  readonly update: {
    readonly packageId: string;
    readonly note: string;
    readonly button: string;
  } | null;
  /** The first download of a site with nothing on this device yet. */
  readonly first: { readonly packageId: string; readonly button: string } | null;
  readonly progress: {
    readonly version: number | null;
    readonly part: number;
    readonly detail: string;
    readonly parts: readonly { readonly label: string; readonly state: PartState }[];
  } | null;
  readonly failure: { readonly title: string; readonly body: string } | null;
  /** Maps on this device that must be downloaded again (their files no longer verify). */
  readonly redownload: readonly { readonly packageId: string; readonly button: string }[];
  /** Every other version kept on this device, newest first, each with what still uses it. */
  readonly older: readonly VersionRow[];
  readonly refresh: string | null;
};

export type VersionRow = {
  readonly packageId: string;
  readonly version: number;
  readonly label: string;
  /** What still uses it, or null when nothing does and it may be removed. */
  readonly usedBy: string | null;
};

/** "Today · 09:12", "Oct 10 · 09:12": when this device last checked, in its own time. */
export function whenLabel(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (sameDay) return `Today · ${time}`;
  const month = at.toLocaleString("en-US", { month: "short" });
  return `${month} ${at.getDate()} · ${time}`;
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * "Used by 1 unfinished observation and 3 records not uploaded yet.", or null when nothing uses the
 * map. Synced records that still need their map count too: there is no eviction policy for them.
 */
export function referencesSentence(references: VersionReferences): string | null {
  const uses = [
    references.openSession ? "the collection open now" : null,
    references.unfinished > 0
      ? count(references.unfinished, "unfinished observation", "unfinished observations")
      : null,
    references.unsent > 0
      ? `${count(references.unsent, "record", "records")} not uploaded yet`
      : null,
    references.attention > 0
      ? `${count(references.attention, "record that needs", "records that need")} attention`
      : null,
    references.retained > 0
      ? `${count(references.retained, "uploaded record", "uploaded records")} kept on this device`
      : null,
  ].filter((use): use is string => use !== null);
  if (uses.length === 0) return null;
  const list = uses.length === 1 ? uses[0] : `${uses.slice(0, -1).join(", ")} and ${uses.at(-1)}`;
  return `Used by ${list}.`;
}

export function versionView(model: SiteVersions, now: Date = new Date()): VersionView {
  const newest = model.installed.find((entry) => entry.status === "verified") ?? null;
  const available = model.available;
  const newer = available && (!newest || available.version > newest.version) ? available : null;
  const running = model.download?.state === "running" ? model.download : null;
  const failed = model.download && model.download.state !== "running" ? model.download : null;
  const versionOf = (packageId: string) =>
    model.installed.find((entry) => entry.packageId === packageId)?.version ??
    (available?.packageId === packageId ? available.version : null);
  const downloading = running ? versionOf(running.packageId) : null;
  const failedVersion = failed ? versionOf(failed.packageId) : null;
  const failedName = failedVersion === null ? "The map" : `Map v${failedVersion}`;

  return {
    newest,
    update:
      newer && newest && !running
        ? {
            packageId: newer.packageId,
            note: `Map v${newer.version} is available. Download it now to use it from your next session. Your unfinished and saved observations keep map v${newest.version}.`,
            button: `Download v${newer.version} · ${sizeLabel(newer.archiveBytes)}`,
          }
        : null,
    first:
      newer && !newest && !running
        ? { packageId: newer.packageId, button: `Download ${sizeLabel(newer.archiveBytes)}` }
        : null,
    progress: running
      ? {
          version: downloading,
          part: running.part,
          detail: `Downloading · part ${running.part + 1} of ${PACKAGE_PARTS.length}`,
          parts: PACKAGE_PARTS.map((label, index) => ({
            label,
            state:
              index < running.part
                ? "verified"
                : index === running.part
                  ? "downloading"
                  : "waiting",
          })),
        }
      : null,
    failure: failed
      ? failed.state === "verify_failed"
        ? {
            title: `${failedName} could not be checked.`,
            body: `${failed.message ? `${failed.message} ` : ""}${newest ? `Map v${newest.version} stays on this device. ` : "Nothing was kept. "}Tell your coordinator.`,
          }
        : {
            title: `${failedName} did not finish downloading.`,
            body: newest
              ? `Map v${newest.version} is still on this device and ready.`
              : "Nothing was kept; you can try again.",
          }
      : null,
    redownload: model.installed
      .filter((entry) => entry.status === "needs_redownload")
      .map((entry) => ({
        packageId: entry.packageId,
        button: `Download map v${entry.version} again · ${sizeLabel(entry.bytes)}`,
      })),
    older: model.installed
      .filter((entry) => entry.packageId !== newest?.packageId)
      .map((entry) => ({
        packageId: entry.packageId,
        version: entry.version,
        label: `Map v${entry.version} · ${sizeLabel(entry.bytes)}${entry.status === "update_required" ? " · update DECA Mark to use this form; map and unfinished work retained" : entry.status === "needs_redownload" ? " · needs downloading again" : ""}`,
        usedBy: referencesSentence(entry.references),
      })),
    refresh: refreshLine(model, now),
  };
}

function refreshLine(model: SiteVersions, now: Date): string | null {
  const known = model.lastCheckedAt ? whenLabel(model.lastCheckedAt, now) : null;
  switch (model.refreshProblem) {
    case "offline":
    case "server":
      return known
        ? `Could not check for map updates. Showing what this device knew at ${known}.`
        : "Could not check for map updates. Showing what this device knows.";
    case "signed_out":
      return "Sign in to check for map updates. The maps on this device stay ready.";
    case "no_access":
      return "You no longer have access to this project's maps. The maps and records on this device stay here.";
    default:
      return null;
  }
}

/** "Checked for updates Today · 09:12", or null before the first check. */
export function checkedLine(model: SiteVersions, now: Date = new Date()): string | null {
  return model.lastCheckedAt ? `Checked for updates ${whenLabel(model.lastCheckedAt, now)}` : null;
}

/**
 * The Project screen's line for a site: "3 zones · map v1 · v2 available · 12.0 MB", from the newest
 * verified map on this device and the published one.
 */
export function siteVersionLine(zones: number, model: SiteVersions): string {
  const view = versionView(model);
  const zonesText = count(zones, "zone", "zones");
  if (!view.newest)
    return model.available
      ? `${zonesText} · map v${model.available.version} · ${sizeLabel(model.available.archiveBytes)}`
      : `${zonesText} · no map package yet`;
  const update =
    model.available && model.available.version > view.newest.version ? model.available : null;
  return update
    ? `${zonesText} · map v${view.newest.version} · v${update.version} available · ${sizeLabel(update.archiveBytes)}`
    : `${zonesText} · map v${view.newest.version}`;
}

/** Whether a site has a newer published map than any verified on this device (for the Projects row). */
export function hasUpdate(model: SiteVersions): boolean {
  const view = versionView(model);
  return view.newest !== null && view.update !== null;
}

/**
 * The Brief's line on which map this session uses (MUI-10), from the session's pinned version and the
 * site's versions, or null when there is nothing to say.
 */
export function briefVersionNote(sessionVersion: number, model: SiteVersions): string | null {
  const published = model.available?.version ?? null;
  const earlier = model.installed.some((entry) => entry.version < sessionVersion);
  if (published !== null && published > sessionVersion)
    return `This session uses map v${sessionVersion}, the newest map on this device. Map v${published} has been published. Download it when you have a connection.`;
  if (earlier)
    return `This session uses map v${sessionVersion}. Earlier observations keep the map they were recorded on.`;
  return null;
}

/**
 * A hosted site's readiness from the verified catalog (MUI-1): ready while any verified map is on this
 * device, even after a newer one is published; a download says which of the four parts it is on.
 */
export function hostedReadiness(model: SiteVersions): ReadinessLine {
  if (model.download?.state === "running")
    return {
      state: "downloading",
      label: `Downloading · part ${model.download.part + 1} of ${PACKAGE_PARTS.length}`,
    };
  if (model.nextSessionPackageId) return { state: "readyOffline", label: "Ready offline" };
  return { state: "notDownloaded", label: "Not downloaded" };
}

/** " · map update for 1 site": the Projects row's addition when newer maps are published. */
export function updatesPhrase(updates: number): string {
  if (updates === 0) return "";
  return ` · map update for ${updates} ${updates === 1 ? "site" : "sites"}`;
}
