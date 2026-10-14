import type { ApiClient } from "../../data/api/client";
import type { HostedSite } from "./schemas";

/** Read the exact package metadata; the site's current pointer remains discovery metadata. */
export async function historicalSite(
  api: ApiClient,
  project: string,
  site: HostedSite,
  packageId: string,
  signal: AbortSignal,
): Promise<HostedSite> {
  if (packageId === site.package?.package_id) return site;
  const detail = await api.packageDetail(project, packageId, signal);
  if (detail.state !== "ready" || detail.site_id !== site.site_id)
    throw new TypeError("The requested historical package is not ready for this site.");
  const { manifest: _manifest, ...summary } = detail;
  return { ...site, package: summary };
}
