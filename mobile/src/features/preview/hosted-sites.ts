import type { HostedDownload } from "../../packages/hosted/provider";
import type { HostedSite } from "../../packages/hosted/schemas";
import { PACKAGE_ASSETS, type PreviewSite } from "./fixtures";

/**
 * A project's hosted site in the shape the Project and Site screens read, and its download state as
 * this device knows it. Nothing here estimates: a download reports which of the four parts it is on,
 * not megabytes it has not measured.
 */

type AssetState = "verified" | "downloading" | "waiting";

export type HostedSiteDownload = {
  state: "notDownloaded" | "downloading" | "ready";
  receivedMb: number;
  totalMb: number;
  assets: { label: string; state: AssetState }[];
  /** Replaces the megabyte line under the progress bar. */
  detail?: string;
  /** Why the last download did not finish. */
  problem?: string;
};

function megabytes(bytes: number): number {
  return Math.max(0.1, Math.round((bytes / (1024 * 1024)) * 10) / 10);
}

export function hostedPreviewSite(projectId: string, site: HostedSite): PreviewSite {
  return {
    id: site.site_id,
    projectId,
    name: site.name,
    zones: site.zones.map((zone) => zone.label),
    packageId: site.package?.package_id ?? "",
    packageVersion: site.package ? `v${site.package.package_version}` : "not prepared",
    sizeMb: site.package ? megabytes(site.package.archive_bytes) : 0,
    initialDownload: "notDownloaded",
    verifiedLabel: "checked against the server's digest",
    bundled: false,
  };
}

export function hostedDownload(
  site: HostedSite,
  stored: boolean,
  progress: HostedDownload | undefined,
): HostedSiteDownload {
  const assets = (states: (index: number) => AssetState) =>
    PACKAGE_ASSETS.map((label, index) => ({ label, state: states(index) }));
  if (stored)
    return {
      state: "ready",
      receivedMb: 0,
      totalMb: 0,
      assets: assets(() => "verified"),
    };
  if (progress?.state === "downloading") {
    const part = progress.part;
    return {
      state: "downloading",
      receivedMb: part,
      totalMb: PACKAGE_ASSETS.length,
      assets: assets((index) =>
        index < part ? "verified" : index === part ? "downloading" : "waiting",
      ),
      detail: `Part ${part + 1} of ${PACKAGE_ASSETS.length} · ${PACKAGE_ASSETS[part] ?? ""}`,
    };
  }
  return {
    state: "notDownloaded",
    receivedMb: 0,
    totalMb: site.package ? megabytes(site.package.archive_bytes) : 0,
    assets: assets(() => "waiting"),
    ...(progress?.state === "failed" ? { problem: progress.message } : {}),
  };
}
