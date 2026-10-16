import { useCallback, useEffect, useRef, useState } from "react";
import {
  assetsAt,
  previewDownloads,
  readyDownload,
  type SiteDownload,
  waitingAssets,
} from "./download-state";
import { PREVIEW_SITES } from "./fixtures";

/** Preview-only progress; real packages are managed by the hosted provider. */
const SIMULATED_DOWNLOAD_MS = 6000;
const PROGRESS_STEP_MS = 250;

export function usePreviewDownloads() {
  const [downloads, setDownloads] = useState<Record<string, SiteDownload>>(previewDownloads);
  const timers = useRef(new Map<string, ReturnType<typeof setInterval>>());

  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const timer of running.values()) clearInterval(timer);
    };
  }, []);

  const stopTimer = useCallback((siteId: string) => {
    const timer = timers.current.get(siteId);
    if (timer) clearInterval(timer);
    timers.current.delete(siteId);
  }, []);

  const start = useCallback(
    (siteId: string) => {
      const site = PREVIEW_SITES.find((entry) => entry.id === siteId);
      if (!site) return;
      stopTimer(siteId);
      const started = Date.now();
      const tick = () => {
        const fraction = Math.min(1, (Date.now() - started) / SIMULATED_DOWNLOAD_MS);
        setDownloads((current) => ({
          ...current,
          [siteId]:
            fraction >= 1
              ? readyDownload(site)
              : {
                  state: "downloading",
                  receivedMb: Math.round(site.sizeMb * fraction),
                  totalMb: site.sizeMb,
                  assets: assetsAt(fraction),
                },
        }));
        if (fraction >= 1) stopTimer(siteId);
      };
      tick();
      timers.current.set(siteId, setInterval(tick, PROGRESS_STEP_MS));
    },
    [stopTimer],
  );

  const cancel = useCallback(
    (siteId: string) => {
      stopTimer(siteId);
      setDownloads((current) => {
        const site = current[siteId];
        if (!site) return current;
        return {
          ...current,
          [siteId]: {
            state: "notDownloaded",
            receivedMb: 0,
            totalMb: site.totalMb,
            assets: waitingAssets(),
          },
        };
      });
    },
    [stopTimer],
  );

  return { downloads, start, cancel, stopTimer };
}
