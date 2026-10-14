import { identityKey, type PackageIdentity } from "../../domain/package-binding";
import type { StoredPackage } from "./schemas";

// Only catalog-authorized, fully verified objects enter this account's synchronous UI cache.
let owner: string | null = null;
let active: PackageIdentity | null = null;
const packages = new Map<string, StoredPackage>();
const identities = new Map<string, PackageIdentity>();
let leaseRevision = 0;
const leaseListeners = new Set<() => void>();
export function subscribePackageLease(listener: () => void): () => void {
  leaseListeners.add(listener);
  return () => {
    leaseListeners.delete(listener);
  };
}
export function packageLeaseRevision(): number {
  return leaseRevision;
}
export function setPackageAccessOwner(next: string | null): void {
  if (owner !== next) {
    active = null;
    packages.clear();
    identities.clear();
    owner = next;
  }
}
export function rememberVerifiedPackage(
  account: string,
  stored: StoredPackage,
  identity: PackageIdentity,
): void {
  if (owner === account) {
    packages.set(stored.packageId, stored);
    identities.set(stored.packageId, identity);
  }
}
export function forgetVerifiedPackage(account: string, packageId: string): void {
  if (owner === account) {
    packages.delete(packageId);
    identities.delete(packageId);
  }
}
export function readStoredPackage(packageId: string): StoredPackage | null {
  return owner === null ? null : (packages.get(packageId) ?? null);
}
export function hasStoredPackage(packageId: string): boolean {
  return readStoredPackage(packageId) !== null;
}

export function verifiedIdentity(packageId: string): PackageIdentity | undefined {
  return owner === null ? undefined : identities.get(packageId);
}

/** A foreground collector holds a lease even before it has its first durable draft. */
export function setActivePackage(account: string, identity: PackageIdentity | null): void {
  if (
    owner !== account ||
    (active === null && identity === null) ||
    (active && identity && identityKey(active) === identityKey(identity))
  )
    return;
  active = identity;
  leaseRevision += 1;
  for (const listener of leaseListeners) listener();
}
export function activePackage(account: string, identity: PackageIdentity): boolean {
  return owner === account && active !== null && identityKey(active) === identityKey(identity);
}
