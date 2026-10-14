import { useCallback, useEffect, useRef, useState } from "react";
import type { Coordinate, Placement } from "../domain/observation";
import type { RoundType } from "../domain/rounds";
import { type SessionState, startSession } from "../forms/session";
import type { SiteZone } from "../maps/sample-site";
import type { SitePackage } from "../packages/site-package";
import type { ObservationDraft } from "../storage/draft-store";
import type { SessionSave } from "./context";
import type { ObservationIdentity } from "./ownership";

/** Account-scoped runtime state; durable work belongs to the draft/record stores. */
export function useSessionMemory(key: string) {
  const [packageOwner, setPackageOwner] = useState(key);
  const [sitePackage, setSitePackage] = useState<SitePackage | null>(null);
  const [zone, setZone] = useState<SiteZone | null>(null);
  const zoneRef = useRef(zone);
  const [roundType, setRoundType] = useState<RoundType>("standard");
  const [freshPeriod, setFreshPeriod] = useState(false);
  const [placed, setPlaced] = useState<Coordinate | null>(null);
  const [placementSource, setPlacementState] = useState<Placement["source"]>("hand");
  const placementRef = useRef<Placement["source"]>("hand");
  const setPlacementSource = useCallback((source: Placement["source"]) => {
    placementRef.current = source;
    setPlacementState(source);
  }, []);
  const [saves, setSaves] = useState<readonly SessionSave[]>([]);
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<SessionState>(startSession());
  const [status, setStatus] = useState("Offline-first collector ready.");
  const [unreadableDraft, setUnreadableDraft] = useState(false);
  const [recovered, setRecovered] = useState<ObservationDraft | null>(null);
  const [inProgress, setInProgress] = useState<ObservationIdentity | null>(null);
  const stateRef = useRef(state);
  const identity = useRef<ObservationIdentity | null>(null);
  const openedPackage = useRef<string | null>(null);
  const holdIdentity = useCallback((next: ObservationIdentity | null) => {
    identity.current = next;
    setInProgress(next);
  }, []);
  const apply = useCallback((next: SessionState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const selectZone = (next: SiteZone | null) => {
    zoneRef.current = next;
    setZone(next);
  };
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    setSaves([]);
    openedPackage.current = null;
    setSitePackage(null);
    zoneRef.current = null;
    setZone(null);
    setRoundType("standard");
    setFreshPeriod(false);
    setPackageOwner(key);
    holdIdentity(null);
    setPlaced(null);
    setPlacementSource("hand");
    setArmed(false);
    apply(startSession());
    setStatus("Your account changed. This account starts with its own local work.");
  }, [apply, holdIdentity, key, setPlacementSource]);
  return {
    packageOwner,
    setPackageOwner,
    sitePackage,
    setSitePackage,
    zone,
    zoneRef,
    setZone: selectZone,
    roundType,
    setRoundType,
    freshPeriod,
    setFreshPeriod,
    placed,
    setPlaced,
    placementSource,
    placementRef,
    setPlacementSource,
    saves,
    setSaves,
    armed,
    setArmed,
    state,
    stateRef,
    apply,
    status,
    setStatus,
    unreadableDraft,
    setUnreadableDraft,
    recovered,
    setRecovered,
    inProgress,
    identity,
    holdIdentity,
    openedPackage,
  };
}
