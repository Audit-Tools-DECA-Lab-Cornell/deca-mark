import { type RoundType, roundLabel } from "../../domain/rounds";
import type { PackageFacts } from "../../packages/open";
import type { AssetState, SiteDownload } from "../preview/data-source";
import { PACKAGE_ASSETS, type PreviewProject, type PreviewSite } from "../preview/fixtures";
import { sizeLabel } from "./package-size";

/**
 * What the Projects, Project and Site screens say about readiness (Mobile 10 to 14), as pure functions
 * of what the data source reports. On device data a site is ready only when its package is really on
 * this phone and passes the checks below; nothing here claims a download the device has not made.
 */

export type SiteWithDownload = PreviewSite & { download: SiteDownload };

/** A contract readiness state with the words adapted to the line it sits on. */
export type ReadinessLine = {
  state: "readyOffline" | "alwaysAvailable" | "notDownloaded" | "downloading" | "unknown";
  label: string;
};

/** The project row's state line on Projects (Mobile 10). */
export function projectReadiness(
  project: Pick<PreviewProject, "training">,
  sites: readonly SiteWithDownload[],
): ReadinessLine {
  if (project.training && sites.some((site) => site.download.state === "ready"))
    return { state: "alwaysAvailable", label: "Always available" };
  if (sites.length === 0) return { state: "unknown", label: "No sites on this device yet" };
  const ready = sites.filter((site) => site.download.state === "ready").length;
  if (ready > 0)
    return {
      state: "readyOffline",
      label: `${ready} ${ready === 1 ? "site" : "sites"} ready offline`,
    };
  if (sites.some((site) => site.download.state === "downloading"))
    return { state: "downloading", label: "Downloading" };
  return { state: "notDownloaded", label: "Not downloaded" };
}

/** A site row's state line on Project (Mobile 11). */
export function siteReadiness(site: SiteWithDownload): ReadinessLine {
  switch (site.download.state) {
    case "ready":
      return site.bundled
        ? { state: "alwaysAvailable", label: "Ships with the app" }
        : { state: "readyOffline", label: "Ready offline" };
    case "downloading":
      // A hosted download says which of the four parts it is on; it never estimates a percentage.
      return {
        state: "downloading",
        label: site.download.detail
          ? `Downloading · ${(site.download.detail.split(" · ")[0] ?? "").toLowerCase()}`
          : `Downloading · ${percentOf(site.download)}%`,
      };
    case "notDownloaded":
      return { state: "notDownloaded", label: "Not downloaded" };
  }
}

/** How a site's zones read: one zone by name ("Whole playground"), several as a count. */
export function zonesPhrase(zones: readonly string[]): string {
  if (zones.length === 1) return zones[0] ?? "1 zone";
  return `${zones.length} zones`;
}

/** A site's zones, version and measured download size, or its bundled/unprepared state. */
export function siteSubtitle(site: SiteWithDownload): string {
  const zones = zonesPhrase(site.zones);
  if (site.bundled) return `${zones} · map ${site.packageVersion}`;
  if (site.packageId === "") return `${zones} · No map package yet`;
  const size = sizeLabel(site.sizeMb * 1024 * 1024);
  if (site.download.state === "ready") return `${zones} · map ${site.packageVersion} · ${size}`;
  return `${zones} · ${size}`;
}

/** "3 zones: North meadow, Woodland edge, Sand area." under a ready site's title (Mobile 13). */
export function zonesSentence(zones: readonly string[]): string {
  if (zones.length === 0) return "No zones are drawn for this site.";
  if (zones.length === 1) return `1 zone: ${zones[0]}.`;
  return `${zones.length} zones: ${zones.join(", ")}.`;
}

/** The whole percentage of a download. */
export function percentOf(download: Pick<SiteDownload, "receivedMb" | "totalMb">): number {
  if (download.totalMb <= 0) return 0;
  return Math.min(100, Math.round((download.receivedMb / download.totalMb) * 100));
}

/** The ready-site count and total archive size, rounded only after summing. */
export function downloadsSummary(sites: readonly SiteWithDownload[]): string {
  const ready = sites.filter((site) => site.download.state === "ready");
  const megabytes = ready.reduce((total, site) => total + (site.bundled ? 0 : site.sizeMb), 0);
  const count = `${ready.length} of ${sites.length}`;
  return megabytes > 0 ? `${count} · ${sizeLabel(megabytes * 1024 * 1024)}` : count;
}

/** What the device can check about a site's package: geometry, zones, a readable form, the guide. */
export type { PackageFacts };

export type AssetCheck = { label: string; state: AssetState };

/**
 * The four parts a site needs before collection can start (Handoff), checked against the package that
 * is really on this device. A part that fails stays Waiting, and the session cannot be set up.
 */
export function deviceAssetChecks(facts: PackageFacts | null): AssetCheck[] {
  const passes = [
    facts?.hasGeometry === true,
    (facts?.zoneCount ?? 0) > 0,
    facts?.formKnown === true,
    facts?.guideInApp === true,
  ];
  return PACKAGE_ASSETS.map((label, index) => ({
    label,
    state: passes[index] ? "verified" : "waiting",
  }));
}

/** "Set up this session" turns on once every part has verified. */
export function allVerified(assets: readonly { state: AssetState }[]): boolean {
  return assets.length > 0 && assets.every((asset) => asset.state === "verified");
}

/** What an unfinished observation holds, for the card on Projects (Mobile 10). */
export type UnfinishedFacts = {
  placed: boolean;
  answered: number;
  /** The questions the form asks with these answers; zero when the form is not known. */
  asked: number;
};

/** "Point placed, 3 of 8 answered. Kept on this device." */
export function unfinishedSentence({ placed, answered, asked }: UnfinishedFacts): string {
  const point = placed ? "Point placed" : "No point yet";
  const answers =
    asked > 0
      ? `${answered} of ${asked} answered`
      : `${answered} ${answered === 1 ? "answer" : "answers"}`;
  return `${point}, ${answers}. Kept on this device.`;
}

/** "North meadow · Standard round", or the package name when the zone is not known. */
export function unfinishedTitle(zone: string | null | undefined, round: RoundType | null): string {
  const place = zone && zone.trim() !== "" ? zone : "Unnamed zone";
  return round === null ? place : `${place} · ${roundLabel(round)}`;
}

/**
 * The 404's reassurance (Mobile 22): "Nothing was lost. The 5 records on this device and your
 * unfinished observation are still here." Returns the bold lead-in and the rest.
 */
export function nothingLostNote(
  records: number,
  unfinished: boolean,
): { title: string; body: string } {
  const title = "Nothing was lost.";
  const recordWords = `The ${records} ${records === 1 ? "record" : "records"} on this device`;
  if (records > 0 && unfinished)
    return { title, body: `${recordWords} and your unfinished observation are still here.` };
  if (records > 0)
    return { title, body: `${recordWords} ${records === 1 ? "is" : "are"} still here.` };
  if (unfinished) return { title, body: "Your unfinished observation is still on this device." };
  return { title, body: "Records you save stay on this device until they upload." };
}
