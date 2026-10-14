import { createContext, useContext } from "react";
import type { PackageIdentity } from "../../domain/package-binding";
import type { SiteVersions } from "../zone-model-types";
import { hasStoredSitePackage } from "./access";
import type { InstalledVersion, PackageOperations } from "./operations";
import type { PreparePart } from "./prepare";
import type { HostedSite } from "./schemas";
export type HostedDownload =
  | { readonly state: "downloading"; readonly packageId: string; readonly part: PreparePart }
  | {
      readonly state: "failed" | "verify_failed";
      readonly packageId: string;
      readonly part: PreparePart;
      readonly message: string;
      readonly unavailable: boolean;
    };
export type HostedValue = {
  readonly sites: Readonly<Record<string, readonly HostedSite[]>>;
  readonly errors: Readonly<Record<string, string>>;
  readonly downloads: Readonly<Record<string, HostedDownload>>;
  readonly installed: readonly InstalledVersion[];
  readonly revision: number;
  readonly signedIn: boolean;
  readonly allowedProjects: readonly string[] | null;
  readonly checked: Readonly<Record<string, string | null>>;
  readonly problems: Readonly<Record<string, SiteVersions["refreshProblem"]>>;
  refresh: (projectId: string) => Promise<void>;
  download: (projectId: string, siteId: string, packageId?: string) => Promise<void>;
  cancel: (siteId: string) => void;
  remove: (siteId: string) => void;
  removeVersion: (identity: PackageIdentity) => ReturnType<PackageOperations["remove"]>;
};
export const HostedContext = createContext<HostedValue>({
  sites: {},
  errors: {},
  downloads: {},
  installed: [],
  revision: 0,
  signedIn: false,
  allowedProjects: null,
  checked: {},
  problems: {},
  refresh: async () => {},
  download: async () => {},
  cancel: () => {},
  remove: () => {},
  removeVersion: async () => ({
    removed: false,
    reasons: { sessions: 0, drafts: 0, records: 0 },
    contentRetained: true,
  }),
});
export function useHostedSites(): HostedValue {
  return useContext(HostedContext);
}
export function isStored(site: HostedSite): boolean {
  return hasStoredSitePackage(site.site_id);
}
