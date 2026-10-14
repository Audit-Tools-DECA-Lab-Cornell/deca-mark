import type { Recovered, SiteVersions } from "./zone-model-types";

/** Mutable in-memory test adapter. UI tests inject these getters at their hook boundary. */
export function createZoneReadModelFake(initial: {
  readonly owner: string;
  readonly sites?: Readonly<Record<string, SiteVersions>>;
  readonly active?: Recovered | null;
  readonly parked?: readonly Recovered[];
}) {
  let owner = initial.owner;
  let sites = { ...initial.sites };
  let active = initial.active ?? null;
  let parked = [...(initial.parked ?? [])];
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setOwner(next: string) {
      if (next === owner) return;
      owner = next;
      sites = {};
      active = null;
      parked = [];
      emit();
    },
    setSite(siteId: string, model: SiteVersions) {
      sites[siteId] = model;
      emit();
    },
    getSiteVersions(siteId: string) {
      return sites[siteId] ?? null;
    },
    getRecoveredDraft() {
      return { active, parked };
    },
    setRecovered(next: Recovered | null) {
      active = next;
      emit();
    },
    park() {
      if (!active || active.status === "ready") return false;
      parked.push({ ...active, parked: true });
      active = null;
      emit();
      return true;
    },
    restoreParked(id: string) {
      if (active) return false;
      const draft = parked.find((value) => value.draftId === id);
      if (!draft || draft.status !== "ready") return false;
      parked = parked.filter((value) => value.draftId !== id);
      active = { ...draft, parked: false };
      emit();
      return true;
    },
    remove(siteId: string, packageId: string) {
      const model = sites[siteId];
      const entry = model?.installed.find((value) => value.packageId === packageId);
      if (!model || !entry) return false;
      const refs = entry.references;
      if (
        active?.pinned.packageId === packageId ||
        parked.some((draft) => draft.pinned.packageId === packageId)
      )
        return false;
      if (refs.openSession || refs.unfinished + refs.unsent + refs.attention + refs.retained > 0)
        return false;
      const installed = model.installed.filter((value) => value.packageId !== packageId);
      sites[siteId] = {
        ...model,
        installed,
        nextSessionPackageId:
          installed
            .filter((value) => value.status === "verified")
            .sort((a, b) => b.version - a.version)[0]?.packageId ?? null,
      };
      emit();
      return true;
    },
  };
}
