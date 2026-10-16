import Storage from "expo-sqlite/kv-store";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { useMe } from "../../data/api/me-provider";
import { isStored, useHostedSites } from "../../packages/hosted/provider";
import { type DataMode, MODE_KEY, readDataMode } from "./data-mode";
import { deviceProjects } from "./device-projects";
import { deviceSite, notDownloaded, type SiteDownload } from "./download-state";
import {
  PREVIEW_PROJECTS,
  PREVIEW_SITES,
  type PreviewProject,
  type PreviewSite,
  type QueueRecord,
} from "./fixtures";
import { hostedDownload, hostedPreviewSite } from "./hosted-sites";
import { type Queue, useQueueForMode } from "./queue";
import { usePreviewDownloads } from "./use-preview-downloads";

/**
 * Where the collector's screens read from. `device` uses the account and this phone: projects and the
 * profile from `/v1/me` (D24), join codes through the DECA Mark API, and the SQLite queue, sync and
 * bundled packages; it says plainly when something needs the server. `preview` shows the designed
 * fixtures, including the states the device cannot produce yet ("Uploading", a download in progress),
 * and sends nothing. Preview is a review tool: release builds always read the device.
 */
export type { DataMode } from "./data-mode";
export type { AssetState, DownloadState, SiteDownload } from "./download-state";
export type { Queue, QueueCounts } from "./queue";
/** Development builds, and builds made for review with EXPO_PUBLIC_PREVIEW_TOOLS=1, may show preview data. */
export const PREVIEW_ALLOWED = __DEV__ || process.env.EXPO_PUBLIC_PREVIEW_TOOLS === "1";

function readMode(): DataMode {
  return readDataMode(PREVIEW_ALLOWED, () => Storage.getItemSync(MODE_KEY));
}

type DataSourceValue = {
  mode: DataMode;
  setMode: (mode: DataMode) => void;
  previewAllowed: boolean;
  downloads: Record<string, SiteDownload>;
  /**
   * Whether this mode can fetch a package: preview simulates one; on the device a project's hosted
   * site downloads from the DECA Mark API while signed in, and a bundled site is always on the device.
   */
  canDownload: boolean;
  startDownload: (siteId: string) => void;
  cancelDownload: (siteId: string) => void;
  removeDownload: (siteId: string) => void;
};

const DataSourceContext = createContext<DataSourceValue | null>(null);

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const hosted = useHostedSites();
  const [mode, setModeState] = useState<DataMode>(readMode);
  const {
    downloads: simulated,
    start: startPreview,
    cancel: cancelPreview,
    stopTimer,
  } = usePreviewDownloads();

  const setMode = useCallback((next: DataMode) => {
    if (!PREVIEW_ALLOWED) return;
    try {
      Storage.setItemSync(MODE_KEY, next);
    } catch {
      // The choice still applies until the app closes.
    }
    setModeState(next);
  }, []);

  const preview = mode === "preview";
  const canDownload = preview || hosted.signedIn;
  const downloads = useMemo<Record<string, SiteDownload>>(() => {
    if (preview) return simulated;
    // `revision` changes whenever a package is saved or removed, so what is stored is read again.
    void hosted.revision;
    return Object.fromEntries([
      ...PREVIEW_SITES.map((site) => [site.id, deviceSite(site).download]),
      ...Object.values(hosted.sites)
        .flat()
        .map((site) => [
          site.site_id,
          hostedDownload(site, isStored(site), hosted.downloads[site.site_id]),
        ]),
    ]);
  }, [preview, simulated, hosted.sites, hosted.downloads, hosted.revision]);

  /** The project a hosted site belongs to, or undefined for a bundled one. */
  const hostedProject = useCallback(
    (siteId: string) =>
      Object.entries(hosted.sites).find(([, sites]) =>
        sites.some((site) => site.site_id === siteId),
      )?.[0],
    [hosted.sites],
  );

  const startDownload = useCallback(
    (siteId: string) => {
      if (!preview) {
        const projectId = hostedProject(siteId);
        if (projectId) void hosted.download(projectId, siteId);
        return;
      }
      startPreview(siteId);
    },
    [hosted, hostedProject, preview, startPreview],
  );

  const cancelDownload = useCallback(
    (siteId: string) => {
      stopTimer(siteId);
      if (!preview) {
        hosted.cancel(siteId);
        return;
      }
      cancelPreview(siteId);
    },
    [cancelPreview, hosted, preview, stopTimer],
  );

  const removeDownload = useCallback(
    (siteId: string) => {
      if (preview) cancelDownload(siteId);
      else hosted.remove(siteId);
    },
    [cancelDownload, hosted, preview],
  );

  const value = useMemo<DataSourceValue>(
    () => ({
      mode,
      setMode,
      previewAllowed: PREVIEW_ALLOWED,
      downloads,
      canDownload,
      startDownload,
      cancelDownload,
      removeDownload,
    }),
    [mode, setMode, downloads, canDownload, startDownload, cancelDownload, removeDownload],
  );

  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>;
}

export function useDataSource(): DataSourceValue {
  const value = useContext(DataSourceContext);
  if (!value) throw new Error("useDataSource needs a DataSourceProvider above it");
  return value;
}

/**
 * The projects the observer has joined. Device data reads them from `/v1/me` (memberships, cached for
 * offline starts); preview shows the designed Play Study and Training.
 */
export function useProjects(): PreviewProject[] {
  const { mode } = useDataSource();
  const { projects, organizations } = useMe();
  const { sites } = useHostedSites();
  return useMemo(
    () =>
      mode === "preview"
        ? PREVIEW_PROJECTS
        : deviceProjects(projects, organizations, (projectId) =>
            (sites[projectId] ?? []).map((site) => site.site_id),
          ),
    [mode, projects, organizations, sites],
  );
}

export function useProject(projectId: string): PreviewProject | undefined {
  return useProjects().find((project) => project.id === projectId);
}

/**
 * The project collection is for now: on device data the active project `/v1/me` keeps (the first
 * joined project that is not Training, otherwise Training); in preview, Play Study.
 */
export function useActiveProject(): PreviewProject | undefined {
  const { mode } = useDataSource();
  const { activeProjectId } = useMe();
  const projects = useProjects();
  const id =
    mode === "preview" ? projects.find((project) => !project.training)?.id : activeProjectId;
  return projects.find((project) => project.id === id) ?? projects[0];
}

type SiteWithDownload = PreviewSite & { download: SiteDownload };

function withDownload(
  site: PreviewSite,
  mode: DataMode,
  downloads: Record<string, SiteDownload>,
): SiteWithDownload {
  if (mode === "device") return deviceSite(site);
  return { ...site, download: downloads[site.id] ?? notDownloaded(site) };
}

/** The hosted sites this account has read, with the download state this device knows. */
function useHostedSiteList(): SiteWithDownload[] {
  const { mode, downloads } = useDataSource();
  const { sites } = useHostedSites();
  return useMemo(
    () =>
      mode === "preview"
        ? []
        : Object.entries(sites).flatMap(([projectId, list]) =>
            list.map((site) => {
              const shown = hostedPreviewSite(projectId, site);
              return { ...shown, download: downloads[site.site_id] ?? notDownloaded(shown) };
            }),
          ),
    [mode, sites, downloads],
  );
}

/**
 * A project's sites: on device data, Training's practice sites ship with the app and every other
 * project's come from the DECA Mark API (MOB-14); preview shows the designed fixtures.
 */
export function useSites(projectId: string): SiteWithDownload[] {
  const { mode, downloads } = useDataSource();
  const siteIds = useProject(projectId)?.siteIds ?? [];
  const hostedSites = useHostedSiteList();
  return [
    ...PREVIEW_SITES.filter((site) => siteIds.includes(site.id)).map((site) =>
      withDownload(site, mode, downloads),
    ),
    ...hostedSites.filter((site) => site.projectId === projectId),
  ];
}

export function useSite(siteId: string): SiteWithDownload | undefined {
  const { mode, downloads } = useDataSource();
  const hostedSites = useHostedSiteList();
  const site = PREVIEW_SITES.find((entry) => entry.id === siteId);
  return site
    ? withDownload(site, mode, downloads)
    : hostedSites.find((entry) => entry.id === siteId);
}

/** The upload queue in the five Contour states, newest first. */
export function useQueue(): Queue {
  const { mode } = useDataSource();
  return useQueueForMode(mode);
}

export function useQueueRecord(id: string): QueueRecord | undefined {
  const { records } = useQueue();
  return records.find((record) => record.id === id);
}
