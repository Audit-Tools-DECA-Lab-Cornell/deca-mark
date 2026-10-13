import { useSQLiteContext } from "expo-sqlite";
import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "../auth/provider";
import { useMe } from "../data/api/me-provider";
import type { Coordinate, Placement, RoundContext } from "../domain/observation";
import type { RoundType } from "../domain/rounds";
import { useProfile } from "../features/auth/profile-store";
import { type SessionState, startSession } from "../forms/session";
import type { SiteZone } from "../maps/sample-site";
import { setActivePackage } from "../packages/hosted/access";
import { useHostedSites } from "../packages/hosted/provider";
import type { SitePackage } from "../packages/site-package";
import type { ObservationDraft } from "../storage/draft-store";
import { useSync } from "../sync/provider";
import { persistDraft, useDraftRecovery } from "./draft-persistence";
import type { ObservationIdentity } from "./ownership";
import { packageActions } from "./package-actions";
import { formForRound } from "./round-forms";

/**
 * One observation period: the package, the zone and round it is stamped with, and the
 * observation currently being answered.
 *
 * Every change writes the draft to SQLite immediately, so a force quit costs nothing and the
 * upload queue never sees a half-answered form.
 */

import { type ChangeBlock, FieldSessionContext, type SessionSave } from "./context";
import { useObservationActions } from "./observation-actions";

export { shortLabel } from "../domain/labels";
export { type OpenOutcome, type SaveOutcome, type SessionSave, useFieldSession } from "./context";

const OPEN_OBSERVATION_BLOCK =
  "An observation is open. Save or discard it first, so its answers keep the round they were collected in.";
const OPEN_INVENTORY_BLOCK =
  "This zone's inventory is open. Save or discard it before choosing another zone.";

export function FieldSessionProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const { key, ready } = useAccount();
  const { wake } = useSync();
  const hosted = useHostedSites();
  const accountNow = useRef({ key, generation: 0 });
  if (accountNow.current.key !== key)
    accountNow.current = { key, generation: accountNow.current.generation + 1 };
  const generation = accountNow.current.generation;
  const current = () =>
    accountNow.current.key === key && accountNow.current.generation === generation;
  useEffect(() => () => setActivePackage(key, null), [key]);
  const [packageOwner, setPackageOwner] = useState(key);
  // A hosted form may ask no observer question; its records then carry the account's initials.
  const profile = useProfile();
  const me = useMe();
  const initials = profile.initials || me.profile?.observer_initials || "";

  const [sitePackage, setSitePackage] = useState<SitePackage | null>(null);
  const [zone, setZone] = useState<SiteZone | null>(null);
  const [roundType, setRoundType] = useState<RoundType>("standard");
  const [freshPeriod, setFreshPeriod] = useState(false);
  const [placed, setPlaced] = useState<Coordinate | null>(null);
  const [placementSource, setPlacementState] = useState<Placement["source"]>("hand");
  // Read by callbacks in the same handler that changes it (beginning an inventory writes its first
  // draft at once), so the value lives in a ref as well as in state.
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
  const form = sitePackage ? formForRound(sitePackage, roundType) : null;

  const holdIdentity = useCallback((next: ObservationIdentity | null) => {
    identity.current = next;
    setInProgress(next);
  }, []);

  const context: RoundContext | null =
    sitePackage && zone
      ? {
          packageId: sitePackage.id,
          packageVersion: sitePackage.version,
          zoneId: zone.id,
          zoneLabel: zone.label,
          roundType,
          freshPeriod,
          inheritedFrom: freshPeriod ? "" : sitePackage.inheritedContext,
        }
      : null;

  const persist = (next: SessionState, coordinate: Coordinate | null) =>
    persistDraft({
      database,
      key,
      ready,
      site: sitePackage,
      context,
      owner: identity.current,
      formVersion: form?.version,
      placement: placementRef.current,
      next,
      coordinate,
      failed: () => {
        if (current())
          setStatus("The draft could not be written to storage. Answers stay on screen.");
      },
    });
  useDraftRecovery({ database, key, ready, setRecovered, setUnreadableDraft, setStatus });

  // Signing out or signing in as someone else must not carry an open observation across the
  // boundary: the in-memory session is closed, and its draft stays under the account that
  // started it, ready to be recovered when that account signs back in.
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current === key) return;
    lastKey.current = key;
    // What this session saved belongs to the account that saved it: the next observer starts with
    // no zone marked as inventoried, even when nothing was open at the switch.
    setSaves([]);
    openedPackage.current = null;
    setSitePackage(null);
    setZone(null);
    setRoundType("standard");
    setFreshPeriod(false);
    setPackageOwner(key);
    const previous = identity.current;
    holdIdentity(null);
    setPlaced(null);
    setPlacementSource("hand");
    setArmed(false);
    stateRef.current = startSession();
    setState(stateRef.current);
    setStatus(
      previous
        ? `Your account changed. The unfinished observation in ${previous.packageName} was closed; its draft is kept for the account that started it.`
        : "Your account changed. This account starts with its own local work.",
    );
  }, [holdIdentity, key, setPlacementSource]);

  const apply = useCallback((next: SessionState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const { openPackage, resumeRecovered, discardRecovered } = packageActions({
    database,
    key,
    identity,
    current,
    recovered,
    sites: hosted.sites,
    installed: hosted.installed,
    zone,
    roundType,
    freshPeriod,
    setRecovered,
    setUnreadableDraft,
    setStatus,
    opened: (opened, savedZone, savedContext, draft) => {
      if (openedPackage.current !== opened.id) setSaves([]);
      openedPackage.current = opened.id;
      setPackageOwner(key);
      setActivePackage(key, opened.packageIdentity ?? null);
      setSitePackage(opened);
      setZone(savedZone);
      setRoundType(savedContext.roundType);
      setFreshPeriod(savedContext.freshPeriod);
      if (draft) {
        setPlaced(draft.coordinates);
        setPlacementSource(draft.placement?.source ?? "hand");
        holdIdentity({
          id: draft.id,
          startedAt: draft.startedAt,
          owner: key,
          packageId: opened.id,
          packageName: opened.name,
          ...(draft.binding ? { binding: draft.binding } : {}),
        });
        apply({ index: draft.questionIndex, answers: draft.answers, notice: null });
      }
    },
  });

  const { place, startZoneRecord, nudgeTo, dispatch, save, discard } = useObservationActions({
    database,
    key,
    packageOwner,
    sitePackage,
    zone,
    context,
    form,
    recovered,
    unreadableDraft,
    placed,
    initials,
    identity,
    stateRef,
    placementRef,
    holdIdentity,
    setPlaced,
    setPlacementSource,
    setArmed,
    setRecovered,
    setStatus,
    setSaves,
    apply,
    persist,
    wake,
    current,
  });

  const open = inProgress !== null;
  const roundBlock: ChangeBlock = open ? OPEN_OBSERVATION_BLOCK : null;
  const zoneBlock: ChangeBlock = open && placementSource === "zone" ? OPEN_INVENTORY_BLOCK : null;

  const chooseZone = (next: SiteZone) => {
    if (!current() || (identity.current !== null && placementSource === "zone")) return;
    setZone(next);
  };
  const chooseRoundType = (next: RoundType) => {
    if (!current() || identity.current !== null) return;
    setRoundType(next);
    setArmed(false);
  };

  return (
    <FieldSessionContext
      value={{
        sitePackage: packageOwner === key ? sitePackage : null,
        form: packageOwner === key ? form : null,
        zone: packageOwner === key ? zone : null,
        roundType: packageOwner === key ? roundType : "standard",
        freshPeriod: packageOwner === key ? freshPeriod : false,
        placed: packageOwner === key ? placed : null,
        placementSource: packageOwner === key ? placementSource : "hand",
        armed: packageOwner === key && armed,
        state: packageOwner === key ? state : startSession(),
        status: packageOwner === key ? status : "Loading this account's local work.",
        recovered: recovered?.owner === key ? recovered : null,
        unreadableDraft: packageOwner === key && unreadableDraft,
        context: packageOwner === key ? context : null,
        inProgress: inProgress?.owner === key ? inProgress : null,
        saves: packageOwner === key ? saves : [],
        roundBlock,
        zoneBlock,
        openPackage,
        chooseZone,
        chooseRoundType,
        toggleFreshPeriod: () => {
          if (current()) setFreshPeriod((value) => !value);
        },
        setArmed: (next) => {
          if (current()) setArmed(next);
        },
        place,
        startZoneRecord,
        nudgeTo,
        dispatch,
        save,
        discard,
        resumeRecovered,
        discardRecovered,
        announce: (message) => {
          if (current()) setStatus(message);
        },
      }}
    >
      {children}
    </FieldSessionContext>
  );
}
