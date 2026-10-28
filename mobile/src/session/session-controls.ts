import type { RefObject } from "react";
import type { Coordinate } from "../domain/observation";
import type { RoundType } from "../domain/rounds";
import type { SessionState } from "../forms/session";
import type { SiteZone } from "../maps/sample-site";
import { setActivePackage } from "../packages/hosted/access";
import { sessionBinding } from "./bound-context";
import type { OpenOutcome } from "./context";
import type { useSessionMemory } from "./use-session-memory";

export function sessionControls(input: {
  readonly memory: ReturnType<typeof useSessionMemory>;
  readonly key: string;
  readonly current: () => boolean;
  readonly visit: RefObject<string | null>;
  readonly persist: (state: SessionState, coordinate: Coordinate | null) => void;
  readonly openPackage: (id: string) => Promise<OpenOutcome>;
}) {
  const { memory: m, key, current, visit } = input;
  return {
    chooseZone(next: SiteZone) {
      // While a save commits nothing may change the observation: the zone and its binding would move in
      // memory while the write that records them is dropped, and a failed save would leave them apart (MOB-41).
      if (
        !current() ||
        m.committing.current ||
        (m.identity.current !== null && m.placementSource === "zone")
      )
        return;
      const selected = m.sitePackage?.zones.find((entry) => entry.id === next.id);
      if (!selected || !m.sitePackage) return;
      const owner = m.identity.current;
      if (owner) {
        const binding = sessionBinding(m.sitePackage, selected);
        m.holdIdentity({ ...owner, ...(binding ? { binding } : {}) });
      }
      m.setZone(selected);
      input.persist(m.stateRef.current, m.placed);
    },
    chooseRoundType(next: RoundType) {
      if (!current() || m.identity.current !== null) return;
      m.setRoundType(next);
      m.setArmed(false);
    },
    beginVisit() {
      if (current() && m.sitePackage) {
        visit.current = m.sitePackage.id;
        setActivePackage(key, m.sitePackage.packageIdentity ?? null);
      }
    },
    endVisit() {
      if (current()) {
        visit.current = null;
        setActivePackage(key, null);
      }
    },
    openPackage(id: string): Promise<OpenOutcome> {
      if (!current())
        return Promise.resolve({ ok: false, reason: "The account changed while opening the map." });
      if (visit.current !== null)
        return Promise.resolve(
          m.sitePackage && visit.current === id
            ? { ok: true, sitePackage: m.sitePackage }
            : {
                ok: false,
                reason: "Leave the current collection visit before opening another map.",
              },
        );
      return input.openPackage(id);
    },
    toggleFreshPeriod() {
      if (current() && m.identity.current === null) m.setFreshPeriod((value) => !value);
    },
    setArmed(next: boolean) {
      if (current()) m.setArmed(next);
    },
    announce(message: string) {
      if (current()) m.setStatus(message);
    },
  };
}
