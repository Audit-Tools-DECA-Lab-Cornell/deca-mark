import type { Identity } from "../../data/api/identity";
import type { PreviewProject } from "./fixtures";

/**
 * The collector's projects on device data, from the account's `/v1/me` (D24). Memberships carry the
 * project, its organization id, the role and the Training flag; the organization's name comes from the
 * account's organization memberships. Training belongs to an organization the observer is not a member
 * of, so its name falls back to "DECA Mark".
 *
 * Every project, Training included, lists the sites its managers created, read from the DECA Mark API
 * (MOB-14). Training's Practice garden downloads like any other site and its records upload to Training.
 */

/** The organization name when the account is not a member of the project's organization. */
export const FALLBACK_ORG = "DECA Mark";

const TRAINING_SUMMARY = "Practice every step · never in research exports";

export function deviceProjects(
  projects: Identity["project_memberships"],
  organizations: Identity["organization_memberships"],
  hostedSiteIds: (projectId: string) => string[] = () => [],
): PreviewProject[] {
  return projects.map((membership) => {
    const org =
      organizations.find((entry) => entry.organization_id === membership.organization_id)?.name ??
      FALLBACK_ORG;
    return {
      id: membership.project_id,
      name: membership.name,
      org,
      summary: membership.is_training ? TRAINING_SUMMARY : `${org} · ${membership.role} access`,
      siteIds: hostedSiteIds(membership.project_id),
      training: membership.is_training,
    };
  });
}
