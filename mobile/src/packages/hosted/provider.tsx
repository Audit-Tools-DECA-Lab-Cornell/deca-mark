import { randomUUID } from "expo-crypto";
import { useSQLiteContext } from "expo-sqlite";
import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useAccount } from "../../auth/provider";
import { type ApiClient, createApiClient } from "../../data/api/client";
import { ApiError } from "../../data/api/errors";
import { useMe } from "../../data/api/me-provider";
import type { PackageIdentity } from "../../domain/package-binding";
import { connection } from "../../platform/config";
import { setPackageAccessOwner } from "./access";
import { HostedContext, type HostedDownload } from "./context";
import {
  apiPackageSource,
  devicePackageFiles,
  deviceSha256,
  readSiteList,
  writeSiteList,
} from "./device";
import { reconcileStaging } from "./installation";
import { type InstalledVersion, PackageOperations } from "./operations";
import { PrepareError } from "./prepare";
import type { HostedSite } from "./schemas";

export { type HostedDownload, isStored, useHostedSites } from "./context";

function message(error: unknown): string {
  return error instanceof PrepareError || error instanceof ApiError || error instanceof Error
    ? error.message
    : "The download stopped. Check the connection and try again.";
}

export function HostedSitesProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const { client, session, account, key, scope } = useAccount();
  const { projects } = useMe();
  const userId = account?.id ?? null;
  const issuer = scope?.issuer ?? null;
  const owner = issuer && userId ? key : null;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  setPackageAccessOwner(owner);
  const projectIds = useMemo(
    () => projects.filter((project) => !project.is_training).map((project) => project.project_id),
    [projects],
  );
  const allowed = useRef(projectIds);
  allowed.current = projectIds;
  const [viewOwner, setViewOwner] = useState(owner);
  const [sites, setSites] = useState<Record<string, readonly HostedSite[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [downloads, setDownloads] = useState<Record<string, HostedDownload>>({});
  const [installed, setInstalled] = useState<readonly InstalledVersion[]>([]);
  const [revision, setRevision] = useState(0);
  const api = useMemo<ApiClient | null>(
    () =>
      client && session && userId
        ? createApiClient(connection.apiUrl, async () => {
            const { data } = await client.auth.getSession();
            return data.session?.user.id === userId ? data.session.access_token : null;
          })
        : null,
    [client, session, userId],
  );
  const generation = useRef(0);
  const operations = useMemo(() => {
    const epoch = ++generation.current;
    return owner && issuer
      ? new PackageOperations({
          database,
          owner,
          issuer,
          files: devicePackageFiles,
          hash: deviceSha256,
          api,
          source: apiPackageSource,
          current: () => currentOwner.current === owner && generation.current === epoch,
          authorizedProject: (project) => allowed.current.includes(project),
          attempt: randomUUID,
        })
      : null;
  }, [api, database, issuer, owner]);
  const reload = useCallback(async () => {
    if (!operations) return;
    const versions = await operations.catalog();
    if (operations.runtime.current()) {
      setInstalled(versions);
      setRevision((value) => value + 1);
    }
  }, [operations]);
  useEffect(() => {
    setViewOwner(owner);
    setErrors({});
    setDownloads({});
    setInstalled([]);
    setSites(
      issuer && userId
        ? Object.fromEntries(
            projectIds.flatMap((project) => {
              const cached = readSiteList(issuer, userId, project);
              return cached ? [[project, cached]] : [];
            }),
          )
        : {},
    );
    reconcileStaging(devicePackageFiles);
    void reload().catch((error: unknown) => {
      if (operations?.runtime.current()) setErrors({ storage: message(error) });
    });
    return () => operations?.dispose();
  }, [issuer, operations, owner, projectIds, reload, userId]);
  const refresh = useCallback(
    async (project: string) => {
      if (!operations || !issuer || !userId) return;
      try {
        const list = await operations.refresh(project, sites[project] ?? []);
        if (!list || !operations.runtime.current()) return;
        writeSiteList(issuer, userId, project, list);
        setSites((current) => ({ ...current, [project]: list }));
        setErrors(({ [project]: _cleared, ...rest }) => rest);
      } catch (error) {
        if (operations.runtime.current())
          setErrors((current) => ({ ...current, [project]: message(error) }));
      }
    },
    [issuer, operations, sites, userId],
  );
  // Refresh uses a ref so a list response does not recreate the foreground subscription and loop.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!api) return;
    const all = () => {
      for (const project of projectIds) void refreshRef.current(project);
    };
    all();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") all();
    });
    return () => subscription.remove();
  }, [api, projectIds]);
  const download = useCallback(
    async (project: string, siteId: string, packageId?: string) => {
      const site = sites[project]?.find((entry) => entry.site_id === siteId);
      if (!operations || !site) return;
      try {
        const saved = await operations.download(
          project,
          site,
          (part) =>
            setDownloads((current) => ({ ...current, [siteId]: { state: "downloading", part } })),
          packageId,
        );
        if (!saved || !operations.runtime.current()) return;
        setDownloads(({ [siteId]: _done, ...rest }) => rest);
        await reload();
      } catch (error) {
        if (operations.runtime.current() && !operations.running.get(siteId)?.signal.aborted)
          setDownloads((current) => ({
            ...current,
            [siteId]: { state: "failed", message: message(error) },
          }));
      }
    },
    [operations, reload, sites],
  );
  const cancel = useCallback(
    (site: string) => {
      operations?.cancel(site);
      setDownloads(({ [site]: _cancelled, ...rest }) => rest);
    },
    [operations],
  );
  const removeVersion = useCallback(
    async (identity: PackageIdentity) => {
      if (!operations)
        return {
          removed: false,
          reasons: { sessions: 0, drafts: 0, records: 0 },
          contentRetained: true as const,
        };
      const result = await operations.remove(identity);
      if (operations.runtime.current()) await reload();
      return result;
    },
    [operations, reload],
  );
  const remove = useCallback(
    (site: string) => {
      const entry = installed
        .filter((version) => version.identity.siteId === site)
        .sort((a, b) => b.identity.packageVersion - a.identity.packageVersion)[0];
      if (entry)
        void removeVersion(entry.identity)
          .then((result) => {
            if (!result.removed && operations?.runtime.current())
              setErrors((current) => ({
                ...current,
                [site]:
                  "This map is retained by a session, unfinished observation or saved record.",
              }));
          })
          .catch((error: unknown) => {
            if (operations?.runtime.current())
              setErrors((current) => ({ ...current, [site]: message(error) }));
          });
    },
    [installed, operations, removeVersion],
  );
  const visible = viewOwner === owner;
  return (
    <HostedContext
      value={{
        sites: visible ? sites : {},
        errors: visible ? errors : {},
        downloads: visible ? downloads : {},
        installed: visible ? installed : [],
        revision,
        signedIn: api !== null,
        refresh,
        download,
        cancel,
        remove,
        removeVersion,
      }}
    >
      {children}
    </HostedContext>
  );
}
