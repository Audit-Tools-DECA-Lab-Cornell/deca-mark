import type { RoundContext } from "../domain/observation";
import type { FormDefinition } from "../forms/definition";
import { startSession } from "../forms/session";
import { sessionBinding } from "./bound-context";
import type { useSessionMemory } from "./use-session-memory";

/** Hide all runtime data on the first render across an account boundary. */
export function sessionView(
  memory: ReturnType<typeof useSessionMemory>,
  key: string,
  context: RoundContext | null,
  form: FormDefinition | null,
) {
  const visible = memory.packageOwner === key;
  const binding =
    visible && memory.sitePackage && memory.zone
      ? sessionBinding(memory.sitePackage, memory.zone)
      : undefined;
  return {
    pinned: binding
      ? {
          packageId: binding.packageId,
          version: binding.packageVersion,
          siteId: binding.siteId,
          zone: { id: binding.zoneId, code: binding.zoneCode, label: binding.zoneLabel },
        }
      : null,
    sitePackage: visible ? memory.sitePackage : null,
    form: visible ? form : null,
    zone: visible ? memory.zone : null,
    roundType: visible ? memory.roundType : ("standard" as const),
    freshPeriod: visible ? memory.freshPeriod : false,
    placed: visible ? memory.placed : null,
    placementSource: visible ? memory.placementSource : ("hand" as const),
    armed: visible && memory.armed,
    state: visible ? memory.state : startSession(),
    status: visible ? memory.status : "Loading this account's local work.",
    draftWriteFailed: visible && memory.draftWriteFailed,
    recovered: memory.recovered?.owner === key ? memory.recovered : null,
    unreadableDraft: visible && memory.unreadableDraft,
    context: visible ? context : null,
    inProgress: memory.inProgress?.owner === key ? memory.inProgress : null,
    saves: visible ? memory.saves : [],
  };
}
