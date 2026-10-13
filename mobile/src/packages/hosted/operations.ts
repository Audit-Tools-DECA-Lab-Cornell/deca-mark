import type { ApiClient } from "../../data/api/client";
import type { PackageIdentity } from "../../domain/package-binding";
import { setAvailableCurrent } from "../../storage/available-current";
import type { LocalDatabase } from "../../storage/observation-store";
import { listCatalog, readSelected, removePackage } from "../../storage/package-catalog";
import { packageReferences } from "../../storage/package-references";
import { activePackage, forgetVerifiedPackage, rememberVerifiedPackage } from "./access";
import {
  type ImmutablePackageFiles,
  installVerifiedPackage,
  type PackageHash,
  packageIdentity,
  readInstalledPackage,
} from "./installation";
import { type PackageSource, type PreparePart, preparePackage } from "./prepare";
import type { HostedSite } from "./schemas";

export type InstalledVersion = {
  readonly identity: PackageIdentity;
  readonly status: "verified" | "needs_redownload";
  readonly installedAt: string | null;
  readonly references: {
    readonly sessions: number;
    readonly drafts: number;
    readonly records: number;
  };
};
export type PackageRuntime = {
  readonly database: LocalDatabase;
  readonly owner: string;
  readonly issuer: string;
  readonly files: ImmutablePackageFiles;
  readonly hash: PackageHash;
  readonly api: ApiClient | null;
  readonly source: (api: ApiClient, project: string, signal: AbortSignal) => PackageSource;
  readonly current: () => boolean;
  readonly authorizedProject: (project: string) => boolean;
  readonly attempt: () => string;
};
export class PackageOperations {
  readonly running = new Map<string, AbortController>();
  constructor(readonly runtime: PackageRuntime) {}
  dispose(): void {
    for (const controller of this.running.values()) controller.abort();
    this.running.clear();
  }
  cancel(key: string): void {
    this.running.get(key)?.abort();
    this.running.delete(key);
  }
  start(key: string): AbortController {
    this.cancel(key);
    const controller = new AbortController();
    this.running.set(key, controller);
    return controller;
  }
  alive(controller: AbortController, project: string): boolean {
    return (
      this.runtime.current() &&
      !controller.signal.aborted &&
      this.runtime.authorizedProject(project)
    );
  }
  async catalog(): Promise<InstalledVersion[]> {
    const r = this.runtime;
    const entries = await listCatalog(r.database, r.owner);
    const versions: InstalledVersion[] = [];
    for (const entry of entries) {
      const stored = await readInstalledPackage(
        r.database,
        r.owner,
        entry.identity,
        r.files,
        r.hash,
      );
      if (!r.current()) return [];
      if (stored) rememberVerifiedPackage(r.owner, stored, entry.identity);
      else forgetVerifiedPackage(r.owner, entry.identity.packageId);
      versions.push({
        identity: entry.identity,
        status: stored ? "verified" : "needs_redownload",
        installedAt: stored?.savedAt ?? null,
        references: await packageReferences(r.database, r.owner, entry.identity),
      });
    }
    return versions;
  }
  async refresh(project: string, _previous: readonly HostedSite[]): Promise<HostedSite[] | null> {
    const r = this.runtime;
    if (!r.api || !r.authorizedProject(project)) return null;
    const key = `refresh:${project}`;
    const controller = this.start(key);
    try {
      const sites = await r.api.sites(project, controller.signal);
      if (!this.alive(controller, project)) return null;
      for (const site of sites) {
        await setAvailableCurrent(
          r.database,
          r.owner,
          project,
          site.site_id,
          site.package
            ? { packageId: site.package.package_id, packageVersion: site.package.package_version }
            : null,
          () => this.alive(controller, project),
        );
      }
      return this.alive(controller, project) ? sites : null;
    } catch (error) {
      if (!this.alive(controller, project)) return null;
      throw error;
    } finally {
      if (this.running.get(key) === controller) this.running.delete(key);
    }
  }
  async download(
    project: string,
    site: HostedSite,
    report: (part: PreparePart) => void,
    packageId = site.package?.package_id,
  ): Promise<boolean> {
    const r = this.runtime;
    if (!r.api || !packageId || !r.authorizedProject(project)) return false;
    const key = site.site_id;
    const controller = this.start(key);
    try {
      let requested = site;
      if (packageId !== site.package?.package_id) {
        const detail = await r.api.packageDetail(project, packageId, controller.signal);
        if (detail.state !== "ready" || detail.site_id !== site.site_id)
          throw new TypeError("The requested historical package is not ready for this site.");
        requested = {
          ...site,
          package: {
            package_id: detail.package_id,
            site_id: detail.site_id,
            package_version: detail.package_version,
            forms: detail.forms,
            state: detail.state,
            archive_bytes: detail.archive_bytes,
            archive_sha256: detail.archive_sha256,
            prepared_at: detail.prepared_at,
            zone_count: detail.zone_count,
            change_note: detail.change_note,
            published_by: detail.published_by,
            source: detail.source,
          },
        };
      }
      const stored = await preparePackage(
        project,
        requested,
        r.source(r.api, project, controller.signal),
        (part) => {
          if (this.alive(controller, project)) report(part);
        },
      );
      const installed = await installVerifiedPackage(
        r.database,
        r.owner,
        r.issuer,
        stored,
        r.files,
        r.hash,
        r.attempt(),
        () => this.alive(controller, project),
      );
      if (!this.alive(controller, project)) return false;
      rememberVerifiedPackage(r.owner, installed, packageIdentity(r.issuer, installed));
      return true;
    } catch (error) {
      if (!this.alive(controller, project)) return false;
      throw error;
    } finally {
      if (this.running.get(key) === controller) this.running.delete(key);
    }
  }
  async remove(identity: PackageIdentity) {
    this.cancel(identity.siteId);
    const result = await removePackage(
      this.runtime.database,
      this.runtime.owner,
      identity,
      () => activePackage(this.runtime.owner, identity),
      this.runtime.current,
    );
    if (result.removed && this.runtime.current())
      forgetVerifiedPackage(this.runtime.owner, identity.packageId);
    return result;
  }
  selected(project: string, site: string) {
    return readSelected(this.runtime.database, this.runtime.owner, project, site);
  }
}
