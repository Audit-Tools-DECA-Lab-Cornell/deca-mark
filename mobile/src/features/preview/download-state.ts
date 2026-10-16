import { bundledPackage } from "../../packages/bundled";
import type { SitePackage } from "../../packages/site-package";
import { PACKAGE_ASSETS, PREVIEW_SITES, type PreviewSite } from "./fixtures";

export type DownloadState = "notDownloaded" | "downloading" | "ready";
export type AssetState = "verified" | "downloading" | "waiting";

export type SiteDownload = {
  state: DownloadState;
  receivedMb: number;
  totalMb: number;
  assets: { label: string; state: AssetState }[];
  /** Replaces the megabyte line under the progress bar, for a download that reports parts. */
  detail?: string;
  /** Why the last download did not finish. */
  problem?: string;
};

export function previewDownloads(): Record<string, SiteDownload> {
  return Object.fromEntries(
    PREVIEW_SITES.map((site) => [
      site.id,
      site.initialDownload === "ready" ? readyDownload(site) : notDownloaded(site),
    ]),
  );
}

export function readyDownload(site: PreviewSite): SiteDownload {
  return {
    state: "ready",
    receivedMb: site.sizeMb,
    totalMb: site.sizeMb,
    assets: PACKAGE_ASSETS.map((label) => ({ label, state: "verified" })),
  };
}

export function notDownloaded(site: PreviewSite): SiteDownload {
  return { state: "notDownloaded", receivedMb: 0, totalMb: site.sizeMb, assets: waitingAssets() };
}

/** The package that really exists on this phone for a site, if any. */
function devicePackage(site: PreviewSite): SitePackage | undefined {
  const found = bundledPackage(site.packageId);
  return found?.availability === "on-device" ? found : undefined;
}

/** A site as the device knows it: the real package version, and ready only if that package is here. */
export function deviceSite(site: PreviewSite): PreviewSite & { download: SiteDownload } {
  const found = devicePackage(site);
  const onDevice: PreviewSite = found
    ? {
        ...site,
        packageVersion: found.version,
        sizeMb: 0,
        verifiedLabel: "ships with the app",
        bundled: true,
      }
    : { ...site, verifiedLabel: "" };
  return { ...onDevice, download: found ? readyDownload(onDevice) : notDownloaded(onDevice) };
}

export function waitingAssets(): SiteDownload["assets"] {
  return PACKAGE_ASSETS.map((label) => ({ label, state: "waiting" }));
}

/** Asset states for a download that is part-way: earlier parts verify first. */
export function assetsAt(fraction: number): SiteDownload["assets"] {
  return PACKAGE_ASSETS.map((label, index) => {
    const start = index / PACKAGE_ASSETS.length;
    const end = (index + 1) / PACKAGE_ASSETS.length;
    const state: AssetState =
      fraction >= end ? "verified" : fraction >= start ? "downloading" : "waiting";
    return { label, state };
  });
}
