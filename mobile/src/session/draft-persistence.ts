import { useEffect, useRef } from "react";
import type { Coordinate, Placement, RoundContext } from "../domain/observation";
import type { SessionState } from "../forms/session";
import type { SitePackage } from "../packages/site-package";
import {
  DraftReadError,
  hasDraft,
  type ObservationDraft,
  observationDraftSchema,
  readDraft,
  saveDraft,
} from "../storage/draft-store";
import type { LocalDatabase } from "../storage/observation-store";
import { type ObservationIdentity, ownershipProblem } from "./ownership";

export function useDraftRecovery(input: {
  readonly database: LocalDatabase;
  readonly key: string;
  readonly ready: boolean;
  readonly setUnreadableDraft: (value: boolean) => void;
  readonly setRecovered: (draft: ObservationDraft | null) => void;
  readonly setStatus: (message: string) => void;
}) {
  const callbacks = useRef(input);
  callbacks.current = input;
  useEffect(() => {
    if (!input.ready) return;
    let active = true;
    callbacks.current.setRecovered(null);
    callbacks.current.setUnreadableDraft(false);
    void readDraft(input.database, input.key)
      .then(async (draft) => {
        if (!active) return;
        if (draft) callbacks.current.setRecovered(draft);
        else if (await hasDraft(input.database, input.key)) {
          if (!active) return;
          callbacks.current.setUnreadableDraft(true);
          callbacks.current.setStatus(
            "An unfinished observation cannot be read by this build. Its stored data is retained; recover or explicitly discard it before starting another.",
          );
        }
      })
      .catch((error: unknown) => {
        if (active && error instanceof Error) {
          if (error instanceof DraftReadError) callbacks.current.setUnreadableDraft(true);
          callbacks.current.setStatus(
            error instanceof DraftReadError
              ? error.message
              : "Saved drafts could not be read on this device.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [input.database, input.key, input.ready]);
}
/**
 * Writes the open observation's draft and says whether it was kept (MOB-41): `true` once the write
 * landed, `false` when it could not be built or stored, and `null` when there is nothing to write.
 * The draft stays on screen either way; the caller shows the observer which of the two it is.
 */
export function persistDraft(input: {
  readonly database: LocalDatabase;
  readonly key: string;
  readonly ready: boolean;
  readonly site: SitePackage | null;
  readonly context: RoundContext | null;
  readonly owner: ObservationIdentity | null;
  readonly formVersion: string | undefined;
  readonly placement: Placement["source"];
  readonly next: SessionState;
  readonly coordinate: Coordinate | null;
}): Promise<boolean> | null {
  const { site, context, owner, next, coordinate } = input;
  if (
    !input.ready ||
    !site ||
    !context ||
    !owner ||
    ownershipProblem(owner, input.key, site.id) !== null
  )
    return null;
  const draft = observationDraftSchema.safeParse({
    schemaVersion: 2,
    ...(owner.capture ? { capture: owner.capture } : {}),
    id: owner.id,
    owner: owner.owner,
    formVersion: input.formVersion ?? site.formVersion,
    packageId: site.id,
    siteId: site.siteId,
    context,
    ...(owner.binding ? { binding: owner.binding } : {}),
    coordinates: coordinate,
    placement: coordinate ? { source: input.placement, gpsAccuracyMetres: null } : null,
    answers: next.answers,
    questionIndex: next.index,
    startedAt: owner.startedAt,
    updatedAt: new Date().toISOString(),
  });
  if (!draft.success) return Promise.resolve(false);
  return saveDraft(input.database, input.key, draft.data).then(
    () => true,
    (error: unknown) => {
      if (error instanceof Error) return false;
      throw error;
    },
  );
}
