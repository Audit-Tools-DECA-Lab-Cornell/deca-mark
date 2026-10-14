import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useAccount } from "../auth/provider";
import { useFieldSession } from "../session/context";
import { zoneReferences } from "../storage/zone-references";
import { useSync } from "../sync/provider";
import { activePackage, packageLeaseRevision, subscribePackageLease } from "./hosted/access";
import { useHostedSites } from "./hosted/context";
import type { VersionReferences } from "./zone-model-types";

/** Live store-backed model scoped to the account; the UUID identifies the site globally. */
export { siteVersionSnapshot } from "./site-version-snapshot";

import { emptyReferences, siteVersionSnapshot } from "./site-version-snapshot";

export function useSiteVersions(siteId: string) {
  const db = useSQLiteContext();
  const { key } = useAccount();
  const hosted = useHostedSites();
  const session = useFieldSession();
  const sync = useSync();
  const leases = useSyncExternalStore(
    subscribePackageLease,
    packageLeaseRevision,
    packageLeaseRevision,
  );
  const [loaded, setLoaded] = useState<{
    readonly owner: string;
    readonly counts: Readonly<Record<string, VersionReferences>>;
    readonly problem: string | null;
  }>({ owner: key, counts: {}, problem: null });
  useEffect(() => {
    void hosted.revision;
    void session.inProgress;
    void session.parked;
    void session.saves;
    void sync.revision;
    void leases;
    let current = true;
    void Promise.all(
      hosted.installed
        .filter((entry) => entry.identity.siteId === siteId)
        .map(
          async (entry) =>
            [
              entry.identity.packageId,
              {
                ...(await zoneReferences(db, key, entry.identity)),
                openSession: activePackage(key, entry.identity),
              },
            ] as const,
        ),
    )
      .then((values) => {
        if (current) setLoaded({ owner: key, counts: Object.fromEntries(values), problem: null });
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error)) throw error;
        if (current)
          setLoaded({
            owner: key,
            counts: {},
            problem: "Map references could not be read. Removal still checks stored references.",
          });
      });
    return () => {
      current = false;
    };
  }, [
    db,
    key,
    siteId,
    hosted.installed,
    hosted.revision,
    session.inProgress,
    session.parked,
    session.saves,
    sync.revision,
    leases,
  ]);
  const model = siteVersionSnapshot(hosted, siteId, loaded.owner === key ? loaded.counts : {});
  const entry = hosted.installed.find((version) => version.identity.siteId === siteId);
  const project =
    Object.entries(hosted.sites).find(([, sites]) =>
      sites.some((site) => site.site_id === siteId),
    )?.[0] ?? entry?.identity.projectId;
  return {
    ...model,
    referencesProblem: loaded.owner === key ? loaded.problem : null,
    download: model.download,
    downloadPackage: (packageId: string) =>
      project ? hosted.download(project, siteId, packageId) : Promise.resolve(),
    cancelDownload: (_packageId: string) => hosted.cancel(siteId),
    refresh: () => (project ? hosted.refresh(project) : Promise.resolve()),
    async remove(packageId: string) {
      const version = hosted.installed.find(
        (value) => value.identity.packageId === packageId && value.identity.siteId === siteId,
      );
      if (!version) return { removed: false as const, references: emptyReferences };
      const result = await hosted.removeVersion(version.identity);
      return result.removed
        ? { removed: true as const }
        : {
            removed: false as const,
            references: {
              ...(await zoneReferences(db, key, version.identity)),
              openSession: result.reasons.sessions > 0,
            },
          };
    },
  };
}
