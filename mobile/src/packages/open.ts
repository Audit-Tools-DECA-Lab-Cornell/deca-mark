import { readStoredPackage, verifiedIdentity } from "./hosted/access";
import { hostedSitePackage } from "./hosted/build";
import { storedForms } from "./hosted/prepare";
import type { SitePackage } from "./site-package";

/**
 * Opening a site for collection: the package a project published and this device downloaded, with the
 * forms it carries. Every site is one of these, Training's Practice garden included. The session and
 * the site screens ask here.
 */
export async function openSitePackage(id: string): Promise<SitePackage | undefined> {
  const stored = readStoredPackage(id);
  const identity = verifiedIdentity(id);
  if (!stored || !identity) return undefined;
  try {
    return hostedSitePackage(stored, storedForms(stored), identity);
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
