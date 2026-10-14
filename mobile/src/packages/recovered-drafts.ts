import { useEffect, useState } from "react";
import { useAccount } from "../auth/provider";
import { useFieldSession } from "../session/context";
import { recoveredDraftModel } from "./draft-recovery";
import { useHostedSites } from "./hosted/context";
import { openSitePackage } from "./open";
import { recoveryAvailability } from "./recovery-availability";
import type { Recovered } from "./zone-model-types";

export function useRecoveredDraft() {
  const { key } = useAccount();
  const session = useFieldSession();
  const hosted = useHostedSites();
  const [loaded, setLoaded] = useState<{
    readonly owner: string;
    readonly active: Recovered | null;
    readonly parked: readonly Recovered[];
    readonly problem: string | null;
  }>({ owner: key, active: null, parked: [], problem: null });
  useEffect(() => {
    let current = true;
    const drafts = [...(session.recovered ? [session.recovered] : []), ...session.parked];
    void Promise.all(
      drafts.map(async (draft) => {
        const installed = hosted.installed.find(
          (entry) => entry.identity.packageId === draft.packageId,
        );
        return recoveredDraftModel(draft, {
          package: await openSitePackage(draft.packageId),
          ...recoveryAvailability(hosted, draft),
          bytes: installed?.bytes ?? null,
          parked: draft.id !== session.recovered?.id,
        });
      }),
    )
      .then((models) => {
        if (current)
          setLoaded({
            owner: key,
            active: models.find((model) => model && !model.parked) ?? null,
            parked: models.filter((model): model is Recovered => model?.parked === true),
            problem: null,
          });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && current)
          setLoaded({
            owner: key,
            active: null,
            parked: [],
            problem: "The exact retained draft context could not be read.",
          });
      });
    return () => {
      current = false;
    };
  }, [key, session.recovered, session.parked, hosted]);
  const visible = loaded.owner === key;
  return {
    active: visible ? loaded.active : null,
    parked: visible ? loaded.parked : [],
    problem: visible ? loaded.problem : null,
    unreadable: session.unreadableDraft,
    resume: session.resumeRecovered,
    park: session.parkRecovered,
    restoreParked: session.restoreParked,
    discard: session.discardRecovered,
    discardParked: session.discardParked,
    async redownload(draftId: string) {
      const model = visible
        ? [loaded.active, ...loaded.parked].find((value) => value?.draftId === draftId)
        : null;
      const draft = [session.recovered, ...session.parked].find((value) => value?.id === draftId);
      if (!model?.redownload.possible || !draft?.binding) return;
      await hosted.download(draft.binding.projectId, draft.siteId, draft.packageId);
    },
  };
}
