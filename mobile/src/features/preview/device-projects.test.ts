import { describe, expect, it } from "vitest";
import { identitySchema } from "../../data/api/identity";
import { deviceProjects, FALLBACK_ORG } from "./device-projects";
import { PREVIEW_PROJECTS } from "./fixtures";

const org = "20000000-0000-4000-8000-000000000001";
const trainingOrg = "20000000-0000-4000-8000-000000000099";
const identity = identitySchema.parse({
  profile: {
    user_id: "50000000-0000-4000-8000-000000000001",
    display_name: "Pratyush Sudhakar",
    observer_initials: "PS",
    locale: null,
    created_at: "2026-10-04T00:00:00Z",
  },
  organization_memberships: [
    { organization_id: org, slug: "deca", name: "DECA Lab", role: "member" },
  ],
  project_memberships: [
    {
      project_id: "10000000-0000-4000-8000-000000000003",
      code: "PLAY-26",
      name: "Play Study",
      organization_id: org,
      role: "observer",
      is_training: false,
    },
    {
      project_id: "10000000-0000-4000-8000-000000000002",
      code: "TRAINING",
      name: "Training",
      organization_id: trainingOrg,
      role: "observer",
      is_training: true,
    },
  ],
});

describe("device projects from /v1/me", () => {
  const [study, training] = deviceProjects(
    identity.project_memberships,
    identity.organization_memberships,
  );

  it("maps each membership: id, name, training flag, and its organization's name", () => {
    expect(study).toMatchObject({
      id: "10000000-0000-4000-8000-000000000003",
      name: "Play Study",
      org: "DECA Lab",
      training: false,
      summary: "DECA Lab · observer access",
    });
    expect(training).toMatchObject({
      id: "10000000-0000-4000-8000-000000000002",
      name: "Training",
      training: true,
    });
  });

  it("names DECA Mark when the account is not in the project's organization", () => {
    expect(FALLBACK_ORG).toBe("DECA Mark");
    expect(training?.org).toBe("DECA Mark");
  });

  it("lists Training's sites from the server like any other project's, never a bundled one", () => {
    const listed = deviceProjects(
      identity.project_memberships,
      identity.organization_memberships,
      (projectId) => [`site-of-${projectId.slice(-1)}`],
    );
    expect(listed.map((project) => project.siteIds)).toEqual([["site-of-3"], ["site-of-2"]]);
    expect(training?.siteIds).toEqual([]);
    expect(study?.siteIds).toEqual([]);
    expect(training?.summary).toBe(PREVIEW_PROJECTS.find((project) => project.training)?.summary);
  });

  it("lists nothing for an account with no memberships", () => {
    expect(deviceProjects([], [])).toEqual([]);
  });
});
