import { useEffect, useState } from "react";
import { openSitePackage } from "../packages/open";
import type { ObservationDraft } from "../storage/draft-store";
import type { LocalDatabase } from "../storage/observation-store";
import {
  activateParkedDraft,
  discardParkedDraft,
  listParkedDrafts,
  parkDraft,
} from "../storage/parked-drafts";
import { validateRecoveredPackage } from "./ownership";

export function useParkedActions(input: {
  readonly database: LocalDatabase;
  readonly key: string;
  readonly ready: boolean;
  readonly current: () => boolean;
  readonly recovered: ObservationDraft | null;
  readonly open: boolean;
  readonly setRecovered: (draft: ObservationDraft | null) => void;
  readonly status: (message: string) => void;
  readonly canAccess: (project: string) => boolean;
}) {
  const [snapshot, setSnapshot] = useState<{
    readonly owner: string;
    readonly drafts: readonly ObservationDraft[];
  }>({ owner: input.key, drafts: [] });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    void revision;
    if (!input.ready) return;
    let active = true;
    void listParkedDrafts(input.database, input.key)
      .then((drafts) => {
        if (active) setSnapshot({ owner: input.key, drafts });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && active)
          input.status("Parked observations could not be read. Their stored data is retained.");
      });
    return () => {
      active = false;
    };
  }, [input.database, input.key, input.ready, revision, input.status]);
  const drafts = snapshot.owner === input.key ? snapshot.drafts : [];
  return {
    drafts,
    async parkRecovered() {
      if (!input.current() || !input.recovered || input.open) return;
      const opened = await openSitePackage(input.recovered.packageId);
      if (
        !input.current() ||
        (opened &&
          (!opened.projectId || input.canAccess(opened.projectId)) &&
          validateRecoveredPackage(input.recovered, opened) === null)
      )
        return;
      await parkDraft(input.database, input.key, input.recovered.id);
      if (input.current()) {
        input.setRecovered(null);
        setRevision((value) => value + 1);
      }
    },
    async restoreParked(id: string) {
      if (!input.current() || input.open || input.recovered) return null;
      const draft = drafts.find((value) => value.id === id);
      if (!draft) return null;
      const opened = await openSitePackage(draft.packageId);
      if (
        !input.current() ||
        !opened ||
        (opened.projectId && !input.canAccess(opened.projectId)) ||
        validateRecoveredPackage(draft, opened) !== null
      )
        return null;
      const restored = await activateParkedDraft(input.database, input.key, id);
      if (input.current()) {
        input.setRecovered(restored);
        setRevision((value) => value + 1);
      }
      return restored;
    },
    async discardParked(id: string) {
      if (!input.current()) return;
      await discardParkedDraft(input.database, input.key, id);
      if (input.current()) setRevision((value) => value + 1);
    },
  };
}
