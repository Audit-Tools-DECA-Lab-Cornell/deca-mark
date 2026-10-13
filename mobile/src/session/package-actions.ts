import type { RefObject } from "react";
import type { RoundContext } from "../domain/observation";
import type { RoundType } from "../domain/rounds";
import type { SiteZone } from "../maps/sample-site";
import type { InstalledVersion } from "../packages/hosted/operations";
import type { HostedSite } from "../packages/hosted/schemas";
import { openSitePackage } from "../packages/open";
import type { SitePackage } from "../packages/site-package";
import { clearDraft, hasDraft, type ObservationDraft, readDraft } from "../storage/draft-store";
import type { LocalDatabase } from "../storage/observation-store";
import type { OpenOutcome } from "./context";
import {
  type ObservationIdentity,
  packageSwitchProblem,
  recoveryProblem,
  validateRecoveredPackage,
} from "./ownership";
import { offersRound } from "./round-forms";

type Input = {
  readonly database: LocalDatabase;
  readonly key: string;
  readonly identity: RefObject<ObservationIdentity | null>;
  readonly current: () => boolean;
  readonly recovered: ObservationDraft | null;
  readonly sites: Readonly<Record<string, readonly HostedSite[]>>;
  readonly installed: readonly InstalledVersion[];
  readonly zone: SiteZone | null;
  readonly roundType: RoundType;
  readonly freshPeriod: boolean;
  readonly opened: (
    site: SitePackage,
    zone: SiteZone,
    context: RoundContext,
    draft?: ObservationDraft,
  ) => void;
  readonly setRecovered: (draft: ObservationDraft | null) => void;
  readonly setUnreadableDraft: (value: boolean) => void;
  readonly setStatus: (message: string) => void;
};
export function packageActions(input: Input) {
  const {
    database,
    key,
    identity,
    current,
    recovered,
    sites,
    installed,
    zone,
    roundType,
    freshPeriod,
    opened,
    setRecovered,
    setStatus,
    setUnreadableDraft,
  } = input;
  async function openPackage(id: string): Promise<OpenOutcome> {
    if (!current()) return { ok: false, reason: "The account changed while opening the map." };
    const open = identity.current;
    const blocked = packageSwitchProblem(open, id);
    if (blocked !== null) return { ok: false, reason: blocked };
    const saved = await readDraft(database, key);
    if ((!saved && (await hasDraft(database, key))) || (saved && saved.id !== open?.id))
      return { ok: false, reason: "Resume or discard the unfinished observation first." };
    const available = Object.entries(sites)
      .flatMap(([projectId, list]) => list.map((site) => ({ projectId, site })))
      .find(({ site }) => site.package?.package_id === id);
    const newest =
      !open && available
        ? installed
            .filter(
              (entry) =>
                entry.status === "verified" &&
                entry.identity.projectId === available.projectId &&
                entry.identity.siteId === available.site.site_id,
            )
            .sort((a, b) => b.identity.packageVersion - a.identity.packageVersion)[0]
        : null;
    const result = await openSitePackage(!open && newest ? newest.identity.packageId : id);
    if (!current()) return { ok: false, reason: "The account changed while opening the map." };
    if (!result) return { ok: false, reason: "That exact package could not be opened." };
    if (result.projectId !== undefined && !open)
      return {
        ok: false,
        reason:
          "This map requires boundary-aware collection, which is not enabled in this build yet. Its verified download is retained.",
      };
    const selected = result.zones.find((entry) => entry.id === zone?.id) ?? result.zones[0] ?? null;
    if (!selected) return { ok: false, reason: "The map has no usable zones." };
    const nextRound = offersRound(result, roundType) ? roundType : "standard";
    const context: RoundContext = {
      packageId: result.id,
      packageVersion: result.version,
      zoneId: selected.id,
      zoneLabel: selected.label,
      roundType: nextRound,
      freshPeriod,
      inheritedFrom: freshPeriod ? "" : result.inheritedContext,
    };
    if (!current()) return { ok: false, reason: "The account changed while opening the map." };
    opened(result, selected, context);
    return { ok: true, sitePackage: result };
  }
  async function resumeRecovered(): Promise<SitePackage | undefined> {
    const draft = recovered;
    if (!draft || !current()) return undefined;
    const wrongAccount = recoveryProblem(draft.owner, key);
    if (wrongAccount !== null) {
      setRecovered(null);
      setStatus(wrongAccount);
      return undefined;
    }
    const result = await openSitePackage(draft.packageId);
    if (!current()) return undefined;
    if (!result) {
      setStatus(
        "That draft belongs to a package this device no longer has. Its answers are retained.",
      );
      return undefined;
    }
    const problem = validateRecoveredPackage(draft, result);
    const selected = result.zones.find((entry) => entry.id === draft.context.zoneId);
    if (problem || !selected) {
      setStatus(
        `The exact draft ${problem ?? "zone_missing"} must be recovered. Answers stay on this device.`,
      );
      return undefined;
    }
    if (!current()) return undefined;
    opened(result, selected, draft.context, draft);
    setRecovered(null);
    setStatus("Draft restored — the original map, zone and answers were retained.");
    return result;
  }
  async function discardRecovered(): Promise<void> {
    if (!current()) return;
    try {
      await clearDraft(database, key);
    } catch (error) {
      if (error instanceof Error && current())
        setStatus("The draft could not be discarded. It stays on this device.");
      throw error;
    }
    if (current()) {
      setUnreadableDraft(false);
      setRecovered(null);
      setStatus("Draft discarded.");
    }
  }
  return { openPackage, resumeRecovered, discardRecovered };
}
