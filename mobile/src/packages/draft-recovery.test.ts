import { expect, it } from "vitest";
import { boundDraft, identity } from "../storage/package-store.fixture";
import { recoveredDraftModel } from "./draft-recovery";
import type { SitePackage } from "./site-package";
import { createZoneReadModelFake } from "./zone-read-model-fake";

const style: SitePackage["bases"]["day"] = { version: 8, sources: {}, layers: [] };
const pkg: SitePackage = {
  id: boundDraft.packageId,
  name: "Synthetic",
  meta: "Synthetic",
  availability: "on-device",
  formVersion: boundDraft.formVersion,
  inventoryFormVersion: "inventory-v7",
  version: "v7",
  siteId: boundDraft.siteId,
  packageIdentity: identity,
  sizeOnDevice: "Synthetic",
  inheritedContext: "",
  centre: [0.5, 0.5],
  bounds: [0, 0, 1, 1],
  bases: { day: style, night: style, aerial: style },
  layers: [],
  zones: [
    {
      id: "A",
      zoneId: boundDraft.binding?.zoneId ?? "",
      label: "Old label",
      centre: [0.5, 0.5],
      displayAnchor: [0.5, 0.5],
      west: 0,
      south: 0,
      east: 1,
      north: 1,
      polygon: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    },
  ],
};
const input = {
  package: undefined,
  noAccess: false,
  canDownload: true,
  bytes: 100,
  parked: false,
} as const;
it.each([
  { ...input, expected: "package_missing", downloadable: true },
  { ...input, noAccess: true, expected: "package_unavailable", downloadable: false },
  { ...input, package: { ...pkg, zones: [] }, expected: "zone_missing", downloadable: false },
  {
    ...input,
    package: { ...pkg, formVersion: "wrong" },
    expected: "form_missing",
    downloadable: false,
  },
])("explains $expected without replacing a retained binding", ({
  expected,
  downloadable,
  ...state
}) => {
  const model = recoveredDraftModel(boundDraft, state);
  expect(model?.status).toBe(expected);
  expect(model?.formVersion).toBe(boundDraft.formVersion);
  expect(model?.redownload.possible).toBe(downloadable);
  expect(model?.pinned).toMatchObject({
    packageId: boundDraft.packageId,
    version: 7,
    zone: { id: boundDraft.binding?.zoneId },
  });
});
it("names the retained inventory form even when the package or its exact form is missing", () => {
  const draft = {
    ...boundDraft,
    formVersion: "inventory-v7",
    context: { ...boundDraft.context, roundType: "inventory" as const },
  };
  expect(recoveredDraftModel(draft, input)?.formVersion).toBe("inventory-v7");
  const model = recoveredDraftModel(draft, {
    ...input,
    package: { ...pkg, inventoryFormVersion: "inventory-v8" },
    parked: true,
  });
  expect(model).toMatchObject({
    formVersion: "inventory-v7",
    status: "form_missing",
    parked: true,
  });
});
it("the UI fake parks unresumable data and refuses to overwrite an active observation", () => {
  const model = recoveredDraftModel(boundDraft, input);
  if (!model) throw new Error("Bound fixture missing");
  const fake = createZoneReadModelFake({ owner: boundDraft.owner, active: model });
  expect(fake.park()).toBe(true);
  expect(fake.getRecoveredDraft().parked[0]?.pinned).toEqual(model.pinned);
  fake.setRecovered({ ...model, draftId: "another" });
  expect(fake.restoreParked(model.draftId)).toBe(false);
  fake.setOwner("another account");
  expect(fake.getRecoveredDraft()).toEqual({ active: null, parked: [] });
});
