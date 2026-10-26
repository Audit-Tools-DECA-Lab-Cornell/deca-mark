export type VersionReferences = {
  readonly unfinished: number;
  readonly unsent: number;
  readonly attention: number;
  readonly retained: number;
  readonly openSession: boolean;
};
export type SiteVersions = {
  readonly available: {
    readonly packageId: string;
    readonly version: number;
    readonly archiveBytes: number;
  } | null;
  readonly installed: readonly {
    readonly packageId: string;
    readonly version: number;
    readonly status: "verified" | "needs_redownload" | "update_required";
    readonly bytes: number;
    readonly installedAt: string | null;
    readonly references: VersionReferences;
  }[];
  readonly nextSessionPackageId: string | null;
  readonly lastCheckedAt: string | null;
  readonly refreshProblem: "offline" | "signed_out" | "no_access" | "server" | null;
  readonly download: {
    readonly packageId: string;
    readonly part: 0 | 1 | 2 | 3;
    readonly state: "running" | "failed" | "verify_failed";
    readonly message?: string;
  } | null;
};
export type Pinned = {
  readonly packageId: string;
  readonly version: number;
  readonly siteId: string;
  readonly zone: { readonly id: string; readonly code: string; readonly label: string };
};
export type Recovered = {
  readonly draftId: string;
  readonly formVersion: string;
  readonly pinned: Pinned;
  readonly placed: boolean;
  readonly answered: number;
  readonly asked: number;
  readonly status:
    | "ready"
    | "package_missing"
    | "package_unavailable"
    | "zone_missing"
    | "form_missing";
  readonly parked: boolean;
  readonly redownload: { readonly possible: boolean; readonly bytes: number | null };
};
