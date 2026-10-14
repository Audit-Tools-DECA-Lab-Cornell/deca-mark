import type { HostedValue } from "./hosted/context";
import type { SiteVersions, VersionReferences } from "./zone-model-types";

export const emptyReferences = {
  unfinished: 0,
  unsent: 0,
  attention: 0,
  retained: 0,
  openSession: false,
} as const;
export function siteVersionSnapshot(
  hosted: HostedValue,
  siteId: string,
  counts: Readonly<Record<string, VersionReferences>> = {},
): SiteVersions {
  const located = Object.entries(hosted.sites)
    .flatMap(([project, sites]) => sites.map((site) => ({ project, site })))
    .find(({ site }) => site.site_id === siteId);
  const versions = hosted.installed
    .filter((entry) => entry.identity.siteId === siteId)
    .sort((a, b) => b.identity.packageVersion - a.identity.packageVersion);
  const project = located?.project ?? versions[0]?.identity.projectId;
  const downloading = hosted.downloads[siteId];
  const available = located?.site.package;
  return {
    available: available
      ? {
          packageId: available.package_id,
          version: available.package_version,
          archiveBytes: available.archive_bytes,
        }
      : null,
    installed: versions.map((entry) => ({
      packageId: entry.identity.packageId,
      version: entry.identity.packageVersion,
      status: entry.status,
      bytes: entry.bytes,
      installedAt: entry.installedAt,
      references: counts[entry.identity.packageId] ?? entry.counts,
    })),
    nextSessionPackageId:
      versions.find((entry) => entry.status === "verified")?.identity.packageId ?? null,
    lastCheckedAt: project ? (hosted.checked[project] ?? null) : null,
    refreshProblem: project
      ? (hosted.problems[project] ?? (hosted.signedIn ? null : "signed_out"))
      : null,
    download: downloading
      ? {
          ...downloading,
          state: downloading.state === "downloading" ? "running" : downloading.state,
        }
      : null,
  };
}
