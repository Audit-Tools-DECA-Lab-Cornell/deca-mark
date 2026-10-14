import { expect, it } from "vitest";
import { ApiError } from "../data/api/errors";
import { boundDraft } from "../storage/package-store.fixture";
import { boundFixture, ids } from "./hosted/bound-fixture";
import type { HostedValue } from "./hosted/context";
import { downloadFailure } from "./hosted/download-failure";
import { recoveryAvailability } from "./recovery-availability";

const draft = {
  ...boundDraft,
  siteId: ids.site,
  packageId: ids.package,
  binding: boundDraft.binding ? { ...boundDraft.binding, projectId: ids.project } : undefined,
};
const hosted: HostedValue = {
  sites: { [ids.project]: [boundFixture().site] },
  errors: {},
  downloads: {},
  installed: [],
  revision: 0,
  signedIn: true,
  allowedProjects: null,
  checked: {},
  problems: {},
  refresh: async () => {},
  download: async () => {},
  cancel: () => {},
  remove: () => {},
  removeVersion: async () => ({
    removed: false,
    reasons: { drafts: 0, records: 0, sessions: 0 },
    contentRetained: true,
  }),
};
it.each([
  "offline",
  "signed_out",
  "no_access",
] as const)("does not offer exact redownload after %s", (problem) => {
  expect(
    recoveryAvailability({ ...hosted, problems: { [ids.project]: problem } }, draft).canDownload,
  ).toBe(false);
});
it.each([403, 404])("marks the exact pinned package unavailable after HTTP %s", (status) => {
  const failure = downloadFailure(new ApiError("not_found", "rejected", null, status));
  expect(
    recoveryAvailability(
      { ...hosted, downloads: { [ids.site]: { ...failure, packageId: ids.package, part: 0 } } },
      draft,
    ),
  ).toEqual({ noAccess: true, canDownload: false });
});

it("treats an authoritative removed membership as no access while keeping retained draft data", () => {
  expect(recoveryAvailability({ ...hosted, allowedProjects: [] }, draft)).toEqual({
    noAccess: true,
    canDownload: false,
  });
  expect(recoveryAvailability({ ...hosted, allowedProjects: [ids.project] }, draft)).toEqual({
    noAccess: false,
    canDownload: true,
  });
});
