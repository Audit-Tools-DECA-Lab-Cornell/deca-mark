import type { RoundType } from "../../domain/rounds";

/**
 * The collector's preview world: what an observer sees before the server is wired (MOB-04, MOB-14). It
 * matches the web fixtures (web/src/fixtures): the same people, project, sites and record IDs, so a review
 * of both apps tells one story. Nothing here is uploaded or read from a server.
 */

export type ReadinessKey = "readyOffline" | "alwaysAvailable" | "notDownloaded" | "downloading";

export type PreviewProject = {
  id: string;
  name: string;
  org: string;
  summary: string;
  siteIds: string[];
  training: boolean;
};

export type PreviewSite = {
  id: string;
  projectId: string;
  name: string;
  zones: string[];
  /** The bundled package this site opens in the collector (src/packages/bundled.ts). */
  packageId: string;
  packageVersion: string;
  sizeMb: number;
  initialDownload: "ready" | "notDownloaded";
  verifiedLabel: string;
  bundled: boolean;
};

export type QueueState = "onDevice" | "uploading" | "uploaded" | "attention" | "held";

export type QueueRecord = {
  id: string;
  label: string;
  zone: string;
  roundType: RoundType;
  time: string;
  state: QueueState;
  /** A practice record: no project binding, stays on this device, never uploads (MOB-37). */
  practice?: boolean | undefined;
  summary: string;
  /** What the server said, for a record that needs attention. */
  problem?: string | undefined;
  answers?: { label: string; value: string }[] | undefined;
  storage?: string | undefined;
  observer?: string | undefined;
  captured?: string | undefined;
  form?: string | undefined;
  map?: string | undefined;
};

export const PREVIEW_ACCOUNT = {
  name: "Pratyush Sudhakar",
  initials: "PS",
  email: "ps2245@cornell.edu",
} as const;

export const PREVIEW_PROJECTS: PreviewProject[] = [
  {
    id: "play-study",
    name: "Play Study",
    org: "DECA Lab",
    summary: "DECA Lab · 2 sites · observer access",
    siteIds: ["riverside", "fall-creek"],
    training: false,
  },
  {
    id: "training",
    name: "Training",
    org: "DECA Lab",
    summary: "Practice every step · never in research exports",
    siteIds: ["practice-garden"],
    training: true,
  },
];

export const PREVIEW_SITES: PreviewSite[] = [
  {
    id: "riverside",
    projectId: "play-study",
    name: "Riverside",
    zones: ["North meadow", "Woodland edge", "Sand area"],
    packageId: "riverside-play-study",
    packageVersion: "v3",
    sizeMb: 84,
    initialDownload: "ready",
    verifiedLabel: "verified today 11:25",
    bundled: false,
  },
  {
    id: "fall-creek",
    projectId: "play-study",
    name: "Fall Creek",
    zones: ["Whole playground"],
    packageId: "fall-creek-playground",
    packageVersion: "v1",
    sizeMb: 126,
    initialDownload: "notDownloaded",
    verifiedLabel: "",
    bundled: false,
  },
  {
    id: "practice-garden",
    projectId: "training",
    name: "Practice garden",
    zones: ["Beds", "Lawn"],
    packageId: "sample-garden",
    packageVersion: "bundled",
    sizeMb: 0,
    initialDownload: "ready",
    verifiedLabel: "ships with the app",
    bundled: true,
  },
];

/** The four things a site needs on the device before collection can start (Handoff). */
export const PACKAGE_ASSETS = [
  "Site map and geometry",
  "Zone boundaries",
  "Assigned form definition",
  "Offline field guide",
] as const;

const OBS_0248_ANSWERS = [
  { label: "How old is the target child?", value: "6–8 yrs" },
  { label: "Primary play type", value: "Physical" },
  {
    label: "Describe the play event",
    value: "Two children build a route between the meadow and the play structure.",
  },
];

export const PREVIEW_QUEUE: QueueRecord[] = [
  {
    id: "obs-0249",
    label: "OBS-0249",
    zone: "North meadow",
    roundType: "standard",
    time: "11:34",
    state: "onDevice",
    summary: "Physical · Gross motor · 6–8 yrs",
  },
  {
    id: "obs-0248",
    label: "OBS-0248",
    zone: "North meadow",
    roundType: "standard",
    time: "11:32",
    state: "attention",
    summary: "Physical play",
    problem:
      "The observer code is missing from this record. Add it, then send it again. The record keeps the same number.",
    answers: OBS_0248_ANSWERS,
    storage: "On this device",
    observer: "",
    captured: "Oct 02 · 11:32",
    form: "demo-v1",
    map: "v3",
  },
  {
    id: "obs-0247",
    label: "OBS-0247",
    zone: "North meadow",
    roundType: "standard",
    time: "11:31",
    state: "held",
    summary: "Exploratory · Sensory",
  },
  {
    id: "obs-0246",
    label: "OBS-0246",
    zone: "North meadow",
    roundType: "standard",
    time: "11:30",
    state: "onDevice",
    summary: "Imaginative · Symbolic",
  },
  {
    id: "obs-0245",
    label: "OBS-0245",
    zone: "North meadow",
    roundType: "standard",
    time: "11:29",
    state: "uploading",
    summary: "Physical · Gross motor",
  },
  {
    id: "obs-0242",
    label: "OBS-0242",
    zone: "North meadow",
    roundType: "standard",
    time: "10:52",
    state: "uploaded",
    summary: "Imaginative · Socio-dramatic",
  },
  {
    id: "obs-0240",
    label: "OBS-0240",
    zone: "North meadow",
    roundType: "standard",
    time: "10:41",
    state: "uploaded",
    summary: "Physical · Gross motor",
  },
  {
    id: "obs-0236",
    label: "OBS-0236",
    zone: "North meadow",
    roundType: "standard",
    time: "09:31",
    state: "uploaded",
    summary: "Physical · Gross motor",
  },
  {
    id: "obs-0234",
    label: "OBS-0234",
    zone: "North meadow",
    roundType: "standard",
    time: "09:12",
    state: "uploaded",
    summary: "Restorative · Onlooking",
  },
];

/** Two weeks from when the app opened, at 17:00 local time, so the preview code never reads as expired. */
function previewExpiry(): string {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  date.setHours(17, 0, 0, 0);
  return date.toISOString();
}

/**
 * What a join code resolves to before the observer accepts (MOB-06): the fields
 * `POST /v1/invitations/preview` returns, plus who invited and the sites, which only the preview shows.
 */
export const PREVIEW_INVITATION = {
  code: "DECA2026",
  organization: "DECA Lab, Cornell University",
  project: "Play Study",
  role: "observer",
  expiresAt: previewExpiry(),
  invitedBy: "Janet Loebach",
  sites: "Riverside, Fall Creek",
} as const;
