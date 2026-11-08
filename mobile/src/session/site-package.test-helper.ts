import { janetInventoryV1 } from "../forms/janet-inventory-v1.test-helper";
import { janetTestV1 } from "../forms/janet-test-v1.test-helper";
import type { SiteZone } from "../maps/sample-site";
import type { SitePackage } from "../packages/site-package";
import type { LocalDatabase } from "../storage/observation-store";
import { installPackage } from "../storage/package-catalog";
import { entry, identity } from "../storage/package-store.fixture";

const style: SitePackage["bases"]["day"] = { version: 8, sources: {}, layers: [] };

const square: SiteZone["polygon"] = [
  [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ],
];

/** The two zones of the synthetic site, with the server's zone UUIDs a binding freezes. */
export const zoneUuids = {
  A: "50000000-0000-4000-8000-000000000001",
  B: "50000000-0000-4000-8000-000000000002",
} as const;

/**
 * A site as a project publishes it and a device downloads it: bound to the verified package identity
 * of `package-store.fixture`, with the janet forms as its play and inventory forms. Every site on a
 * device is one of these, so session tests start from it.
 */
export function boundSitePackage(overrides: Partial<SitePackage> = {}): SitePackage {
  return {
    id: identity.packageId,
    name: "Synthetic site",
    meta: "Synthetic",
    availability: "on-device",
    formVersion: janetTestV1.version,
    inventoryFormVersion: janetInventoryV1.version,
    version: `v${identity.packageVersion}`,
    siteId: identity.siteId,
    sizeOnDevice: "Synthetic",
    inheritedContext: "",
    centre: [0.5, 0.5],
    bounds: [0, 0, 1, 1],
    bases: { day: style, night: style, aerial: style },
    layers: [],
    packageIdentity: identity,
    projectId: identity.projectId,
    forms: { play: janetTestV1, inventory: janetInventoryV1 },
    zones: [
      {
        zoneId: zoneUuids.A,
        geometrySha256: "b".repeat(64),
        displayAnchor: [0.5, 0.5],
        polygon: square,
        id: "A",
        label: "Original",
        centre: [0.5, 0.5],
        west: 0,
        south: 0,
        east: 1,
        north: 1,
      },
      {
        zoneId: zoneUuids.B,
        geometrySha256: "b".repeat(64),
        displayAnchor: [0.8, 0.8],
        polygon: square,
        id: "B",
        label: "Other",
        centre: [0.8, 0.8],
        west: 0,
        south: 0,
        east: 1,
        north: 1,
      },
    ],
    ...overrides,
  };
}

/** The answers that make a Standard record of the janet play form saveable. */
export const standardAnswers = {
  age_range: "age_6_8",
  play_type_1: "physical",
  observer_initials: "AA",
  play_event_summary: "Synthetic observation",
} as const;

/** The package is installed for the owner, as `requireAuthorizedPackage` demands before anything is stored. */
export async function installBound(db: LocalDatabase, owner: string): Promise<void> {
  await installPackage(db, owner, entry);
}
