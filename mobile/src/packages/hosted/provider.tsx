import { randomUUID } from "expo-crypto";
import { useSQLiteContext } from "expo-sqlite";
import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "../../auth/provider";
import { type ApiClient, createApiClient } from "../../data/api/client";
import { ApiError } from "../../data/api/errors";
import { useMe } from "../../data/api/me-provider";
import type { PackageIdentity } from "../../domain/package-binding";
import { connection } from "../../platform/config";
import { setPackageAccessOwner } from "./access";
import { HostedContext, type HostedDownload } from "./context";
import { apiPackageSource, devicePackageFiles, deviceSha256 } from "./device";
import { downloadFailure } from "./download-failure";
import { reconcileStaging } from "./installation";
import { type InstalledVersion, PackageOperations } from "./operations";
import { PrepareError } from "./prepare";
import { useSiteDiscovery } from "./use-site-discovery";

export { type HostedDownload, isStored, useHostedSites } from "./context";

function message(error: unknown): string {
  return error instanceof PrepareError || error instanceof ApiError || error instanceof Error
    ? error.message
    : "The download stopped. Check the connection and try again.";
}

export function HostedSitesProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const { client, session, account, key, scope } = useAccount();
  const me = useMe();
  const { projects } = me;
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
  const [downloads, setDownloads] = useState<Record<string, HostedDownload>>({});
  const [installed, setInstalled] = useState<readonly InstalledVersion[]>([]);
  const [revision, setRevision] = useState(0);
  const downloadAttempts = useRef(new Map<string, number>());
  const downloadSequence = useRef(0);
  // Keyed on whether there is a session, never on the session object: a token refresh replaces that
  // object about hourly, and `api`, `operations` and the running download must outlive it. The getter
  // reads the current session for every request, so the new access token is used without a rebuild.
  const signedIn = session !== null;
  const api = useMemo<ApiClient | null>(
    () =>
      client && signedIn && userId
        ? createApiClient(connection.apiUrl, async () => {
            const { data } = await client.auth.getSession();
            return data.session?.user.id === userId ? data.session.access_token : null;
          })
        : null,
    [client, signedIn, userId],
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
  const discovery = useSiteDiscovery({
    owner,
    issuer,
    userId,
    projects: projectIds,
    operations,
    online: api !== null,
  });
  const { sites, errors, refresh, setErrors } = discovery;
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
    setDownloads({});
    setInstalled([]);
    reconcileStaging(devicePackageFiles);
    void reload().catch((error: unknown) => {
      if (operations?.runtime.current()) setErrors({ storage: message(error) });
    });
    return () => operations?.dispose();
  }, [operations, owner, reload, setErrors]);
  const download = useCallback(
    async (project: string, siteId: string, packageId?: string) => {
      const site = sites[project]?.find((entry) => entry.site_id === siteId);
      const requested = packageId ?? site?.package?.package_id;
      if (!operations || !site || !requested) return;
      const attempt = ++downloadSequence.current;
      downloadAttempts.current.set(siteId, attempt);
      const latest = () =>
        operations.runtime.current() && downloadAttempts.current.get(siteId) === attempt;
      let lastPart: 0 | 1 | 2 | 3 = 0;
      try {
        const saved = await operations.download(
          project,
          site,
          (part) => {
            if (!latest()) return;
            lastPart = part;
            setDownloads((current) => ({
              ...current,
              [siteId]: { state: "downloading", part, packageId: requested },
            }));
          },
          packageId,
        );
        if (!operations.runtime.current()) return;
        if (latest()) setDownloads(({ [siteId]: _done, ...rest }) => rest);
        if (saved) await reload();
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        if (latest() && !operations.running.get(siteId)?.signal.aborted)
          setDownloads((current) => ({
            ...current,
            [siteId]: {
              ...downloadFailure(error),
              part: lastPart,
              packageId: requested,
            },
          }));
      }
    },
    [operations, reload, sites],
  );
  const cancel = useCallback(
    (site: string) => {
      operations?.cancel(site);
      downloadAttempts.current.delete(site);
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
    [installed, operations, removeVersion, setErrors],
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
        checked: discovery.checked,
        problems: {
          ...discovery.problems,
          ...(me.profile
            ? Object.fromEntries(
                installed
                  .filter((entry) => !projectIds.includes(entry.identity.projectId))
                  .map((entry) => [entry.identity.projectId, "no_access" as const]),
              )
            : {}),
        },
        allowedProjects: me.profile ? projectIds : null,
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
