import { createContext, useContext } from "react";
import type { Coordinate, Placement, RoundContext } from "../domain/observation";
import type { RoundType } from "../domain/rounds";
import type { FormDefinition } from "../forms/definition";
import type { ReviewProblem } from "../forms/engine";
import {
  type SessionAction,
  type SessionState,
  type SessionStep,
  startSession,
} from "../forms/session";
import type { SiteZone } from "../maps/sample-site";
import type { SitePackage } from "../packages/site-package";
import type { Pinned } from "../packages/zone-model-types";
import type { ObservationDraft } from "../storage/draft-store";
import type { ObservationIdentity } from "./ownership";
export type SaveOutcome =
  | { readonly ok: true; readonly heldOnly: boolean }
  | { readonly ok: false; readonly problems: readonly ReviewProblem[]; readonly message?: string };

export type OpenOutcome =
  | { readonly ok: true; readonly sitePackage: SitePackage }
  | { readonly ok: false; readonly reason: string };

/** A record saved in this session, for the "last saved" card and the zones an inventory has covered. */
export type SessionSave = {
  readonly id: string;
  readonly zoneId: string;
  readonly zoneLabel: string;
  readonly roundType: RoundType;
  readonly savedAt: string;
  readonly heldOnly: boolean;
};

/** Why the round or zone cannot change now, or null. */
export type ChangeBlock = string | null;

export type FieldSessionValue = {
  readonly pinned: Pinned | null;
  readonly parked: readonly ObservationDraft[];
  parkRecovered: () => Promise<void>;
  restoreParked: (id: string) => Promise<void>;
  discardParked: (id: string) => Promise<void>;
  beginVisit: () => void;
  endVisit: () => void;
  readonly sitePackage: SitePackage | null;
  readonly form: FormDefinition | null;
  readonly zone: SiteZone | null;
  readonly roundType: RoundType;
  readonly freshPeriod: boolean;
  readonly placed: Coordinate | null;
  /** `hand` for a placed play event, `zone` for a whole-zone inventory stored at the zone's centre. */
  readonly placementSource: Placement["source"];
  readonly armed: boolean;
  readonly state: SessionState;
  readonly status: string;
  readonly recovered: ObservationDraft | null;
  readonly unreadableDraft: boolean;
  readonly context: RoundContext | null;
  /** The observation currently open, if any — an unfinished one blocks opening another study. */
  readonly inProgress: ObservationIdentity | null;
  /** Records saved since the package was opened, newest first. */
  readonly saves: readonly SessionSave[];
  /** Why the round type cannot change right now (an observation is open), or null. */
  readonly roundBlock: ChangeBlock;
  /** Why the zone cannot change right now (a zone inventory is open), or null. */
  readonly zoneBlock: ChangeBlock;
  openPackage: (id: string) => Promise<OpenOutcome>;
  chooseZone: (zone: SiteZone) => void;
  chooseRoundType: (roundType: RoundType) => void;
  toggleFreshPeriod: () => void;
  setArmed: (armed: boolean) => void;
  place: (coordinate: Coordinate) => void;
  /** Opens the current zone's inventory: a whole-zone record, stored at the zone's centre. */
  startZoneRecord: () => void;
  nudgeTo: (coordinate: Coordinate) => void;
  dispatch: (action: SessionAction) => SessionStep;
  save: () => Promise<SaveOutcome>;
  discard: () => void;
  resumeRecovered: () => Promise<SitePackage | undefined>;
  discardRecovered: () => Promise<void>;
  announce: (message: string) => void;
};

const missing: FieldSessionValue = {
  pinned: null,
  parked: [],
  parkRecovered: async () => {},
  restoreParked: async () => {},
  discardParked: async () => {},
  beginVisit: () => {},
  endVisit: () => {},
  sitePackage: null,
  form: null,
  zone: null,
  roundType: "standard",
  freshPeriod: false,
  placed: null,
  placementSource: "hand",
  armed: false,
  state: startSession(),
  status: "",
  recovered: null,
  unreadableDraft: false,
  context: null,
  inProgress: null,
  saves: [],
  roundBlock: null,
  zoneBlock: null,
  openPackage: async () => ({ ok: false, reason: "No workspace is open." }),
  chooseZone: () => {},
  chooseRoundType: () => {},
  toggleFreshPeriod: () => {},
  setArmed: () => {},
  place: () => {},
  startZoneRecord: () => {},
  nudgeTo: () => {},
  dispatch: () => ({ state: startSession(), destination: "stay", autoAdvance: false }),
  save: async () => ({ ok: false, problems: [] }),
  discard: () => {},
  resumeRecovered: async () => undefined,
  discardRecovered: async () => {},
  announce: () => {},
};

export const FieldSessionContext = createContext(missing);

/** The form a round collects on a package: the play-event form, or the zone inventory. */

export function useFieldSession() {
  return useContext(FieldSessionContext);
}
