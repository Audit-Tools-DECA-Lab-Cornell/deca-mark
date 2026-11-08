import type { ObservationDraft } from "../storage/draft-store";
import type { HostedValue } from "./hosted/context";

export function recoveryAvailability(hosted: HostedValue, draft: ObservationDraft) {
  const project = draft.binding.projectId;
  const site = hosted.sites[project]?.find((value) => value.site_id === draft.siteId);
  const problem = hosted.problems[project];
  const download = hosted.downloads[draft.siteId];
  const unavailable =
    download?.packageId === draft.packageId &&
    download.state !== "downloading" &&
    download.unavailable;
  return {
    noAccess:
      problem === "no_access" ||
      unavailable === true ||
      (hosted.allowedProjects !== null && !hosted.allowedProjects.includes(project)),
    canDownload:
      hosted.signedIn &&
      site !== undefined &&
      problem !== "offline" &&
      problem !== "signed_out" &&
      problem !== "no_access" &&
      !unavailable &&
      (hosted.allowedProjects === null || hosted.allowedProjects.includes(project)),
  };
}
