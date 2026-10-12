import { formFor } from "../forms/registry";
import { bundledPackage, bundledPackages } from "./bundled";
import { readStoredPackage, verifiedIdentity } from "./hosted/access";
import { hostedSitePackage } from "./hosted/build";
import { storedForms } from "./hosted/prepare";
import type { SitePackage } from "./site-package";

/**
 * Opening a site for collection, wherever its package came from: one that ships with the app, or one
 * a project published and this device downloaded. The session and the site screens ask here, so the
 * field flow is the same for both.
 */
export async function openSitePackage(id: string): Promise<SitePackage | undefined> {
  const bundled = await bundledPackages.open(id);
  if (bundled) return bundled;
  const stored = readStoredPackage(id);
  if (!stored) return undefined;
  try {
    return hostedSitePackage(stored, storedForms(stored), verifiedIdentity(id));
  } catch {
    // A stored form this version of the app cannot read: the site is not ready, rather than broken.
    return undefined;
  }
}

/** What this device can check about a site's package before collection starts. */
export type PackageFacts = {
  readonly hasGeometry: boolean;
  readonly zoneCount: number;
  readonly formKnown: boolean;
  readonly guideInApp: boolean;
};

export function packageFacts(packageId: string): PackageFacts | null {
  const bundled = bundledPackage(packageId);
  if (bundled)
    return bundled.availability === "on-device"
      ? {
          hasGeometry:
            Boolean(bundled.bases.day && bundled.bases.night) && bundled.layers.length > 0,
          zoneCount: bundled.zones.length,
          formKnown: formFor(bundled.formVersion) !== undefined,
          // The offline field guide is part of the app, not of a package.
          guideInApp: true,
        }
      : null;
  const stored = readStoredPackage(packageId);
  if (!stored) return null;
  let formKnown = true;
  try {
    storedForms(stored);
  } catch {
    formKnown = false;
  }
  return {
    hasGeometry: stored.layers.ground.features.length > 0,
    zoneCount: stored.manifest.zones.length,
    formKnown,
    guideInApp: true,
  };
}
